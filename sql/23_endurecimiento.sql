-- ============================================================
-- SIR·TECH POS  ·  23 · ENDURECIMIENTO
-- Ejecutar en Supabase → SQL Editor → New query → Run
-- ============================================================
--
-- 1. costo_fifo() era SECURITY DEFINER y estaba disponible para
--    cualquier usuario autenticado. Con el registro público abierto,
--    una cuenta nueva (aunque quedara inactiva) podía consultar los
--    costos de los productos. Ahora exige staff activo.
--
-- 2. Deja explícitamente sin permiso al rol anónimo sobre las
--    funciones de apoyo. No cambia el comportamiento de la app.
--
-- Nota: el registro público se desactiva en el panel:
--   Authentication → Providers → Email → "Allow new users to sign up"
-- ============================================================

create or replace function public.costo_fifo(p_producto_id bigint, p_cantidad numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_costo numeric;
begin
  -- service_role/postgres (auth.uid() nulo) sigue pudiendo usarla;
  -- cualquier usuario autenticado debe ser staff activo.
  if auth.uid() is not null and not public.es_staff() then
    raise exception 'Sin permisos';
  end if;

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
    into v_costo
    from lotes;

  return v_costo;
end;
$$;

revoke all on function public.costo_fifo(bigint, numeric) from public, anon;
grant execute on function public.costo_fifo(bigint, numeric) to authenticated;

-- Funciones de apoyo: solo usuarios autenticados.
revoke all on function public.es_staff() from anon;
revoke all on function public.es_admin() from anon;
grant execute on function public.es_staff() to authenticated;
grant execute on function public.es_admin() to authenticated;

-- Verificación rápida (debe devolver una fila por función,
-- con anon = false y authenticated = true):
select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'execute')          as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('costo_fifo', 'es_staff', 'es_admin')
 order by p.proname;
