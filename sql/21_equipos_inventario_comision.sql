-- ============================================================
-- SIR·TECH POS · 21 · Inventario ampliado y comisión automática
--
-- Ejecutar después de 20_financiamiento_automatico.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Inventario: identificación, proveedor y serial
-- ------------------------------------------------------------
alter table public.equipos_unidades
  add column if not exists imei_1 text,
  add column if not exists imei_2 text,
  add column if not exists serial_number text,
  add column if not exists vendor_name text,
  add column if not exists vendor_contact text;

-- Los equipos históricos guardaron el IMEI en la columna vieja `imei`.
update public.equipos_unidades
   set imei_1 = imei
 where imei_1 is null
   and imei is not null
   and trim(imei) <> '';

-- Un IMEI no se puede repetir. Los equipos históricos sin IMEI quedan fuera
-- del índice porque la columna es opcional en la base de datos.
create unique index if not exists equipos_unidades_imei_1_uidx
  on public.equipos_unidades (imei_1)
  where imei_1 is not null and imei_1 <> '';

-- ------------------------------------------------------------
-- Gastos por equipo de inventario
-- ------------------------------------------------------------
create table if not exists public.equipo_unidad_gastos (
  id          bigserial primary key,
  unidad_id   bigint not null references public.equipos_unidades(id) on delete cascade,
  descripcion text not null,
  valor       numeric(12,2) not null default 0 check (valor >= 0),
  creado_en   timestamptz not null default now()
);

create index if not exists equipo_unidad_gastos_unidad_idx
  on public.equipo_unidad_gastos (unidad_id);

alter table public.equipo_unidad_gastos enable row level security;

drop policy if exists staff_equipo_unidad_gastos on public.equipo_unidad_gastos;
create policy staff_equipo_unidad_gastos on public.equipo_unidad_gastos
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

grant select, insert, update, delete on public.equipo_unidad_gastos to authenticated;
revoke all on public.equipo_unidad_gastos from anon;
grant usage, select on sequence public.equipo_unidad_gastos_id_seq to authenticated;

