-- ============================================================
-- SIR·TECH POS · 11 · Equipos, inventario y créditos
--
-- Ejecutar después de 10_accesorios.sql.
-- ============================================================

create sequence if not exists public.equipo_ventas_numero_seq;

create table if not exists public.equipos_unidades (
  id              bigserial primary key,
  imei            text unique,
  modelo          text not null,
  cpu             text,
  ram             text,
  almacenamiento  text,
  color           text,
  costo           numeric(12,2) not null default 0,
  precio_sugerido numeric(12,2) not null default 0,
  estado          text not null default 'disponible'
                  check (estado in ('disponible','en_reparacion','consignacion','vendido','garantia','devuelto')),
  origen          text not null default 'SNEIDER'
                  check (origen in ('SNEIDER','SOCIEDAD')),
  de_quien_es     text,
  proveedor       text,
  notas           text,
  historico       boolean not null default false,
  creado_por      uuid references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.equipo_ventas (
  id               bigserial primary key,
  numero           integer not null unique default nextval('public.equipo_ventas_numero_seq'),
  fecha            timestamptz not null default now(),
  unidad_id        bigint references public.equipos_unidades(id) on delete set null,
  equipo           text not null,
  cpu              text,
  ram              text,
  almacenamiento   text,
  detalles         text,
  vendedor         text,
  comprador        text,
  cliente_id       bigint references public.clientes(id) on delete set null,
  contacto         text,
  total            numeric(12,2) not null default 0,
  costo            numeric(12,2) not null default 0,
  costo_agregados  numeric(12,2) not null default 0,
  comision         numeric(12,2) not null default 0,
  envio            numeric(12,2) not null default 0,
  gastos           numeric(12,2) not null default 0,
  ganancia         numeric(12,2) generated always as
                   (total - costo - costo_agregados - comision - envio - gastos) stored,
  inicial          numeric(12,2) not null default 0,
  numero_cuotas    integer not null default 0,
  valor_cuota      numeric(12,2) not null default 0,
  pagado           numeric(12,2) not null default 0,
  saldo            numeric(12,2) not null default 0,
  estado_pago      text not null default 'por_pagar'
                   check (estado_pago in ('pagada','por_pagar','cancelada')),
  estado_equipo    text not null default 'vendido',
  origen           text not null default 'SNEIDER'
                   check (origen in ('SNEIDER','SOCIEDAD')),
  de_quien_es      text,
  notas            text,
  historico        boolean not null default false,
  creado_por       uuid references auth.users(id) on delete set null,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create table if not exists public.equipo_cuotas (
  id               bigserial primary key,
  venta_id         bigint not null references public.equipo_ventas(id) on delete cascade,
  numero           integer not null,
  fecha_vencimiento date,
  monto            numeric(12,2) not null check (monto > 0),
  pagado           numeric(12,2) not null default 0,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','parcial','pagada')),
  unique (venta_id, numero)
);

create table if not exists public.equipo_pagos (
  id         bigserial primary key,
  venta_id   bigint not null references public.equipo_ventas(id) on delete cascade,
  cuota_id   bigint references public.equipo_cuotas(id) on delete set null,
  fecha      timestamptz not null default now(),
  monto      numeric(12,2) not null check (monto > 0),
  metodo     text not null default 'efectivo'
             check (metodo in ('efectivo','transferencia','tarjeta','nequi','otro')),
  tipo       text not null default 'abono'
             check (tipo in ('inicial','cuota','abono')),
  nota       text,
  usuario    uuid references auth.users(id) on delete set null,
  creado_en  timestamptz not null default now()
);

create table if not exists public.equipo_venta_agregados (
  id              bigserial primary key,
  venta_id        bigint not null references public.equipo_ventas(id) on delete cascade,
  producto_id     bigint references public.productos(id) on delete set null,
  descripcion     text not null,
  cantidad        numeric(12,2) not null default 1 check (cantidad > 0),
  precio_unitario numeric(12,2) not null default 0,
  costo_unitario  numeric(12,2) not null default 0,
  costo_total     numeric(12,2) not null default 0,
  historico       boolean not null default false
);

-- ------------------------------------------------------------
-- Cálculos
-- ------------------------------------------------------------
create or replace function public.trg_equipo_venta_calc()
returns trigger
language plpgsql
as $$
begin
  new.saldo := coalesce(new.total, 0) - coalesce(new.pagado, 0);
  if new.estado_pago <> 'cancelada' then
    new.estado_pago := case when new.saldo <= 0.5 then 'pagada' else 'por_pagar' end;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists equipo_venta_calc on public.equipo_ventas;
create trigger equipo_venta_calc
  before insert or update on public.equipo_ventas
  for each row execute function public.trg_equipo_venta_calc();

create or replace function public.trg_equipo_pago_recalc()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_venta bigint;
begin
  v_venta := coalesce(new.venta_id, old.venta_id);

  update public.equipo_cuotas c
     set pagado = coalesce((
           select sum(p.monto) from public.equipo_pagos p where p.cuota_id = c.id
         ), 0),
         estado = case
                    when coalesce((select sum(p.monto) from public.equipo_pagos p where p.cuota_id = c.id), 0) >= c.monto - 0.5 then 'pagada'
                    when coalesce((select sum(p.monto) from public.equipo_pagos p where p.cuota_id = c.id), 0) > 0 then 'parcial'
                    else 'pendiente'
                  end
   where c.venta_id = v_venta;

  update public.equipo_ventas
     set pagado = coalesce((select sum(p.monto) from public.equipo_pagos p where p.venta_id = v_venta), 0)
   where id = v_venta;

  return null;
end $$;

drop trigger if exists equipo_pagos_recalc on public.equipo_pagos;
create trigger equipo_pagos_recalc
  after insert or update or delete on public.equipo_pagos
  for each row execute function public.trg_equipo_pago_recalc();

-- ------------------------------------------------------------
-- Crear venta de equipo + cuotas + pagos + agregados
-- ------------------------------------------------------------
create or replace function public.crear_venta_equipo(
  p_venta jsonb,
  p_pagos jsonb,
  p_agregados jsonb
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_venta    bigint;
  v_total    numeric(12,2) := coalesce((p_venta->>'total')::numeric, 0);
  v_inicial  numeric(12,2) := coalesce((p_venta->>'inicial')::numeric, 0);
  v_n        integer := coalesce((p_venta->>'numero_cuotas')::integer, 0);
  v_valor    numeric(12,2) := coalesce((p_venta->>'valor_cuota')::numeric, 0);
  v_fecha    timestamptz := coalesce(nullif(p_venta->>'fecha', '')::timestamptz, now());
  v_suma     numeric(12,2);
  v_monto    numeric(12,2);
  i          integer;
  v_pago     jsonb;
  v_ag       jsonb;
  v_prod     bigint;
  v_cant     numeric(12,2);
  v_fifo     jsonb;
  v_costo    numeric(12,2);
  v_desc     text;
  v_precio   numeric(12,2);
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if v_total <= 0 then
    raise exception 'El total debe ser mayor a 0';
  end if;
  if v_inicial < 0 or v_inicial > v_total + 0.5 then
    raise exception 'El inicial no puede superar el total';
  end if;
  if v_n > 0 and v_valor <= 0 then
    raise exception 'Escribe el valor de la cuota';
  end if;

  insert into public.equipo_ventas
    (fecha, unidad_id, equipo, cpu, ram, almacenamiento, detalles, vendedor,
     comprador, cliente_id, contacto, total, costo, comision, envio, gastos,
     inicial, numero_cuotas, valor_cuota, estado_equipo, origen, de_quien_es,
     notas, creado_por)
  values
    (v_fecha,
     nullif(p_venta->>'unidad_id', '')::bigint,
     trim(coalesce(p_venta->>'equipo', 'Equipo')),
     nullif(trim(coalesce(p_venta->>'cpu', '')), ''),
     nullif(trim(coalesce(p_venta->>'ram', '')), ''),
     nullif(trim(coalesce(p_venta->>'almacenamiento', '')), ''),
     nullif(trim(coalesce(p_venta->>'detalles', '')), ''),
     nullif(trim(coalesce(p_venta->>'vendedor', '')), ''),
     nullif(trim(coalesce(p_venta->>'comprador', '')), ''),
     nullif(p_venta->>'cliente_id', '')::bigint,
     nullif(trim(coalesce(p_venta->>'contacto', '')), ''),
     v_total,
     coalesce((p_venta->>'costo')::numeric, 0),
     coalesce((p_venta->>'comision')::numeric, 0),
     coalesce((p_venta->>'envio')::numeric, 0),
     coalesce((p_venta->>'gastos')::numeric, 0),
     v_inicial, v_n, v_valor,
     coalesce(nullif(p_venta->>'estado_equipo', ''), 'vendido'),
     coalesce(nullif(p_venta->>'origen', ''), 'SNEIDER'),
     nullif(trim(coalesce(p_venta->>'de_quien_es', '')), ''),
     nullif(trim(coalesce(p_venta->>'notas', '')), ''),
     auth.uid())
  returning id into v_venta;

  if nullif(p_venta->>'unidad_id', '') is not null then
    update public.equipos_unidades
       set estado = 'vendido', actualizado_en = now()
     where id = (p_venta->>'unidad_id')::bigint;
  end if;

  if v_n > 0 then
    v_suma := v_inicial;
    for i in 1..v_n loop
      v_monto := case when i = v_n then greatest(v_total - v_suma, 0) else v_valor end;
      if v_monto > 0 then
        insert into public.equipo_cuotas
          (venta_id, numero, fecha_vencimiento, monto)
        values
          (v_venta, i,
           (v_fecha at time zone 'America/Bogota')::date + (i || ' months')::interval,
           v_monto);
        v_suma := v_suma + v_monto;
      end if;
    end loop;
  end if;

  if p_pagos is not null then
    for v_pago in select * from jsonb_array_elements(p_pagos)
    loop
      if coalesce((v_pago->>'monto')::numeric, 0) > 0 then
        insert into public.equipo_pagos
          (venta_id, cuota_id, fecha, monto, metodo, tipo, nota, usuario)
        values
          (v_venta,
           nullif(v_pago->>'cuota_id', '')::bigint,
           coalesce(nullif(v_pago->>'fecha', '')::timestamptz, v_fecha),
           (v_pago->>'monto')::numeric,
           coalesce(nullif(v_pago->>'metodo', ''), 'efectivo'),
           coalesce(nullif(v_pago->>'tipo', ''), 'abono'),
           nullif(trim(coalesce(v_pago->>'nota', '')), ''),
           auth.uid());
      end if;
    end loop;
  end if;

  if p_agregados is not null then
    for v_ag in select * from jsonb_array_elements(p_agregados)
    loop
      v_prod := nullif(v_ag->>'producto_id', '')::bigint;
      v_cant := coalesce((v_ag->>'cantidad')::numeric, 1);
      v_precio := coalesce((v_ag->>'precio_unitario')::numeric, 0);
      v_desc := nullif(trim(coalesce(v_ag->>'descripcion', '')), '');
      v_costo := 0;

      if v_prod is not null then
        select nombre into v_desc from public.productos where id = v_prod;
        v_fifo := public.consumir_fifo(v_prod, v_cant);
        v_costo := coalesce((v_fifo->>'costo_total')::numeric, 0);

        insert into public.accesorio_movimientos
          (producto_id, tipo, cantidad, costo_unitario, referencia_id, nota, usuario)
        values
          (v_prod, 'venta', -v_cant,
           case when v_cant > 0 then v_costo / v_cant else 0 end,
           v_venta, 'Agregado en venta de equipo', auth.uid());
      end if;

      if v_desc is not null then
        insert into public.equipo_venta_agregados
          (venta_id, producto_id, descripcion, cantidad, precio_unitario,
           costo_unitario, costo_total)
        values
          (v_venta, v_prod, v_desc, v_cant, v_precio,
           case when v_cant > 0 then v_costo / v_cant else 0 end, v_costo);
      end if;
    end loop;

    update public.equipo_ventas
       set costo_agregados = coalesce((
             select sum(costo_total) from public.equipo_venta_agregados where venta_id = v_venta
           ), 0)
     where id = v_venta;
  end if;

  return v_venta;
end $$;

revoke all on function public.crear_venta_equipo(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.crear_venta_equipo(jsonb, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Registrar pago / abono de equipo
-- ------------------------------------------------------------
create or replace function public.registrar_pago_equipo(
  p_venta_id bigint,
  p_cuota_id bigint,
  p_monto numeric,
  p_metodo text,
  p_fecha timestamptz,
  p_nota text
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_id      bigint;
  v_saldo   numeric(12,2);
  v_cuota   numeric(12,2);
  v_pagado  numeric(12,2);
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  select saldo into v_saldo from public.equipo_ventas where id = p_venta_id for update;
  if v_saldo is null then
    raise exception 'Venta no encontrada';
  end if;
  if p_monto > v_saldo + 0.5 then
    raise exception 'El pago supera el saldo pendiente (%)', v_saldo;
  end if;

  if p_cuota_id is not null then
    select monto, pagado into v_cuota, v_pagado
      from public.equipo_cuotas
     where id = p_cuota_id and venta_id = p_venta_id;
    if v_cuota is null then
      raise exception 'La cuota no pertenece a esta venta';
    end if;
    if p_monto > (v_cuota - v_pagado) + 0.5 then
      raise exception 'El pago supera el valor pendiente de la cuota';
    end if;
  end if;

  insert into public.equipo_pagos
    (venta_id, cuota_id, fecha, monto, metodo, tipo, nota, usuario)
  values
    (p_venta_id, p_cuota_id, coalesce(p_fecha, now()), p_monto,
     coalesce(nullif(p_metodo, ''), 'efectivo'),
     case when p_cuota_id is null then 'abono' else 'cuota' end,
     nullif(trim(coalesce(p_nota, '')), ''),
     auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.registrar_pago_equipo(bigint, bigint, numeric, text, timestamptz, text) from public, anon;
grant execute on function public.registrar_pago_equipo(bigint, bigint, numeric, text, timestamptz, text) to authenticated;

-- ------------------------------------------------------------
-- Vistas
-- ------------------------------------------------------------
-- Crear solo si no existe. Así se puede volver a ejecutar el 11 sin quitar
-- las columnas que agregan las migraciones 15 y 16.
do $$
begin
  if to_regclass('public.v_equipo_ventas') is null then
    execute $view$
      create view public.v_equipo_ventas
      with (security_invoker = true) as
      select v.*,
             case when v.saldo > 0.5 then 'por_pagar' else 'pagada' end as estado_pago_calc,
             (select count(*) from public.equipo_cuotas c
               where c.venta_id = v.id and c.estado <> 'pagada') as cuotas_pendientes
        from public.equipo_ventas v
    $view$;
  end if;
end $$;

-- ------------------------------------------------------------
-- Seguridad
-- ------------------------------------------------------------
alter table public.equipos_unidades       enable row level security;
alter table public.equipo_ventas          enable row level security;
alter table public.equipo_cuotas          enable row level security;
alter table public.equipo_pagos           enable row level security;
alter table public.equipo_venta_agregados enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'equipos_unidades','equipo_ventas','equipo_cuotas',
    'equipo_pagos','equipo_venta_agregados'
  ] loop
    execute format('drop policy if exists staff_%s on public.%I', t, t);
    execute format('create policy staff_%s on public.%I for all to authenticated using (public.es_staff()) with check (public.es_staff())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

grant usage, select on sequence public.equipos_unidades_id_seq to authenticated;
grant usage, select on sequence public.equipo_ventas_id_seq to authenticated;
grant usage, select on sequence public.equipo_ventas_numero_seq to authenticated;
grant usage, select on sequence public.equipo_cuotas_id_seq to authenticated;
grant usage, select on sequence public.equipo_pagos_id_seq to authenticated;
grant usage, select on sequence public.equipo_venta_agregados_id_seq to authenticated;

revoke all on public.v_equipo_ventas from anon;
grant select on public.v_equipo_ventas to authenticated;
