-- ============================================================
-- SIR·TECH POS · 10 · Accesorios e inventario FIFO
--
-- Ejecutar después de 08_servicios.sql y 09_quitar_recibido.sql.
-- Crea catálogo, lotes, ventas, pagos, garantías y funciones FIFO.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Normalización de nombres de productos
-- ------------------------------------------------------------
create or replace function public.norm_producto(t text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    upper(translate(coalesce(t, ''),
      'ÁÉÍÓÚÜÑáéíóúüñ',
      'AEIOUUNaeiouun')),
    '[^A-Z0-9]+', ' ', 'g'));
$$;

create unique index if not exists productos_norm_uq
  on public.productos (public.norm_producto(nombre));

alter table public.productos
  add column if not exists costo_referencia numeric(12,2) not null default 0,
  add column if not exists proveedor text;

-- ------------------------------------------------------------
-- 2. Tablas
-- ------------------------------------------------------------
create table if not exists public.producto_lotes (
  id                bigserial primary key,
  producto_id       bigint not null references public.productos(id) on delete cascade,
  fecha             date not null default current_date,
  cantidad_inicial  numeric(12,2) not null check (cantidad_inicial > 0),
  cantidad_restante numeric(12,2) not null check (cantidad_restante >= 0),
  costo_unitario    numeric(12,2) not null check (costo_unitario >= 0),
  proveedor         text,
  nota              text,
  creado_por        uuid references auth.users(id) on delete set null,
  creado_en         timestamptz not null default now()
);

create index if not exists producto_lotes_fifo_idx
  on public.producto_lotes (producto_id, fecha, id);

create sequence if not exists public.accesorio_ventas_numero_seq;

