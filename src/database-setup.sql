-- ============================================
-- HOTEL RESERVATION BACK-OFFICE DATABASE
-- Execute this SQL in Supabase SQL Editor
-- ============================================

-- Enable required extensions
create extension if not exists btree_gist;

-- ============================================
-- TABLES
-- ============================================

-- Salones (Meeting Rooms)
create table if not exists public.salones (
  id bigint generated always as identity primary key,
  nombre text not null,
  capacidad int not null,
  precio_base numeric(12,2) not null default 0,
  descripcion text,
  activo boolean not null default true
);

alter table public.salones add column if not exists activo boolean not null default true;

-- Distribuciones de salones (Room Layouts/Distributions)
create table if not exists public.distribuciones (
  id bigint generated always as identity primary key,
  id_salon bigint not null references public.salones(id) on delete cascade,
  nombre text not null,
  capacidad int not null,
  creado_en timestamptz default now()
);

-- Perfiles de usuarios (User Profiles)
create table if not exists public.perfiles (
  user_id uuid primary key references auth.users on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('ADMIN','OPERADOR')),
  activo boolean not null default true,
  creado_en timestamp with time zone default now()
);

alter table public.perfiles add column if not exists activo boolean not null default true;

-- Reservas (Reservations)
create table if not exists public.reservas (
  id bigint generated always as identity primary key,
  cliente_nombre text not null,
  cliente_email text not null,
  cliente_telefono text not null,
  id_salon bigint not null references public.salones(id) on delete restrict,
  id_distribucion bigint references public.distribuciones(id) on delete set null,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  estado text not null check (estado in ('Pendiente validación','Validado Pendiente de Seña','Confirmado','Pagado','Cancelado')),
  monto numeric(12,2) not null default 0,
  observaciones text,
  cantidad_personas int not null default 0,
  presupuesto_url text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz default now(),
  actualizado_en timestamptz
);

-- Add range column for overlap detection
alter table public.reservas add column if not exists rango tstzrange generated always as (tstzrange(fecha_inicio, fecha_fin, '[)')) stored;
alter table public.reservas add column if not exists presupuesto_url text;
alter table public.reservas add column if not exists cantidad_personas int default 0;
alter table public.reservas add column if not exists cliente_nombre text;
alter table public.reservas add column if not exists cliente_email text;
alter table public.reservas add column if not exists cliente_telefono text;

-- ============================================
-- AUDITORÍA DE RESERVAS
-- ============================================

create table if not exists public.auditoria_reservas (
  id bigint generated always as identity primary key,
  id_reserva bigint not null references public.reservas(id) on delete cascade,
  estado_anterior text not null,
  estado_nuevo text not null,
  usuario_id uuid,
  accion text not null default 'UPDATE',
  creado_en timestamptz not null default now()
);

create or replace function public.audit_reserva_estado_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb;
  v_usuario_id uuid;
begin
  if TG_OP = 'UPDATE' and old.estado is distinct from new.estado then
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_usuario_id := auth.uid();

    if v_usuario_id is null and v_claims is not null then
      v_usuario_id := (v_claims ->> 'sub')::uuid;
    end if;

    insert into public.auditoria_reservas (id_reserva, estado_anterior, estado_nuevo, usuario_id)
    values (new.id, old.estado, new.estado, v_usuario_id);
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_audit_estado_cambio on public.reservas;
create trigger reservas_audit_estado_cambio
after update of estado
on public.reservas
for each row
execute function public.audit_reserva_estado_cambio();

-- ============================================
-- STORAGE: PRESUPUESTOS
-- ============================================

do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'presupuestos'
  ) then
    insert into storage.buckets (id, name, public)
    values ('presupuestos', 'presupuestos', false);
  end if;
end $$;

drop policy if exists "presupuestos_insert_auth" on storage.objects;
drop policy if exists "presupuestos_select_owner" on storage.objects;
drop policy if exists "presupuestos_delete_owner" on storage.objects;

create policy "presupuestos_insert_auth"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'presupuestos' and owner = auth.uid());

create policy "presupuestos_select_owner"
  on storage.objects for select to authenticated
  using (bucket_id = 'presupuestos' and owner = auth.uid());

create policy "presupuestos_delete_owner"
  on storage.objects for delete to authenticated
  using (bucket_id = 'presupuestos' and owner = auth.uid());

