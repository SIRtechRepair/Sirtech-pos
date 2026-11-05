-- ============================================================
-- SIR·TECH POS · 09 · Quitar el estado "recibido"
--
-- Ejecutar UNA VEZ en Supabase → SQL Editor.
-- No borra datos: las órdenes que estuvieran en "recibido" pasan
-- a "diagnostico". En la base actual no hay ninguna.
-- ============================================================

update public.ordenes
   set estado = 'diagnostico'
 where estado = 'recibido';

-- Reemplazar la restricción del estado
alter table public.ordenes drop constraint if exists ordenes_estado_check;
alter table public.ordenes add constraint ordenes_estado_check
  check (estado in ('diagnostico', 'esperando_repuesto', 'reparando',
                    'listo', 'entregado', 'no_reparable', 'cancelado'));

alter table public.ordenes alter column estado set default 'diagnostico';

-- Verificación
select estado, count(*) as ordenes
  from public.ordenes
 group by estado
 order by estado;