create table if not exists public.accesorio_ventas (
  id             bigserial primary key,
  numero         integer not null unique default nextval('public.accesorio_ventas_numero_seq'),
  fecha          timestamptz not null default now(),
  cliente_id     bigint references public.clientes(id) on delete set null,
  cliente_nombre text,
  total          numeric(12,2) not null default 0,
  descuento      numeric(12,2) not null default 0,
  envio          numeric(12,2) not null default 0,
  gastos         numeric(12,2) not null default 0,
  costo_total    numeric(12,2) not null default 0,
  ganancia       numeric(12,2) generated always as (total - costo_total - envio - gastos) stored,
  pagado         numeric(12,2) not null default 0,
  saldo          numeric(12,2) not null default 0,
  estado         text not null default 'pagada'
                 check (estado in ('pagada','por_pagar','cancelada','garantia')),
  historico      boolean not null default false,
  notas          text,
  creado_por     uuid references auth.users(id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.accesorio_venta_items (
  id              bigserial primary key,
  venta_id        bigint not null references public.accesorio_ventas(id) on delete cascade,
  producto_id     bigint references public.productos(id) on delete set null,
  descripcion     text not null,
  cantidad        numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null default 0,
  costo_unitario  numeric(12,2) not null default 0,
  costo_total     numeric(12,2) not null default 0,
  historico       boolean not null default false
);

create table if not exists public.accesorio_venta_lotes (
  id             bigserial primary key,
  venta_item_id  bigint not null references public.accesorio_venta_items(id) on delete cascade,
  lote_id        bigint references public.producto_lotes(id) on delete set null,
  cantidad       numeric(12,2) not null check (cantidad > 0),
  costo_unitario numeric(12,2) not null default 0
);

create table if not exists public.accesorio_pagos (
  id         bigserial primary key,
  venta_id   bigint not null references public.accesorio_ventas(id) on delete cascade,
  fecha      timestamptz not null default now(),
  monto      numeric(12,2) not null check (monto > 0),
  metodo     text not null default 'efectivo'
             check (metodo in ('efectivo','transferencia','tarjeta','nequi','otro')),
  nota       text,
  usuario    uuid references auth.users(id) on delete set null,
  creado_en  timestamptz not null default now()
);

create table if not exists public.accesorio_movimientos (
  id             bigserial primary key,
  producto_id    bigint not null references public.productos(id) on delete cascade,
  fecha          timestamptz not null default now(),
  tipo           text not null
                 check (tipo in ('ingreso','venta','garantia_salida','garantia_reemplazo','ajuste')),
  cantidad       numeric(12,2) not null,
  costo_unitario numeric(12,2) not null default 0,
  referencia_id  bigint,
  nota           text,
  usuario        uuid references auth.users(id) on delete set null,
  creado_en      timestamptz not null default now()
);

create table if not exists public.accesorio_garantias (
  id                    bigserial primary key,
  fecha                 timestamptz not null default now(),
  venta_id              bigint references public.accesorio_ventas(id) on delete set null,
  producto_id           bigint not null references public.productos(id) on delete restrict,
  cantidad              numeric(12,2) not null default 1 check (cantidad > 0),
  origen                text not null check (origen in ('post_venta','tienda')),
  motivo                text,
  producto_reemplazo_id bigint references public.productos(id) on delete restrict,
  cantidad_reemplazo    numeric(12,2) not null default 0,
  costo_defectuoso      numeric(12,2) not null default 0,
  costo_reemplazo       numeric(12,2) not null default 0,
  estado                text not null default 'registrada'
                        check (estado in ('registrada','reemplazada','rechazada')),
  notas                 text,
  usuario               uuid references auth.users(id) on delete set null,
  creado_en             timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. Recalcular ventas
-- ------------------------------------------------------------
create or replace function public.trg_accesorio_recalc()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_id      bigint;
  v_total   numeric(12,2);
  v_costo   numeric(12,2);
  v_pagado  numeric(12,2);
  v_neto    numeric(12,2);
begin
  v_id := coalesce(new.venta_id, old.venta_id);

  select coalesce(sum(precio_unitario * cantidad), 0),
         coalesce(sum(costo_total), 0)
    into v_total, v_costo
    from public.accesorio_venta_items
   where venta_id = v_id;

  select coalesce(sum(monto), 0)
    into v_pagado
    from public.accesorio_pagos
   where venta_id = v_id;

  v_neto := v_total;

  update public.accesorio_ventas
     set total = v_neto - descuento,
         costo_total = v_costo,
         pagado = v_pagado,
         saldo = (v_neto - descuento) - v_pagado,
         estado = case
                    when (v_neto - descuento) - v_pagado > 0.5 then 'por_pagar'
                    else 'pagada'
                  end,
         actualizado_en = now()
   where id = v_id
     and estado <> 'cancelada';

  return null;
end $$;

drop trigger if exists acc_items_recalc on public.accesorio_venta_items;
create trigger acc_items_recalc
  after insert or update or delete on public.accesorio_venta_items
  for each row execute function public.trg_accesorio_recalc();

drop trigger if exists acc_pagos_recalc on public.accesorio_pagos;
create trigger acc_pagos_recalc
  after insert or update or delete on public.accesorio_pagos
  for each row execute function public.trg_accesorio_recalc();

-- ------------------------------------------------------------
-- 4. FIFO
-- ------------------------------------------------------------
create or replace function public.consumir_fifo(p_producto_id bigint, p_cantidad numeric)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r          record;
  v_falta    numeric(12,2) := p_cantidad;
  v_tomar    numeric(12,2);
  v_costo    numeric(12,2) := 0;
  v_lotes    jsonb := '[]'::jsonb;
  v_stock    numeric(12,2);
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;

  perform 1 from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'El producto % no existe', p_producto_id;
  end if;

  select coalesce(sum(cantidad_restante), 0)
    into v_stock
    from public.producto_lotes
   where producto_id = p_producto_id and cantidad_restante > 0;

  if v_stock < p_cantidad then
    raise exception 'Stock insuficiente del producto %: hay % y se necesitan %',
      p_producto_id, v_stock, p_cantidad;
  end if;

  for r in
    select id, cantidad_restante, costo_unitario
      from public.producto_lotes
     where producto_id = p_producto_id and cantidad_restante > 0
     order by fecha, id
     for update
  loop
    exit when v_falta <= 0;
    v_tomar := least(r.cantidad_restante, v_falta);
    update public.producto_lotes
       set cantidad_restante = cantidad_restante - v_tomar
     where id = r.id;

    v_costo := v_costo + (v_tomar * r.costo_unitario);
    v_falta := v_falta - v_tomar;

    v_lotes := v_lotes || jsonb_build_array(jsonb_build_object(
      'lote_id', r.id,
      'cantidad', v_tomar,
      'costo_unitario', r.costo_unitario
    ));
  end loop;

  update public.productos p
     set stock = (select coalesce(sum(cantidad_restante), 0)
                    from public.producto_lotes
                   where producto_id = p.id)
   where p.id = p_producto_id;

  return jsonb_build_object('costo_total', v_costo, 'lotes', v_lotes);
end $$;

revoke all on function public.consumir_fifo(bigint, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Ingresar lote / producto
-- ------------------------------------------------------------
create or replace function public.ingresar_lote(p_producto jsonb, p_lote jsonb)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_id      bigint;
  v_nombre  text := trim(coalesce(p_producto->>'nombre', ''));
  v_costo   numeric(12,2) := coalesce((p_lote->>'costo_unitario')::numeric, 0);
  v_cant    numeric(12,2) := coalesce((p_lote->>'cantidad')::numeric, 0);
  v_precio  numeric(12,2) := coalesce(nullif((p_producto->>'precio')::numeric, 0), 0);
  v_prov    text := nullif(trim(coalesce(p_lote->>'proveedor', '')), '');
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if v_nombre = '' then
    raise exception 'Escribe el nombre del producto';
  end if;
  if v_cant <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;
  if v_costo < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  select id into v_id
    from public.productos
   where public.norm_producto(nombre) = public.norm_producto(v_nombre)
   limit 1;

  if v_id is null then
    insert into public.productos (nombre, categoria, costo, costo_referencia, precio, stock, activo)
    values (v_nombre,
            coalesce(nullif(trim(coalesce(p_producto->>'categoria', '')), ''), 'General'),
            v_costo, v_costo, v_precio, 0, true)
    returning id into v_id;
  end if;

  insert into public.producto_lotes
    (producto_id, fecha, cantidad_inicial, cantidad_restante, costo_unitario, proveedor, nota, creado_por)
  values
    (v_id,
     coalesce(nullif(p_lote->>'fecha', '')::date, current_date),
     v_cant, v_cant, v_costo, v_prov,
     nullif(trim(coalesce(p_lote->>'nota', '')), ''),
     auth.uid());

  update public.productos p
     set stock = (select coalesce(sum(cantidad_restante), 0)
                    from public.producto_lotes
                   where producto_id = p.id),
         costo = v_costo,
         costo_referencia = (select case
                               when coalesce(sum(cantidad_restante), 0) > 0
                               then sum(cantidad_restante * costo_unitario) / sum(cantidad_restante)
                               else v_costo
                             end
                               from public.producto_lotes
                              where producto_id = p.id),
         precio = case when v_precio > 0 then v_precio else p.precio end,
         proveedor = coalesce(v_prov, p.proveedor)
   where p.id = v_id;

  insert into public.accesorio_movimientos
    (producto_id, tipo, cantidad, costo_unitario, nota, usuario)
  values
    (v_id, 'ingreso', v_cant, v_costo,
     nullif(trim(coalesce(p_lote->>'nota', '')), ''), auth.uid());

  return v_id;
end $$;

revoke all on function public.ingresar_lote(jsonb, jsonb) from public, anon;
grant execute on function public.ingresar_lote(jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 6. Vender accesorios (FIFO atómico)
-- ------------------------------------------------------------
create or replace function public.vender_accesorios(
  p_venta jsonb,
  p_items jsonb,
  p_pagos jsonb
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_venta   bigint;
  v_item    jsonb;
  v_pago    jsonb;
  v_prod    bigint;
  v_cant    numeric(12,2);
  v_precio  numeric(12,2);
  v_nombre  text;
  v_fifo    jsonb;
  v_costo   numeric(12,2);
  v_item_id bigint;
  v_lote    jsonb;
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto';
  end if;

  insert into public.accesorio_ventas
    (fecha, cliente_id, cliente_nombre, descuento, envio, gastos, notas, creado_por)
  values
    (coalesce(nullif(p_venta->>'fecha', '')::timestamptz, now()),
     nullif(p_venta->>'cliente_id', '')::bigint,
     nullif(trim(coalesce(p_venta->>'cliente_nombre', '')), ''),
     coalesce((p_venta->>'descuento')::numeric, 0),
     coalesce((p_venta->>'envio')::numeric, 0),
     coalesce((p_venta->>'gastos')::numeric, 0),
     nullif(trim(coalesce(p_venta->>'notas', '')), ''),
     auth.uid())
  returning id into v_venta;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_prod := (v_item->>'producto_id')::bigint;
    v_cant := coalesce((v_item->>'cantidad')::numeric, 1);
    v_precio := coalesce((v_item->>'precio_unitario')::numeric, 0);

    select nombre into v_nombre from public.productos where id = v_prod;
    if v_nombre is null then
      raise exception 'Producto % no encontrado', v_prod;
    end if;

    v_fifo := public.consumir_fifo(v_prod, v_cant);
    v_costo := coalesce((v_fifo->>'costo_total')::numeric, 0);

    insert into public.accesorio_venta_items
      (venta_id, producto_id, descripcion, cantidad, precio_unitario,
       costo_unitario, costo_total)
    values
      (v_venta, v_prod, v_nombre, v_cant, v_precio,
       case when v_cant > 0 then v_costo / v_cant else 0 end, v_costo)
    returning id into v_item_id;

    for v_lote in select * from jsonb_array_elements(v_fifo->'lotes')
    loop
      insert into public.accesorio_venta_lotes
        (venta_item_id, lote_id, cantidad, costo_unitario)
      values
        (v_item_id,
         (v_lote->>'lote_id')::bigint,
         (v_lote->>'cantidad')::numeric,
         (v_lote->>'costo_unitario')::numeric);
    end loop;

    insert into public.accesorio_movimientos
      (producto_id, tipo, cantidad, costo_unitario, referencia_id, nota, usuario)
    values
      (v_prod, 'venta', -v_cant,
       case when v_cant > 0 then v_costo / v_cant else 0 end,
       v_venta, 'Venta de accesorio', auth.uid());
  end loop;

  if p_pagos is not null then
    for v_pago in select * from jsonb_array_elements(p_pagos)
    loop
      if coalesce((v_pago->>'monto')::numeric, 0) > 0 then
        insert into public.accesorio_pagos
          (venta_id, fecha, monto, metodo, nota, usuario)
        values
          (v_venta,
           coalesce(nullif(v_pago->>'fecha', '')::timestamptz, now()),
           (v_pago->>'monto')::numeric,
           coalesce(nullif(v_pago->>'metodo', ''), 'efectivo'),
           nullif(trim(coalesce(v_pago->>'nota', '')), ''),
           auth.uid());
      end if;
    end loop;
  end if;

  return v_venta;
end $$;

revoke all on function public.vender_accesorios(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.vender_accesorios(jsonb, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 7. Garantías
-- ------------------------------------------------------------
create or replace function public.registrar_garantia_accesorio(p jsonb)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_id       bigint;
  v_prod     bigint := (p->>'producto_id')::bigint;
  v_cant     numeric(12,2) := coalesce((p->>'cantidad')::numeric, 1);
  v_origen   text := coalesce(nullif(p->>'origen', ''), 'post_venta');
  v_reempl   bigint := nullif(p->>'producto_reemplazo_id', '')::bigint;
  v_cant_re  numeric(12,2) := coalesce((p->>'cantidad_reemplazo')::numeric, 0);
  v_fifo     jsonb;
  v_costo_def numeric(12,2) := 0;
  v_costo_rep numeric(12,2) := 0;
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if v_cant <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;
  if v_origen not in ('post_venta','tienda') then
    raise exception 'Origen inválido';
  end if;

  if v_origen = 'tienda' then
    v_fifo := public.consumir_fifo(v_prod, v_cant);
    v_costo_def := coalesce((v_fifo->>'costo_total')::numeric, 0);
    insert into public.accesorio_movimientos
      (producto_id, tipo, cantidad, costo_unitario, nota, usuario)
    values
      (v_prod, 'garantia_salida', -v_cant,
       case when v_cant > 0 then v_costo_def / v_cant else 0 end,
       'Salida por garantía en tienda', auth.uid());
  end if;

  if v_reempl is not null and v_cant_re > 0 then
    v_fifo := public.consumir_fifo(v_reempl, v_cant_re);
    v_costo_rep := coalesce((v_fifo->>'costo_total')::numeric, 0);
    insert into public.accesorio_movimientos
      (producto_id, tipo, cantidad, costo_unitario, nota, usuario)
    values
      (v_reempl, 'garantia_reemplazo', -v_cant_re,
       case when v_cant_re > 0 then v_costo_rep / v_cant_re else 0 end,
       'Reemplazo entregado por garantía', auth.uid());
  end if;

  insert into public.accesorio_garantias
    (fecha, venta_id, producto_id, cantidad, origen, motivo,
     producto_reemplazo_id, cantidad_reemplazo, costo_defectuoso,
     costo_reemplazo, estado, notas, usuario)
  values
    (coalesce(nullif(p->>'fecha', '')::timestamptz, now()),
     nullif(p->>'venta_id', '')::bigint,
     v_prod, v_cant, v_origen,
     nullif(trim(coalesce(p->>'motivo', '')), ''),
     v_reempl, v_cant_re, v_costo_def, v_costo_rep,
     case when v_reempl is not null and v_cant_re > 0 then 'reemplazada' else 'registrada' end,
     nullif(trim(coalesce(p->>'notas', '')), ''),
     auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.registrar_garantia_accesorio(jsonb) from public, anon;
grant execute on function public.registrar_garantia_accesorio(jsonb) to authenticated;

-- ------------------------------------------------------------
-- 8. Vistas
-- ------------------------------------------------------------
drop view if exists public.v_accesorio_stock;
create view public.v_accesorio_stock
with (security_invoker = true) as
select p.id,
       p.nombre,
       p.categoria,
       p.precio,
       p.stock,
       p.stock_minimo,
       p.activo,
       coalesce(sum(l.cantidad_restante), 0) as stock_lotes,
       case
         when coalesce(sum(l.cantidad_restante), 0) > 0
         then sum(l.cantidad_restante * l.costo_unitario) / sum(l.cantidad_restante)
         else p.costo
       end as costo_promedio
  from public.productos p
  left join public.producto_lotes l
    on l.producto_id = p.id and l.cantidad_restante > 0
 group by p.id;

drop view if exists public.v_accesorio_ventas;
create view public.v_accesorio_ventas
with (security_invoker = true) as
select v.*,
       case when v.saldo > 0.5 then 'por_pagar' else 'pagada' end as estado_pago
  from public.accesorio_ventas v;

-- ------------------------------------------------------------
-- 9. Seguridad
-- ------------------------------------------------------------
alter table public.producto_lotes          enable row level security;
alter table public.accesorio_ventas        enable row level security;
alter table public.accesorio_venta_items   enable row level security;
alter table public.accesorio_venta_lotes   enable row level security;
alter table public.accesorio_pagos         enable row level security;
alter table public.accesorio_movimientos   enable row level security;
alter table public.accesorio_garantias     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'producto_lotes','accesorio_ventas','accesorio_venta_items',
    'accesorio_venta_lotes','accesorio_pagos','accesorio_movimientos',
    'accesorio_garantias'
  ] loop
    execute format('drop policy if exists staff_%s on public.%I', t, t);
    execute format('create policy staff_%s on public.%I for all to authenticated using (public.es_staff()) with check (public.es_staff())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

grant usage, select on sequence public.producto_lotes_id_seq to authenticated;
grant usage, select on sequence public.accesorio_ventas_id_seq to authenticated;
grant usage, select on sequence public.accesorio_venta_items_id_seq to authenticated;
grant usage, select on sequence public.accesorio_venta_lotes_id_seq to authenticated;
grant usage, select on sequence public.accesorio_pagos_id_seq to authenticated;
grant usage, select on sequence public.accesorio_movimientos_id_seq to authenticated;
grant usage, select on sequence public.accesorio_garantias_id_seq to authenticated;
grant usage, select on sequence public.accesorio_ventas_numero_seq to authenticated;

revoke all on public.v_accesorio_stock from anon;
revoke all on public.v_accesorio_ventas from anon;
grant select on public.v_accesorio_stock to authenticated;
grant select on public.v_accesorio_ventas to authenticated;