-- Evita solapamientos de reservas en el mismo salón (excepto estados de gestión pendiente o cancelados)
alter table public.reservas drop constraint if exists reservas_no_solape_excl;
alter table public.reservas add constraint reservas_no_solape_excl
  exclude using gist (id_salon with =, rango with &&)
  where (estado in ('Confirmado','Pagado'));

drop trigger if exists reservas_block_locked_overlap on public.reservas;
drop function if exists public.prevent_reserva_overlap_with_locked_reservas();

create or replace function public.prevent_reserva_overlap_with_locked_reservas()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'Cancelado' then
    return new;
  end if;

  if exists (
    select 1
    from public.reservas r
    where r.id <> coalesce(new.id, -1)
      and r.id_salon = new.id_salon
      and tstzrange(r.fecha_inicio, r.fecha_fin, '[)') && tstzrange(new.fecha_inicio, new.fecha_fin, '[)')
      and r.estado in ('Confirmado', 'Pagado')
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Ya existe una reserva bloqueante en ese rango para el salón seleccionado.';
  end if;

  return new;
end;
$$;

create trigger reservas_block_locked_overlap
before insert or update of id_salon, fecha_inicio, fecha_fin, estado
on public.reservas
for each row
execute function public.prevent_reserva_overlap_with_locked_reservas();

-- Pagos (Payments) - Optional
create table if not exists public.pagos (
  id bigint generated always as identity primary key,
  id_reserva bigint not null references public.reservas(id) on delete cascade,
  fecha_pago timestamptz not null,
  monto numeric(12,2) not null,
  medio_pago text
);

-- ============================================
-- RATE LIMITING
-- ============================================

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

drop policy if exists service_role_all_rate_limits on public.rate_limits;
create policy service_role_all_rate_limits on public.rate_limits
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.check_rate_limit(
  p_key text,
  p_max_count int,
  p_window_seconds int,
  p_block_seconds int
)
returns table (
  allowed boolean,
  remaining int,
  retry_after_seconds int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_record public.rate_limits%rowtype;
  v_window_interval interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_block_interval interval := make_interval(secs => greatest(p_block_seconds, 1));
  v_max_count int := greatest(p_max_count, 1);
begin
  insert into public.rate_limits (key, count, window_start, blocked_until, updated_at)
  values (p_key, 0, v_now, null, v_now)
  on conflict (key) do nothing;

  select *
  into v_record
  from public.rate_limits
  where key = p_key
  for update;

  if v_record.blocked_until is not null and v_record.blocked_until > v_now then
    allowed := false;
    remaining := 0;
    retry_after_seconds := ceil(extract(epoch from (v_record.blocked_until - v_now)))::int;
    return next;
    return;
  end if;

  if v_record.window_start <= v_now - v_window_interval then
    update public.rate_limits
    set count = 1,
        window_start = v_now,
        blocked_until = null,
        updated_at = v_now
    where key = p_key;

    allowed := true;
    remaining := v_max_count - 1;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  if v_record.count >= v_max_count then
    update public.rate_limits
    set blocked_until = v_now + v_block_interval,
        updated_at = v_now
    where key = p_key;

    allowed := false;
    remaining := 0;
    retry_after_seconds := greatest(p_block_seconds, 1);
    return next;
    return;
  end if;

  update public.rate_limits
  set count = v_record.count + 1,
      blocked_until = null,
      updated_at = v_now
  where key = p_key;

  allowed := true;
  remaining := greatest(v_max_count - v_record.count - 1, 0);
  retry_after_seconds := 0;
  return next;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int, int) from anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int, int) to service_role;

-- ============================================
-- SERVICIOS ADICIONALES
-- ============================================

-- Categorias de Servicios
create table if not exists public.categorias_servicios (
  id bigint generated always as identity primary key,
  nombre text not null,
  descripcion text,
  orden int not null default 0,
  creado_en timestamptz default now()
);

alter table public.categorias_servicios add column if not exists orden int not null default 0;

with categorias_ordenables as (
  select
    id,
    row_number() over (order by nombre asc, id asc) as posicion
  from public.categorias_servicios
  where coalesce(orden, 0) = 0
)
update public.categorias_servicios categoria
set orden = categorias_ordenables.posicion
from categorias_ordenables
where categoria.id = categorias_ordenables.id;

-- Servicios Adicionales
create table if not exists public.servicios (
  id bigint generated always as identity primary key,
  id_categoria bigint not null references public.categorias_servicios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  precio numeric(12,2) not null default 0,
  activo boolean not null default true,
  creado_en timestamptz default now()
);

