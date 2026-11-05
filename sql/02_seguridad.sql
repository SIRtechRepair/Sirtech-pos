-- ============================================================
-- SIR·TECH POS  ·  02 · SEGURIDAD (RLS)
-- Ejecutar DESPUÉS de 01_esquema.sql
-- ============================================================

-- ------------------------------------------------------------
-- Funciones de apoyo (SECURITY DEFINER: evitan recursión en RLS)
-- ------------------------------------------------------------
create or replace function public.es_staff()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfiles p
     where p.id = auth.uid() and p.activo
  );
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfiles p
     where p.id = auth.uid() and p.activo and p.rol = 'admin'
  );
$$;

revoke all on function public.es_staff() from public;
revoke all on function public.es_admin() from public;
grant execute on function public.es_staff() to authenticated;
grant execute on function public.es_admin() to authenticated;

-- ------------------------------------------------------------
-- Activar RLS
-- ------------------------------------------------------------
alter table public.perfiles            enable row level security;
alter table public.clientes            enable row level security;
alter table public.productos           enable row level security;
alter table public.ordenes             enable row level security;
alter table public.orden_items         enable row level security;
alter table public.pagos               enable row level security;
alter table public.garantias           enable row level security;
alter table public.historial_estados   enable row level security;
alter table public.movimientos_dinero  enable row level security;

-- ------------------------------------------------------------
-- Políticas
-- ------------------------------------------------------------
drop policy if exists perfiles_propio on public.perfiles;
create policy perfiles_propio on public.perfiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_admin on public.perfiles
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists staff_clientes on public.clientes;
create policy staff_clientes on public.clientes
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists staff_productos on public.productos;
create policy staff_productos on public.productos
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists staff_ordenes on public.ordenes;
create policy staff_ordenes on public.ordenes
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists staff_items on public.orden_items;
create policy staff_items on public.orden_items
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists staff_pagos on public.pagos;
create policy staff_pagos on public.pagos
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists staff_garantias on public.garantias;
create policy staff_garantias on public.garantias
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists staff_historial on public.historial_estados;
create policy staff_historial on public.historial_estados
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

drop policy if exists staff_movs on public.movimientos_dinero;
create policy staff_movs on public.movimientos_dinero
  for all to authenticated
  using (public.es_staff()) with check (public.es_staff());

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ------------------------------------------------------------
-- Activar al dueño
--   ⚠️ Cambia el correo si usas otro distinto.
-- ------------------------------------------------------------
do $$
declare
  v_email text := 'sneiderrojas312@yahoo.com';
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email) limit 1;

  if v_id is null then
    raise notice 'No existe un usuario con el correo %. Créalo en Authentication → Users y vuelve a ejecutar este bloque.', v_email;
  else
    update public.perfiles
       set rol = 'admin', activo = true
     where id = v_id;
    raise notice 'Usuario % activado como admin.', v_email;
  end if;
end $$;
