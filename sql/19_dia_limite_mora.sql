-- ============================================================
-- SIR·TECH POS · 19 · Día límite y mora correcta
--
-- Ejecutar después de 18_eliminar_editar_ventas.sql.
-- ============================================================

alter table public.equipo_ventas
  add column if not exists dia_limite integer not null default 5;

update public.equipo_ventas v
   set dia_limite = greatest(1, least(31, coalesce((
         select extract(day from c.fecha_vencimiento)::int
           from public.equipo_cuotas c
          where c.venta_id = v.id
          order by c.numero
          limit 1
       ), 5)));

alter table public.equipo_ventas
  drop constraint if exists equipo_ventas_dia_limite_check;
alter table public.equipo_ventas
  add constraint equipo_ventas_dia_limite_check
  check (dia_limite between 1 and 31);

-- Reparte los pagos en las cuotas:
--   * pagos con cuota_id van a esa cuota;
--   * abonos generales cubren las cuotas más antiguas;
--   * el pago inicial no se reparte.
create or replace function public.recalcular_cuotas_venta(p_venta_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_general numeric(12,2);
  v_target  numeric(12,2);
  v_alloc   numeric(12,2);
  r         record;
begin
  for r in
    select id, monto from public.equipo_cuotas
     where venta_id = p_venta_id order by numero
  loop
    select coalesce(sum(monto), 0) into v_target
      from public.equipo_pagos
     where cuota_id = r.id;

    update public.equipo_cuotas
       set pagado = least(r.monto, v_target),
           estado = case
                      when least(r.monto, v_target) >= r.monto - 0.5 then 'pagada'
                      when least(r.monto, v_target) > 0 then 'parcial'
                      else 'pendiente'
                    end
     where id = r.id;
  end loop;

  select coalesce(sum(monto), 0) into v_general
    from public.equipo_pagos
   where venta_id = p_venta_id
     and cuota_id is null
     and tipo = 'abono';

  for r in
    select id, monto, pagado from public.equipo_cuotas
     where venta_id = p_venta_id order by numero
  loop
    exit when v_general <= 0.5;
    v_alloc := least(greatest(r.monto - r.pagado, 0), v_general);
    if v_alloc > 0 then
      update public.equipo_cuotas
         set pagado = r.pagado + v_alloc,
             estado = case
                        when r.pagado + v_alloc >= r.monto - 0.5 then 'pagada'
                        when r.pagado + v_alloc > 0 then 'parcial'
                        else 'pendiente'
                      end
       where id = r.id;
      v_general := v_general - v_alloc;
    end if;
  end loop;

  update public.equipo_ventas
     set pagado = coalesce((
           select sum(monto) from public.equipo_pagos where venta_id = p_venta_id
         ), 0)
   where id = p_venta_id;
end $$;

revoke all on function public.recalcular_cuotas_venta(bigint) from public, anon;

create or replace function public.trg_equipo_pago_recalc()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_venta bigint;
begin
  v_venta := coalesce(new.venta_id, old.venta_id);
  perform public.recalcular_cuotas_venta(v_venta);
  return null;
end $$;

drop trigger if exists equipo_pagos_recalc on public.equipo_pagos;
create trigger equipo_pagos_recalc
  after insert or update or delete on public.equipo_pagos
  for each row execute function public.trg_equipo_pago_recalc();

-- Recalcular todas las ventas existentes
do $$
declare r record;
begin
  for r in select id from public.equipo_ventas loop
    perform public.recalcular_cuotas_venta(r.id);
  end loop;
end $$;

-- Aplicar el día límite a las cuotas pendientes
create or replace function public.aplicar_dia_limite(p_venta_id bigint, p_dia integer)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_fecha date;
  v_ultimo integer;
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if p_dia < 1 or p_dia > 31 then
    raise exception 'El día límite debe estar entre 1 y 31';
  end if;

  update public.equipo_ventas set dia_limite = p_dia where id = p_venta_id;

  for r in
    select id, fecha_vencimiento
      from public.equipo_cuotas
     where venta_id = p_venta_id and estado <> 'pagada'
  loop
    v_ultimo := extract(day from (
      date_trunc('month', r.fecha_vencimiento) + interval '1 month' - interval '1 day'
    ))::int;
    v_fecha := date_trunc('month', r.fecha_vencimiento)::date + (least(p_dia, v_ultimo) - 1);
    update public.equipo_cuotas set fecha_vencimiento = v_fecha where id = r.id;
  end loop;

  update public.equipo_ventas v
     set primer_pago = coalesce((
           select min(c.fecha_vencimiento)
             from public.equipo_cuotas c
            where c.venta_id = v.id and c.estado <> 'pagada'
         ), v.primer_pago)
   where v.id = p_venta_id;
end $$;

revoke all on function public.aplicar_dia_limite(bigint, integer) from public, anon;
grant execute on function public.aplicar_dia_limite(bigint, integer) to authenticated;

-- Vista con el día límite
drop view if exists public.v_equipo_ventas;
create view public.v_equipo_ventas
with (security_invoker = true) as
select v.*,
       c.telefono as cliente_telefono,
       case when v.saldo > 0.5 then 'por_pagar' else 'pagada' end as estado_pago_calc,
       (select count(*) from public.equipo_cuotas c2
         where c2.venta_id = v.id and c2.estado <> 'pagada') as cuotas_pendientes,
       exists (
         select 1 from public.equipo_cuotas c3
          where c3.venta_id = v.id
            and c3.estado <> 'pagada'
            and c3.fecha_vencimiento < (now() at time zone 'America/Bogota')::date
       ) as en_mora,
       coalesce((
         select max(((now() at time zone 'America/Bogota')::date - c4.fecha_vencimiento))
           from public.equipo_cuotas c4
          where c4.venta_id = v.id
            and c4.estado <> 'pagada'
            and c4.fecha_vencimiento < (now() at time zone 'America/Bogota')::date
       ), 0) as dias_mora
  from public.equipo_ventas v
  left join public.clientes c on c.id = v.cliente_id;

grant select on public.v_equipo_ventas to authenticated;
revoke all on public.v_equipo_ventas from anon;
