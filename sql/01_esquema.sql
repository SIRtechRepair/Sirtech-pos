-- ============================================================
-- SIR·TECH POS  ·  01 · ESQUEMA BASE
-- Ejecutar UNA sola vez en Supabase → SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PERFILES / ROLES
-- ------------------------------------------------------------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null default '',
  rol        text not null default 'caja' check (rol in ('admin','tecnico','caja')),
  activo     boolean not null default false,
  creado_en  timestamptz not null default now()
);

create or replace function public.nuevo_perfil()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.nuevo_perfil();

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
create table if not exists public.clientes (
  id             bigserial primary key,
  nombre         text not null,
  telefono       text,
  telefono_norm  text,
  email          text,
  notas          text,
  historico      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists clientes_tel_idx    on public.clientes (telefono_norm);
create index if not exists clientes_nombre_idx on public.clientes (lower(nombre));

-- ------------------------------------------------------------
-- PRODUCTOS (repuestos y, más adelante, accesorios)
-- ------------------------------------------------------------
create table if not exists public.productos (
  id            bigserial primary key,
  sku           text,
  nombre        text not null,
  categoria     text default 'General',
  costo         numeric(12,2) not null default 0,
  precio        numeric(12,2) not null default 0,
  stock         numeric(12,2) not null default 0,
  stock_minimo  numeric(12,2) not null default 0,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create index if not exists productos_nombre_idx on public.productos (lower(nombre));

-- ------------------------------------------------------------
-- ÓRDENES DE REPARACIÓN
-- ------------------------------------------------------------
create sequence if not exists public.ordenes_numero_seq start with 1;

create table if not exists public.ordenes (
  id              bigserial primary key,
  numero          integer not null unique default nextval('public.ordenes_numero_seq'),
  cliente_id      bigint references public.clientes(id) on delete set null,
  equipo          text not null,
  marca           text,
  modelo          text,
  imei            text,
  color           text,
  falla           text,
  diagnostico     text,
  tecnico         text,
  estado          text not null default 'recibido'
                  check (estado in ('recibido','diagnostico','esperando_repuesto',
                                    'reparando','listo','entregado','no_reparable','cancelado')),
  prioridad       text not null default 'normal' check (prioridad in ('normal','urgente')),
  envio           numeric(12,2) not null default 0,   -- costo de envío (lo asume el negocio)
  gastos          numeric(12,2) not null default 0,   -- otros gastos de la orden
  descuento       numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,   -- lo que paga el cliente
  costo_repuestos numeric(12,2) not null default 0,
  pagado          numeric(12,2) not null default 0,
  saldo           numeric(12,2) not null default 0,
  garantia_dias   integer not null default 0,
  garantia_hasta  date,
  fecha_recibido  timestamptz not null default now(),
  fecha_prometida date,
  fecha_entregado timestamptz,
  notas           text,
  historico       boolean not null default false,
  creado_por      uuid references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists ordenes_estado_idx  on public.ordenes (estado);
create index if not exists ordenes_cliente_idx on public.ordenes (cliente_id);
create index if not exists ordenes_fecha_idx   on public.ordenes (fecha_recibido desc);
create index if not exists ordenes_imei_idx    on public.ordenes (imei);

-- ------------------------------------------------------------
-- ÍTEMS DE LA ORDEN
-- ------------------------------------------------------------
create table if not exists public.orden_items (
  id              bigserial primary key,
  orden_id        bigint not null references public.ordenes(id) on delete cascade,
  tipo            text not null default 'servicio' check (tipo in ('servicio','repuesto')),
  descripcion     text not null,
  cantidad        numeric(10,2) not null default 1 check (cantidad > 0),
  costo_unitario  numeric(12,2) not null default 0,
  precio_unitario numeric(12,2) not null default 0,
  producto_id     bigint references public.productos(id) on delete set null,
  creado_en       timestamptz not null default now()
);

create index if not exists items_orden_idx on public.orden_items (orden_id);

-- ------------------------------------------------------------
-- PAGOS / ABONOS
-- ------------------------------------------------------------
create table if not exists public.pagos (
  id         bigserial primary key,
  orden_id   bigint not null references public.ordenes(id) on delete cascade,
  fecha      timestamptz not null default now(),
  monto      numeric(12,2) not null check (monto > 0),
  metodo     text not null default 'efectivo'
             check (metodo in ('efectivo','nequi','transferencia','tarjeta','otro')),
  nota       text,
  usuario    uuid references auth.users(id) on delete set null,
  historico  boolean not null default false,
  creado_en  timestamptz not null default now()
);

create index if not exists pagos_orden_idx on public.pagos (orden_id);
create index if not exists pagos_fecha_idx on public.pagos (fecha desc);

-- ------------------------------------------------------------
-- GARANTÍAS
-- ------------------------------------------------------------
create table if not exists public.garantias (
  id            bigserial primary key,
  orden_id      bigint not null references public.ordenes(id) on delete cascade,
  orden_item_id bigint references public.orden_items(id) on delete set null,
  tipo          text not null default 'garantia' check (tipo in ('garantia','danado','promocion')),
  motivo        text,
  costo         numeric(12,2) not null default 0,
  resuelta      boolean not null default false,
  fecha         timestamptz not null default now(),
  usuario       uuid references auth.users(id) on delete set null
);

create index if not exists garantias_orden_idx on public.garantias (orden_id);

-- ------------------------------------------------------------
-- HISTORIAL DE ESTADOS
-- ------------------------------------------------------------
create table if not exists public.historial_estados (
  id         bigserial primary key,
  orden_id   bigint not null references public.ordenes(id) on delete cascade,
  estado     text not null,
  nota       text,
  usuario    uuid references auth.users(id) on delete set null,
  creado_en  timestamptz not null default now()
);

create index if not exists historial_orden_idx on public.historial_estados (orden_id);

-- ------------------------------------------------------------
-- MOVIMIENTOS DE DINERO
-- ------------------------------------------------------------
create table if not exists public.movimientos_dinero (
  id         bigserial primary key,
  tipo       text not null check (tipo in ('gasto','proveedor','retiro','prestamo','abono','ingreso','traslado')),
  cuenta     text not null default 'efectivo' check (cuenta in ('efectivo','nequi')),
  monto      numeric(12,2) not null check (monto > 0),
  persona    text,
  nota       text,
  usuario    uuid references auth.users(id) on delete set null,
  creado_en  timestamptz not null default now()
);

create index if not exists movs_fecha_idx on public.movimientos_dinero (creado_en desc);

-- ============================================================
-- CÁLCULO AUTOMÁTICO DE TOTALES Y SALDO
-- ============================================================
create or replace function public.trg_orden_calc()
returns trigger
language plpgsql
as $$
declare
  v_total   numeric(12,2);
  v_costo   numeric(12,2);
  v_pagado  numeric(12,2);
begin
  select coalesce(sum(precio_unitario * cantidad), 0),
         coalesce(sum(costo_unitario * cantidad) filter (where tipo = 'repuesto'), 0)
    into v_total, v_costo
    from public.orden_items
   where orden_id = new.id;

  select coalesce(sum(monto), 0)
    into v_pagado
    from public.pagos
   where orden_id = new.id;

  new.total           := v_total - coalesce(new.descuento, 0);
  new.costo_repuestos := v_costo;
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

drop trigger if exists ordenes_calc on public.ordenes;
create trigger ordenes_calc
  before insert or update on public.ordenes
  for each row execute function public.trg_orden_calc();

-- Recalcular la orden cuando cambian sus ítems o sus pagos
create or replace function public.trg_recalcular_orden()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  v_id := coalesce(new.orden_id, old.orden_id);
  update public.ordenes set actualizado_en = now() where id = v_id;
  return null;
end $$;

drop trigger if exists items_recalc on public.orden_items;
create trigger items_recalc
  after insert or update or delete on public.orden_items
  for each row execute function public.trg_recalcular_orden();

drop trigger if exists pagos_recalc on public.pagos;
create trigger pagos_recalc
  after insert or update or delete on public.pagos
  for each row execute function public.trg_recalcular_orden();

-- Historial automático de cambios de estado
create or replace function public.trg_historial()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') or (new.estado is distinct from old.estado) then
    insert into public.historial_estados (orden_id, estado, usuario)
    values (new.id, new.estado, auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists ordenes_historial on public.ordenes;
create trigger ordenes_historial
  after insert or update of estado on public.ordenes
  for each row execute function public.trg_historial();

-- ============================================================
-- VISTAS Y FUNCIONES DE CONSULTA
-- ============================================================
create or replace function public.resumen_clientes()
returns table (
  id bigint,
  nombre text,
  telefono text,
  telefono_norm text,
  creado_en timestamptz,
  ordenes bigint,
  total numeric,
  saldo numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id,
         c.nombre,
         c.telefono,
         c.telefono_norm,
         c.creado_en,
         count(o.id)::bigint,
         coalesce(sum(o.total), 0),
         coalesce(sum(o.saldo), 0)
    from public.clientes c
    left join public.ordenes o on o.cliente_id = c.id
   group by c.id
   order by c.nombre;
$$;

grant execute on function public.resumen_clientes() to authenticated;
revoke all on function public.resumen_clientes() from anon;

create or replace view public.v_cartera
with (security_invoker = true) as
select o.id,
       o.numero,
       o.cliente_id,
       c.nombre   as cliente,
       c.telefono,
       o.equipo,
       o.estado,
       o.total,
       o.pagado,
       o.saldo,
       o.fecha_recibido,
       o.fecha_prometida
  from public.ordenes o
  left join public.clientes c on c.id = o.cliente_id
 where o.saldo > 0.5
   and o.estado not in ('cancelado');

create or replace view public.v_ordenes_resumen
with (security_invoker = true) as
select o.*,
       c.nombre   as cliente_nombre,
       c.telefono as cliente_telefono
  from public.ordenes o
  left join public.clientes c on c.id = o.cliente_id;
