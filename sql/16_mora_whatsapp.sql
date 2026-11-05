-- ============================================================
-- SIR·TECH POS · 16 · Primer pago, mora y datos de contacto
--
-- Ejecutar después de 15_ajustes_ventas.sql.
-- ============================================================

alter table public.equipo_ventas
  add column if not exists primer_pago date;

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
