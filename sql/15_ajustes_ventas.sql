-- ============================================================
-- SIR·TECH POS · 15 · Ajustes de ventas e inventario
--
-- Ejecutar después de 10_accesorios.sql y 11_equipos.sql.
-- ============================================================

-- Precio de contado en ventas de equipos
alter table public.equipo_ventas
  add column if not exists precio_contado numeric(12,2) not null default 0;

update public.equipo_ventas
   set precio_contado = total
 where precio_contado = 0;

-- Recrear la vista para que incluya la columna nueva
drop view if exists public.v_equipo_ventas;
create view public.v_equipo_ventas
with (security_invoker = true) as
select v.*,
       case when v.saldo > 0.5 then 'por_pagar' else 'pagada' end as estado_pago_calc,
       (select count(*) from public.equipo_cuotas c
         where c.venta_id = v.id and c.estado <> 'pagada') as cuotas_pendientes
  from public.equipo_ventas v;

grant select on public.v_equipo_ventas to authenticated;
revoke all on public.v_equipo_ventas from anon;

-- ------------------------------------------------------------
-- Costo FIFO sin consumir inventario
-- ------------------------------------------------------------
create or replace function public.costo_fifo(p_producto_id bigint, p_cantidad numeric)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  with lotes as (
    select cantidad_restante, costo_unitario,
           sum(cantidad_restante) over (order by fecha, id) as acum
      from public.producto_lotes
     where producto_id = p_producto_id
       and cantidad_restante > 0
  )
  select coalesce(sum(
           least(cantidad_restante,
                 greatest(p_cantidad - (acum - cantidad_restante), 0)
           ) * costo_unitario
         ), 0)
    from lotes;
$$;

revoke all on function public.costo_fifo(bigint, numeric) from public, anon;
grant execute on function public.costo_fifo(bigint, numeric) to authenticated;

-- ------------------------------------------------------------
-- Corregir un lote ya ingresado
-- ------------------------------------------------------------
create or replace function public.actualizar_lote(
  p_lote_id bigint,
  p_cantidad_inicial numeric,
  p_cantidad_restante numeric,
  p_costo_unitario numeric,
  p_fecha date,
  p_proveedor text,
  p_nota text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_prod bigint;
  v_rest numeric(12,2);
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;

  select producto_id, cantidad_restante into v_prod, v_rest
    from public.producto_lotes where id = p_lote_id for update;
  if v_prod is null then
    raise exception 'El lote no existe';
  end if;
  if p_cantidad_inicial < 0 or p_cantidad_restante < 0
     or p_cantidad_restante > p_cantidad_inicial then
    raise exception 'Cantidades inválidas: la restante no puede superar la inicial ni ser negativa';
  end if;
  if p_costo_unitario < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  update public.producto_lotes
     set cantidad_inicial = p_cantidad_inicial,
         cantidad_restante = p_cantidad_restante,
         costo_unitario = p_costo_unitario,
         fecha = coalesce(p_fecha, fecha),
         proveedor = nullif(trim(coalesce(p_proveedor, '')), ''),
         nota = nullif(trim(coalesce(p_nota, '')), '')
   where id = p_lote_id;

  update public.productos p
     set stock = (select coalesce(sum(cantidad_restante), 0)
                    from public.producto_lotes where producto_id = p.id),
         costo = p_costo_unitario,
         costo_referencia = (select case
                               when coalesce(sum(cantidad_restante), 0) > 0
                               then sum(cantidad_restante * costo_unitario) / sum(cantidad_restante)
                               else p_costo_unitario end
                               from public.producto_lotes where producto_id = p.id)
   where p.id = v_prod;

  insert into public.accesorio_movimientos
    (producto_id, tipo, cantidad, costo_unitario, nota, usuario)
  values
    (v_prod, 'ajuste', p_cantidad_restante - v_rest, p_costo_unitario,
     'Corrección de lote', auth.uid());
end $$;

revoke all on function public.actualizar_lote(bigint, numeric, numeric, numeric, date, text, text) from public, anon;
grant execute on function public.actualizar_lote(bigint, numeric, numeric, numeric, date, text, text) to authenticated;

-- ------------------------------------------------------------
-- Ajustar el stock actual de un producto
-- ------------------------------------------------------------
create or replace function public.ajustar_stock(
  p_producto_id bigint,
  p_nuevo_stock numeric,
  p_costo_unitario numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actual numeric(12,2);
  v_diff numeric(12,2);
  v_costo numeric(12,2);
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if p_nuevo_stock < 0 then
    raise exception 'El stock no puede ser negativo';
  end if;

  select coalesce(sum(cantidad_restante), 0)
    into v_actual
    from public.producto_lotes
   where producto_id = p_producto_id;

  v_diff := p_nuevo_stock - v_actual;
  select coalesce(costo, 0) into v_costo from public.productos where id = p_producto_id;

  if v_costo is null then
    raise exception 'El producto no existe';
  end if;

  if v_diff > 0 then
    v_costo := coalesce(nullif(p_costo_unitario, 0), v_costo, 0);
    insert into public.producto_lotes
      (producto_id, fecha, cantidad_inicial, cantidad_restante, costo_unitario, nota, creado_por)
    values
      (p_producto_id, current_date, v_diff, v_diff, v_costo, 'Ajuste de stock', auth.uid());
    insert into public.accesorio_movimientos
      (producto_id, tipo, cantidad, costo_unitario, nota, usuario)
    values
      (p_producto_id, 'ajuste', v_diff, v_costo, 'Ajuste de stock', auth.uid());
  elsif v_diff < 0 then
    perform public.consumir_fifo(p_producto_id, -v_diff);
    insert into public.accesorio_movimientos
      (producto_id, tipo, cantidad, costo_unitario, nota, usuario)
    values
      (p_producto_id, 'ajuste', v_diff, v_costo, 'Ajuste de stock', auth.uid());
  end if;

  update public.productos p
     set stock = (select coalesce(sum(cantidad_restante), 0)
                    from public.producto_lotes where producto_id = p.id)
   where p.id = p_producto_id;
end $$;

revoke all on function public.ajustar_stock(bigint, numeric, numeric) from public, anon;
grant execute on function public.ajustar_stock(bigint, numeric, numeric) to authenticated;

-- ------------------------------------------------------------
-- Estado de cuota al corregir su valor
-- ------------------------------------------------------------
create or replace function public.trg_equipo_cuota_calc()
returns trigger
language plpgsql
as $$
begin
  new.estado := case
    when coalesce(new.pagado, 0) >= new.monto - 0.5 then 'pagada'
    when coalesce(new.pagado, 0) > 0 then 'parcial'
    else 'pendiente'
  end;
  return new;
end $$;

drop trigger if exists equipo_cuota_calc on public.equipo_cuotas;
create trigger equipo_cuota_calc
  before insert or update on public.equipo_cuotas
  for each row execute function public.trg_equipo_cuota_calc();
