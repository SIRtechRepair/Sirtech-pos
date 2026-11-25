-- ============================================================
-- SIR·TECH POS · 18 · Eliminar ventas de accesorios y editar cabecera
--
-- Ejecutar después de 17_costos_servicios_cuotas.sql.
-- ============================================================

-- Recalcular la venta cuando se edita su cabecera (descuento, envío, gastos)
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

-- Eliminar una venta de accesorios y devolver al stock lo que consumió
create or replace function public.eliminar_venta_accesorio(p_venta_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  p bigint;
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;

  for r in
    select avl.lote_id, avl.cantidad, pl.producto_id, pl.costo_unitario
      from public.accesorio_venta_lotes avl
      join public.accesorio_venta_items avi on avi.id = avl.venta_item_id
      join public.producto_lotes pl on pl.id = avl.lote_id
     where avi.venta_id = p_venta_id
  loop
    update public.producto_lotes
       set cantidad_restante = least(cantidad_inicial, cantidad_restante + r.cantidad)
     where id = r.lote_id;

    insert into public.accesorio_movimientos
      (producto_id, tipo, cantidad, costo_unitario, referencia_id, nota, usuario)
    values
      (r.producto_id, 'ajuste', r.cantidad, r.costo_unitario, p_venta_id,
       'Venta eliminada: stock restaurado', auth.uid());
  end loop;

  for p in
    select distinct pl.producto_id
      from public.accesorio_venta_lotes avl
      join public.accesorio_venta_items avi on avi.id = avl.venta_item_id
      join public.producto_lotes pl on pl.id = avl.lote_id
     where avi.venta_id = p_venta_id
  loop
    update public.productos pr
       set stock = (select coalesce(sum(cantidad_restante), 0)
                      from public.producto_lotes
                     where producto_id = pr.id)
     where pr.id = p;
  end loop;

  delete from public.accesorio_ventas where id = p_venta_id;
end $$;

revoke all on function public.eliminar_venta_accesorio(bigint) from public, anon;
grant execute on function public.eliminar_venta_accesorio(bigint) to authenticated;
