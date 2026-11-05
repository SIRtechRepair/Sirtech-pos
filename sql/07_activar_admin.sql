-- ============================================================
-- SIR·TECH POS  ·  07 · Activar usuario administrador
--
-- Ejecutar DESPUÉS de crear el usuario en:
--   Supabase → Authentication → Users → Add user
--   (marca "Auto Confirm User")
--
-- Cambia el correo si hace falta.
-- ============================================================

do $$
declare
  v_email text := 'sneiderrojas312@yahoo.com';
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email) limit 1;

  if v_id is null then
    raise notice 'No existe un usuario con el correo %. Créalo primero en Authentication → Users.', v_email;
  else
    insert into public.perfiles (id, nombre, rol, activo)
    values (v_id, split_part(v_email, '@', 1), 'admin', true)
    on conflict (id) do update set rol = 'admin', activo = true;

    raise notice 'Usuario % activado como admin.', v_email;
  end if;
end $$;

-- Verificación
select p.id, u.email, p.nombre, p.rol, p.activo
  from public.perfiles p
  join auth.users u on u.id = p.id;