alter table public.servicios add column if not exists activo boolean not null default true;

-- Tabla intermedia: Servicios asociados a una reserva
create table if not exists public.reserva_servicios (
  id bigint generated always as identity primary key,
  id_reserva bigint not null references public.reservas(id) on delete cascade,
  id_servicio bigint not null references public.servicios(id) on delete cascade,
  cantidad int not null default 1,
  creado_en timestamptz default now()
);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update actualizado_en on reservas update
create or replace function set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end; $$;

drop trigger if exists reservas_set_updated on public.reservas;
create trigger reservas_set_updated before update on public.reservas
for each row execute procedure set_actualizado_en();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Helper function to get user role without recursion
create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select rol
  from public.perfiles
  where user_id = auth.uid()
    and coalesce(activo, true) = true;
$$;

create or replace function public.prevent_unsafe_self_perfil_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = OLD.user_id and public.get_user_role() <> 'ADMIN' then
    if NEW.user_id is distinct from OLD.user_id then
      raise exception 'No puede modificar el usuario del perfil';
    end if;

    if NEW.rol is distinct from OLD.rol then
      raise exception 'No puede modificar el rol del perfil';
    end if;

    if NEW.creado_en is distinct from OLD.creado_en then
      raise exception 'No puede modificar la fecha de creacion del perfil';
    end if;

    if NEW.activo is distinct from OLD.activo then
      raise exception 'No puede modificar el estado del perfil';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists perfiles_prevent_unsafe_self_update on public.perfiles;
create trigger perfiles_prevent_unsafe_self_update
before update on public.perfiles
for each row execute function public.prevent_unsafe_self_perfil_update();

-- Enable RLS on all tables
alter table public.salones enable row level security;
alter table public.categorias_servicios enable row level security;
alter table public.servicios enable row level security;
alter table public.reserva_servicios enable row level security;
alter table public.distribuciones enable row level security;
alter table public.reservas enable row level security;
alter table public.pagos enable row level security;
alter table public.perfiles enable row level security;
alter table public.rate_limits enable row level security;

-- Drop existing policies if any
drop policy if exists admin_all_salones on public.salones;
drop policy if exists operador_read_salones on public.salones;
drop policy if exists admin_all_reservas on public.reservas;
drop policy if exists operador_read_reservas on public.reservas;
drop policy if exists operador_write_reservas on public.reservas;
drop policy if exists operador_update_reservas on public.reservas;
drop policy if exists admin_all_pagos on public.pagos;
drop policy if exists operador_read_pagos on public.pagos;
drop policy if exists admin_all_perfiles on public.perfiles;
drop policy if exists users_read_own_perfil on public.perfiles;
drop policy if exists authenticated_read_perfiles on public.perfiles;
drop policy if exists users_update_own_perfil on public.perfiles;
drop policy if exists service_role_all_perfiles on public.perfiles;
drop policy if exists service_role_all_rate_limits on public.rate_limits;
drop policy if exists admin_all_distribuciones on public.distribuciones;
drop policy if exists operador_read_distribuciones on public.distribuciones;
drop policy if exists admin_all_categorias_servicios on public.categorias_servicios;
drop policy if exists operador_read_categorias_servicios on public.categorias_servicios;
drop policy if exists admin_all_servicios on public.servicios;
drop policy if exists operador_read_servicios on public.servicios;
drop policy if exists admin_all_reserva_servicios on public.reserva_servicios;
drop policy if exists operador_all_reserva_servicios on public.reserva_servicios;

-- SALONES policies
create policy admin_all_salones on public.salones
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_read_salones on public.salones
  for select using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

-- DISTRIBUCIONES policies
create policy admin_all_distribuciones on public.distribuciones
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_read_distribuciones on public.distribuciones
  for select using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

-- RESERVAS policies
create policy admin_all_reservas on public.reservas
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_read_reservas on public.reservas
  for select using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

