-- ============================================================
-- SIR·TECH POS · 17 · Gastos por línea y cuotas históricas
--
-- Ejecutar después de 16_mora_whatsapp.sql.
-- ============================================================

-- En reparaciones, "Gastos" es el total de la línea, no se multiplica
-- por la cantidad. Solo el precio cobrado se multiplica por cantidad.
create or replace function public.trg_orden_calc()
returns trigger
language plpgsql
as $$
declare
  v_total        numeric(12,2);
  v_costo_serv   numeric(12,2);
  v_costo_rep    numeric(12,2);
  v_envio        numeric(12,2);
  v_pagado       numeric(12,2);
begin
  select coalesce(sum(precio_unitario * cantidad), 0),
         coalesce(sum(costo_unitario) filter (where tipo = 'servicio'), 0),
         coalesce(sum(costo_unitario * cantidad) filter (where tipo = 'repuesto'), 0)
           + coalesce(sum(costo_repuestos), 0),
         coalesce(sum(envio), 0)
    into v_total, v_costo_serv, v_costo_rep, v_envio
    from public.orden_items
   where orden_id = new.id;

  select coalesce(sum(monto), 0) into v_pagado
    from public.pagos where orden_id = new.id;

  new.total           := v_total - coalesce(new.descuento, 0);
  new.costo_servicios := v_costo_serv;
  new.costo_repuestos := coalesce(new.repuestos_extra, 0) + v_costo_rep;
  new.envio           := coalesce(new.envio_extra, 0) + v_envio;
  new.pagado          := v_pagado;
  new.saldo           := new.total - v_pagado;

  if new.estado = 'entregado' then
    if new.saldo > 0.5 then
      raise exception 'No se puede entregar la orden %: tiene un saldo pendiente de $%',
        new.numero, to_char(new.saldo, 'FM999G999G999G990');
    end if;
    if new.fecha_entregado is null then
      new.fecha_entregado := now();
    end if;
    if new.garantia_dias > 0 and new.garantia_hasta is null then
      new.garantia_hasta := (new.fecha_entregado at time zone 'America/Bogota')::date + new.garantia_dias;
    end if;
  end if;

  new.actualizado_en := now();
  return new;
end $$;

-- Recalcular las órdenes existentes sin disparar la validación de entrega
do $$
begin
  execute 'alter table public.ordenes disable trigger ordenes_calc';
  update public.ordenes o
     set costo_servicios = coalesce((
           select sum(i.costo_unitario)
             from public.orden_items i
            where i.orden_id = o.id and i.tipo = 'servicio'
         ), 0);
  execute 'alter table public.ordenes enable trigger ordenes_calc';
exception when others then
  execute 'alter table public.ordenes enable trigger ordenes_calc';
  raise;
end $$;

-- Mantener el número de cuotas igual a las cuotas registradas
create or replace function public.trg_equipo_cuotas_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_venta bigint;
begin
  v_venta := coalesce(new.venta_id, old.venta_id);
  update public.equipo_ventas
     set numero_cuotas = (select count(*) from public.equipo_cuotas where venta_id = v_venta)
   where id = v_venta;
  return null;
end $$;

drop trigger if exists equipo_cuotas_count on public.equipo_cuotas;
create trigger equipo_cuotas_count
  after insert or delete on public.equipo_cuotas
  for each row execute function public.trg_equipo_cuotas_count();
