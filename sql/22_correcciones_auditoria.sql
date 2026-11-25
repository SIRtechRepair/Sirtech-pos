-- ============================================================
-- SIR·TECH POS · 22 · Correcciones de auditoría
--
-- Ejecutar después de 21_equipos_inventario_comision.sql.
-- Refuerza en la base de datos los topes de abonos que ya valida la app.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Ventas de accesorios: nunca cobrar más que el total
-- ------------------------------------------------------------
create or replace function public.trg_accesorio_venta_calc()
returns trigger
language plpgsql
as $$
declare
  v_total  numeric(12,2);
  v_costo  numeric(12,2);
  v_pagado numeric(12,2);
begin
  select coalesce(sum(precio_unitario * cantidad), 0),
         coalesce(sum(costo_total), 0)
    into v_total, v_costo
    from public.accesorio_venta_items
   where venta_id = new.id;

  select coalesce(sum(monto), 0)
    into v_pagado
    from public.accesorio_pagos
   where venta_id = new.id;

  if v_pagado > 0.5 and v_pagado > (v_total - coalesce(new.descuento, 0)) + 0.5 then
    raise exception 'Los abonos superan el total de la venta';
  end if;

  new.total := v_total - coalesce(new.descuento, 0);
  new.costo_total := v_costo;
  new.pagado := v_pagado;
  new.saldo := new.total - v_pagado;

  if new.estado <> 'cancelada' then
    new.estado := case when new.saldo > 0.5 then 'por_pagar' else 'pagada' end;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists acc_venta_calc on public.accesorio_ventas;
create trigger acc_venta_calc
  before insert or update on public.accesorio_ventas
  for each row execute function public.trg_accesorio_venta_calc();

-- ------------------------------------------------------------
-- Abonos de reparaciones: no superar el total de la orden
-- ------------------------------------------------------------
create or replace function public.trg_pago_valida()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_total numeric(12,2);
  v_otros numeric(12,2);
begin
  select total into v_total
    from public.ordenes
   where id = new.orden_id
   for update;

  if v_total is null then
    raise exception 'Orden no encontrada';
  end if;

  select coalesce(sum(monto), 0) into v_otros
    from public.pagos
   where orden_id = new.orden_id
     and id <> coalesce(new.id, 0);

  if v_otros + new.monto > v_total + 0.5 then
    raise exception 'El abono supera el total de la orden (%)', v_total;
  end if;

  return new;
end $$;

drop trigger if exists pagos_no_excede on public.pagos;
create trigger pagos_no_excede
  before insert or update of monto, orden_id on public.pagos
  for each row execute function public.trg_pago_valida();

-- ------------------------------------------------------------
-- Abonos de accesorios: no superar el total de la venta
-- ------------------------------------------------------------
create or replace function public.trg_accesorio_pago_valida()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_total numeric(12,2);
  v_otros numeric(12,2);
begin
  select total into v_total
    from public.accesorio_ventas
   where id = new.venta_id
   for update;

  if v_total is null then
    raise exception 'Venta de accesorio no encontrada';
  end if;

  select coalesce(sum(monto), 0) into v_otros
    from public.accesorio_pagos
   where venta_id = new.venta_id
     and id <> coalesce(new.id, 0);

  if v_otros + new.monto > v_total + 0.5 then
    raise exception 'El abono supera el total de la venta (%)', v_total;
  end if;

  return new;
end $$;

drop trigger if exists acc_pagos_no_excede on public.accesorio_pagos;
create trigger acc_pagos_no_excede
  before insert or update of monto, venta_id on public.accesorio_pagos
  for each row execute function public.trg_accesorio_pago_valida();

-- ------------------------------------------------------------
-- Abonos de equipos: no superar el total de la venta
-- ------------------------------------------------------------
create or replace function public.trg_equipo_pago_valida()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_total numeric(12,2);
  v_otros numeric(12,2);
begin
  select total into v_total
    from public.equipo_ventas
   where id = new.venta_id
   for update;

  if v_total is null then
    raise exception 'Venta de equipo no encontrada';
  end if;

  select coalesce(sum(monto), 0) into v_otros
    from public.equipo_pagos
   where venta_id = new.venta_id
     and id <> coalesce(new.id, 0);

  if v_otros + new.monto > v_total + 0.5 then
    raise exception 'El abono supera el total de la venta (%)', v_total;
  end if;

  return new;
end $$;

drop trigger if exists eq_pagos_no_excede on public.equipo_pagos;
create trigger eq_pagos_no_excede
  before insert or update of monto, venta_id on public.equipo_pagos
  for each row execute function public.trg_equipo_pago_valida();

-- ------------------------------------------------------------
-- Índices para los reportes de caja que ahora unen las 3 tablas
-- ------------------------------------------------------------
create index if not exists accesorio_pagos_fecha_idx
  on public.accesorio_pagos (fecha);
create index if not exists equipo_pagos_fecha_idx
  on public.equipo_pagos (fecha);

notify pgrst, 'reload schema';

commit;