create policy operador_write_reservas on public.reservas
  for insert with check (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

create policy operador_update_reservas on public.reservas
  for update using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

-- PAGOS policies
create policy admin_all_pagos on public.pagos
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_read_pagos on public.pagos
  for select using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

-- CATEGORIAS_SERVICIOS policies
create policy admin_all_categorias_servicios on public.categorias_servicios
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_read_categorias_servicios on public.categorias_servicios
  for select using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

-- SERVICIOS policies
create policy admin_all_servicios on public.servicios
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_read_servicios on public.servicios
  for select using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

-- RESERVA_SERVICIOS policies
create policy admin_all_reserva_servicios on public.reserva_servicios
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_all_reserva_servicios on public.reserva_servicios
  for all using (
    public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

-- PERFILES policies (fixed to avoid infinite recursion)
create policy admin_all_perfiles on public.perfiles
  for all
  to authenticated
  using (public.get_user_role() = 'ADMIN')
  with check (public.get_user_role() = 'ADMIN');

create policy users_read_own_perfil on public.perfiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy users_update_own_perfil on public.perfiles
  for update
  to authenticated
  using (auth.uid() = user_id and coalesce(activo, true) = true)
  with check (auth.uid() = user_id and coalesce(activo, true) = true);

-- Service role has full access (used by create-user endpoint)
create policy service_role_all_perfiles on public.perfiles
  for all
  to service_role
  using (true)
  with check (true);

-- RATE_LIMITS policies (server-side only)
create policy service_role_all_rate_limits on public.rate_limits
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================
-- SEED DATA
-- ============================================

-- Salones
insert into public.salones (nombre, capacidad, precio_base, descripcion) values
  ('Gran SalÃ³n', 200, 15000.00, 'SalÃ³n principal con equipamiento completo para eventos grandes'),
  ('SalÃ³n Norte', 80, 8000.00, 'SalÃ³n mediano ideal para reuniones corporativas'),
  ('SalÃ³n Terraza', 50, 6000.00, 'Espacio al aire libre con vista panorÃ¡mica')
on conflict do nothing;


-- ============================================
-- DEFAULT ADMIN USER CREATION
-- ============================================
-- IMPORTANT: Run this in a separate query AFTER the main script
-- or run via API/Dashboard to avoid permission issues

-- To create the default admin user, you have two options:

-- OPTION 1: Via Supabase Dashboard (RECOMMENDED)
-- 1. Go to Authentication > Users
-- 2. Click "Add user" > "Create new user"
-- 3. Email: admin@hotel.com
-- 4. Password: Admin123! (change this after first login!)
-- 5. Check "Auto Confirm User"
-- 6. Copy the User UID
-- 7. Come back here and run the INSERT below with that UID

-- OPTION 2: Via SQL (if you have service role access in SQL editor)
-- Uncomment and run the following:

/*
-- First, create the auth user
-- NOTE: This might not work in SQL Editor - you may need to use the Dashboard
SELECT auth.create_user(
  email := 'admin@hotel.com',
  password := 'Admin123!',
  email_confirmed := true,
  user_metadata := jsonb_build_object('nombre', 'Administrador')
);

-- Get the user_id from the result above, then insert the perfil:
insert into public.perfiles (user_id, nombre, rol) values
  ('REPLACE-WITH-USER-UUID', 'Administrador', 'ADMIN')
on conflict do nothing;
*/

-- ============================================
-- AFTER CREATING THE ADMIN USER IN DASHBOARD
-- ============================================
-- Once you create the admin user via Dashboard, run this:
-- (Replace the UUID with the one from the created user)

-- insert into public.perfiles (user_id, nombre, rol) values
--   ('PASTE-USER-UUID-HERE', 'Administrador', 'ADMIN')
-- on conflict do nothing;

-- Sample reservations (uncomment after creating users)
-- insert into public.reservas (cliente_nombre, cliente_email, cliente_telefono, id_salon, fecha_inicio, fecha_fin, estado, monto, observaciones, creado_por) values
--   ('Cliente Demo', 'demo1@ejemplo.com', '+54 11 1111 1111', 1, '2025-10-20 18:00:00+00', '2025-10-20 23:00:00+00', 'Confirmado', 15000.00, 'Evento corporativo anual', 'UUID-OF-USER'),
--   ('Cliente Demo', 'demo2@ejemplo.com', '+54 11 2222 2222', 2, '2025-10-22 14:00:00+00', '2025-10-22 18:00:00+00', 'Pendiente validación', 8000.00, 'Reunión de directorio', 'UUID-OF-USER'),
--   ('Cliente Demo', 'demo3@ejemplo.com', '+54 11 3333 3333', 3, '2025-10-25 21:00:00+00', '2025-10-26 02:00:00+00', 'Pagado', 6000.00, 'Cena de gala - cruza medianoche', 'UUID-OF-USER');

-- ============================================
-- SETUP COMPLETE
-- ============================================
-- Next steps:
-- 1. Create users via Supabase Auth Dashboard
-- 2. Insert perfiles for those users with appropriate roles
-- 3. Test the application

