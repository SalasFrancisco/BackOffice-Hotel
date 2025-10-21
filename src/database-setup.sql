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
  descripcion text
);

-- Distribuciones de salones (Room Layouts/Distributions)
create table if not exists public.distribuciones (
  id bigint generated always as identity primary key,
  id_salon bigint not null references public.salones(id) on delete cascade,
  nombre text not null,
  capacidad int not null,
  creado_en timestamptz default now()
);

-- Clientes (Clients)
create table if not exists public.clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  empresa text,
  telefono text,
  email text,
  cuit text
);

-- Perfiles de usuarios (User Profiles)
create table if not exists public.perfiles (
  user_id uuid primary key references auth.users on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('ADMIN','OPERADOR')),
  creado_en timestamp with time zone default now()
);

-- Reservas (Reservations)
create table if not exists public.reservas (
  id bigint generated always as identity primary key,
  id_cliente bigint not null references public.clientes(id) on delete restrict,
  id_salon bigint not null references public.salones(id) on delete restrict,
  id_distribucion bigint references public.distribuciones(id) on delete set null,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  estado text not null check (estado in ('Pendiente','Confirmado','Pagado','Cancelado')),
  monto numeric(12,2) not null default 0,
  observaciones text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz default now(),
  actualizado_en timestamptz
);

-- Add range column for overlap detection
alter table public.reservas add column if not exists rango tstzrange generated always as (tstzrange(fecha_inicio, fecha_fin, '[)')) stored;

-- Prevent overlapping reservations in same salon
do $$ 
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservas_no_solape_excl'
  ) then
    alter table public.reservas add constraint reservas_no_solape_excl
      exclude using gist (id_salon with =, rango with &&)
      where (estado != 'Cancelado');
  end if;
end $$;

-- Pagos (Payments) - Optional
create table if not exists public.pagos (
  id bigint generated always as identity primary key,
  id_reserva bigint not null references public.reservas(id) on delete cascade,
  fecha_pago timestamptz not null,
  monto numeric(12,2) not null,
  medio_pago text
);

-- ============================================
-- SERVICIOS ADICIONALES
-- ============================================

-- Categorias de Servicios
create table if not exists public.categorias_servicios (
  id bigint generated always as identity primary key,
  nombre text not null,
  descripcion text,
  creado_en timestamptz default now()
);

-- Servicios Adicionales
create table if not exists public.servicios (
  id bigint generated always as identity primary key,
  id_categoria bigint not null references public.categorias_servicios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  precio numeric(12,2) not null default 0,
  creado_en timestamptz default now()
);

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
stable
as $
  select rol from public.perfiles where user_id = auth.uid();
$;

-- Enable RLS on all tables
alter table public.salones enable row level security;
alter table public.categorias_servicios enable row level security;
alter table public.servicios enable row level security;
alter table public.reserva_servicios enable row level security;
alter table public.distribuciones enable row level security;
alter table public.clientes enable row level security;
alter table public.reservas enable row level security;
alter table public.pagos enable row level security;
alter table public.perfiles enable row level security;

-- Drop existing policies if any
drop policy if exists admin_all_salones on public.salones;
drop policy if exists operador_read_salones on public.salones;
drop policy if exists admin_all_clientes on public.clientes;
drop policy if exists operador_all_clientes on public.clientes;
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

-- CLIENTES policies
create policy admin_all_clientes on public.clientes
  for all using (
    public.get_user_role() = 'ADMIN'
  );

create policy operador_all_clientes on public.clientes
  for all using (
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
-- Allow all authenticated users to read all perfiles (back-office system)
create policy authenticated_read_perfiles on public.perfiles
  for select 
  to authenticated
  using (true);

-- Allow users to update their own perfil
create policy users_update_own_perfil on public.perfiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role has full access (used by create-user endpoint)
create policy service_role_all_perfiles on public.perfiles
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================
-- SEED DATA
-- ============================================

-- Salones
insert into public.salones (nombre, capacidad, precio_base, descripcion) values
  ('Gran Salón', 200, 15000.00, 'Salón principal con equipamiento completo para eventos grandes'),
  ('Salón Norte', 80, 8000.00, 'Salón mediano ideal para reuniones corporativas'),
  ('Salón Terraza', 50, 6000.00, 'Espacio al aire libre con vista panorámica')
on conflict do nothing;

-- Clientes
insert into public.clientes (nombre, empresa, telefono, email, cuit) values
  ('María González', 'TechCorp SA', '+54 11 4444-5555', 'maria@techcorp.com', '30-12345678-9'),
  ('Juan Pérez', 'Eventos Premium', '+54 11 5555-6666', 'juan@eventospremium.com', '30-87654321-0'),
  ('Ana Martínez', 'Consultora ABC', '+54 11 6666-7777', 'ana@abc.com.ar', '27-11223344-5'),
  ('Carlos Rodríguez', null, '+54 11 7777-8888', 'carlos@email.com', null),
  ('Laura Fernández', 'Empresa XYZ', '+54 11 8888-9999', 'laura@xyz.com', '30-99887766-3')
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
-- insert into public.reservas (id_cliente, id_salon, fecha_inicio, fecha_fin, estado, monto, observaciones, creado_por) values
--   (1, 1, '2025-10-20 18:00:00+00', '2025-10-20 23:00:00+00', 'Confirmado', 15000.00, 'Evento corporativo anual', 'UUID-OF-USER'),
--   (2, 2, '2025-10-22 14:00:00+00', '2025-10-22 18:00:00+00', 'Pendiente', 8000.00, 'Reunión de directorio', 'UUID-OF-USER'),
--   (3, 3, '2025-10-25 21:00:00+00', '2025-10-26 02:00:00+00', 'Pagado', 6000.00, 'Cena de gala - cruza medianoche', 'UUID-OF-USER');

-- ============================================
-- SETUP COMPLETE
-- ============================================
-- Next steps:
-- 1. Create users via Supabase Auth Dashboard
-- 2. Insert perfiles for those users with appropriate roles
-- 3. Test the application