-- ------------------------------------------------------------
-- Guardar equipo + gastos en una sola transacción
-- ------------------------------------------------------------
create or replace function public.guardar_equipo_unidad(
  p_unidad jsonb,
  p_gastos jsonb
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_id     bigint := nullif(p_unidad->>'id', '')::bigint;
  v_imei   text := nullif(trim(coalesce(p_unidad->>'imei_1', '')), '');
  v_modelo text := nullif(trim(coalesce(p_unidad->>'modelo', '')), '');
  v_g      jsonb;
  v_desc   text;
  v_valor  numeric(12,2);
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if v_imei is null then
    raise exception 'El IMEI 1 es obligatorio';
  end if;
  if v_modelo is null then
    raise exception 'El modelo es obligatorio';
  end if;

  if v_id is null then
    insert into public.equipos_unidades
      (imei, imei_1, imei_2, serial_number, modelo, cpu, ram, almacenamiento,
       color, costo, precio_sugerido, estado, origen, de_quien_es,
       vendor_name, vendor_contact, notas, creado_por)
    values
      (v_imei, v_imei,
       nullif(trim(coalesce(p_unidad->>'imei_2', '')), ''),
       nullif(trim(coalesce(p_unidad->>'serial_number', '')), ''),
       v_modelo,
       nullif(trim(coalesce(p_unidad->>'cpu', '')), ''),
       nullif(trim(coalesce(p_unidad->>'ram', '')), ''),
       nullif(trim(coalesce(p_unidad->>'almacenamiento', '')), ''),
       nullif(trim(coalesce(p_unidad->>'color', '')), ''),
       coalesce(nullif(p_unidad->>'costo', '')::numeric, 0),
       coalesce(nullif(p_unidad->>'precio_sugerido', '')::numeric, 0),
       coalesce(nullif(p_unidad->>'estado', ''), 'disponible'),
       coalesce(nullif(p_unidad->>'origen', ''), 'SNEIDER'),
       nullif(trim(coalesce(p_unidad->>'de_quien_es', '')), ''),
       nullif(trim(coalesce(p_unidad->>'vendor_name', '')), ''),
       nullif(trim(coalesce(p_unidad->>'vendor_contact', '')), ''),
       nullif(trim(coalesce(p_unidad->>'notas', '')), ''),
       auth.uid())
    returning id into v_id;
  else
    update public.equipos_unidades
       set imei           = v_imei,
           imei_1         = v_imei,
           imei_2         = nullif(trim(coalesce(p_unidad->>'imei_2', '')), ''),
           serial_number  = nullif(trim(coalesce(p_unidad->>'serial_number', '')), ''),
           modelo         = v_modelo,
           cpu            = nullif(trim(coalesce(p_unidad->>'cpu', '')), ''),
           ram            = nullif(trim(coalesce(p_unidad->>'ram', '')), ''),
           almacenamiento = nullif(trim(coalesce(p_unidad->>'almacenamiento', '')), ''),
           color          = nullif(trim(coalesce(p_unidad->>'color', '')), ''),
           costo          = coalesce(nullif(p_unidad->>'costo', '')::numeric, 0),
           precio_sugerido = coalesce(nullif(p_unidad->>'precio_sugerido', '')::numeric, 0),
           estado         = coalesce(nullif(p_unidad->>'estado', ''), estado),
           origen         = coalesce(nullif(p_unidad->>'origen', ''), origen),
           de_quien_es    = nullif(trim(coalesce(p_unidad->>'de_quien_es', '')), ''),
           vendor_name    = nullif(trim(coalesce(p_unidad->>'vendor_name', '')), ''),
           vendor_contact = nullif(trim(coalesce(p_unidad->>'vendor_contact', '')), ''),
           notas          = nullif(trim(coalesce(p_unidad->>'notas', '')), ''),
           actualizado_en = now()
     where id = v_id;

    if not found then
      raise exception 'Equipo no encontrado';
    end if;
  end if;

  delete from public.equipo_unidad_gastos where unidad_id = v_id;

  if p_gastos is not null and jsonb_typeof(p_gastos) = 'array' then
    for v_g in select * from jsonb_array_elements(p_gastos)
    loop
      v_desc  := nullif(trim(coalesce(v_g->>'descripcion', '')), '');
      v_valor := coalesce(nullif(v_g->>'valor', '')::numeric, 0);

      if v_desc is not null then
        insert into public.equipo_unidad_gastos (unidad_id, descripcion, valor)
        values (v_id, v_desc, greatest(v_valor, 0));
      end if;
    end loop;
  end if;

  return v_id;
end $$;

revoke all on function public.guardar_equipo_unidad(jsonb, jsonb) from public, anon;
grant execute on function public.guardar_equipo_unidad(jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Comisión automática: solo Sociedad + Gamboa = 4% del total
-- ------------------------------------------------------------
-- Refuerzo en la base de datos: se aplica al crear una venta y al cambiar
-- explícitamente el origen o el propietario. Las ventas históricas no se tocan.
create or replace function public.trg_equipo_venta_comision()
returns trigger
language plpgsql
as $$
begin
  if new.historico then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.origen is not distinct from old.origen
     and coalesce(new.de_quien_es, '') = coalesce(old.de_quien_es, '') then
    return new;
  end if;

  new.comision := case
                    when new.origen = 'SOCIEDAD'
                     and upper(trim(coalesce(new.de_quien_es, ''))) = 'GAMBOA'
                      then round(new.total * 0.04)
                    else 0
                  end;
  return new;
end $$;

drop trigger if exists equipo_venta_comision on public.equipo_ventas;
create trigger equipo_venta_comision
  before insert or update on public.equipo_ventas
  for each row execute function public.trg_equipo_venta_comision();

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
  v_primer   date;
  v_fecha_c  date;
  v_suma     numeric(12,2);
  v_monto    numeric(12,2);
  v_origen   text;
  v_dequien  text;
  v_comision numeric(12,2);
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

  v_origen  := coalesce(nullif(trim(coalesce(p_venta->>'origen', '')), ''), 'SNEIDER');
  v_dequien := nullif(upper(trim(coalesce(p_venta->>'de_quien_es', ''))), '');
  v_comision := case
                  when v_origen = 'SOCIEDAD' and v_dequien = 'GAMBOA'
                    then round(v_total * 0.04)
                  else 0
                end;

  v_primer := coalesce(
    nullif(p_venta->>'primer_pago', '')::date,
    (v_fecha at time zone 'America/Bogota')::date + interval '1 month'
  );

  insert into public.equipo_ventas
    (fecha, unidad_id, equipo, cpu, ram, almacenamiento, detalles, vendedor,
     comprador, cliente_id, contacto, total, precio_contado, costo, comision,
     envio, gastos, inicial, numero_cuotas, valor_cuota, primer_pago,
     dia_limite, estado_equipo, origen, de_quien_es, notas, creado_por)
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
     coalesce((p_venta->>'precio_contado')::numeric, v_total),
     coalesce((p_venta->>'costo')::numeric, 0),
     v_comision,
     coalesce((p_venta->>'envio')::numeric, 0),
     coalesce((p_venta->>'gastos')::numeric, 0),
     v_inicial, v_n, v_valor,
     case when v_n > 0 then v_primer else null end,
     coalesce((p_venta->>'dia_limite')::integer, 5),
     coalesce(nullif(p_venta->>'estado_equipo', ''), 'vendido'),
     v_origen,
     v_dequien,
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
        v_fecha_c := (v_primer + ((i - 1) || ' months')::interval)::date;
        insert into public.equipo_cuotas
          (venta_id, numero, fecha_vencimiento, monto)
        values
          (v_venta, i, v_fecha_c, v_monto);
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

-- Para que Supabase/PostgREST reconozca de inmediato la tabla y las columnas nuevas.
notify pgrst, 'reload schema';
