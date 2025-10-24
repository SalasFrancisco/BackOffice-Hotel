-- Migration: Embed client data into reservas and remove clientes table
-- Run this in Supabase SQL editor. Idempotent where possible.

-- 1) Add new columns to reservas (if not exist)
alter table public.reservas add column if not exists nombre_cliente text;
alter table public.reservas add column if not exists email_cliente text;
alter table public.reservas add column if not exists telefono_cliente text;
alter table public.reservas add column if not exists empresa_cliente text;

-- 2) Backfill from clientes if both tables/columns exist
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reservas' and column_name = 'id_cliente'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clientes'
  ) then
    update public.reservas r set
      nombre_cliente   = coalesce(r.nombre_cliente, c.nombre),
      email_cliente    = coalesce(r.email_cliente, c.email),
      telefono_cliente = coalesce(r.telefono_cliente, c.telefono),
      empresa_cliente  = coalesce(r.empresa, c.empresa)
    from public.clientes c
    where c.id = r.id_cliente;
  end if;
end $$;

-- 3) Enforce NOT NULL on nombre_cliente once backfilled
alter table public.reservas
  alter column nombre_cliente set not null;

-- 4) Drop FK column and table clientes (if exist)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reservas' and column_name = 'id_cliente'
  ) then
    alter table public.reservas drop column id_cliente;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clientes'
  ) then
    drop table public.clientes cascade;
  end if;
end $$;

-- 5) Optional: clean policies referencing clientes (defensive)
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clientes'
  ) then
    drop policy if exists admin_all_clientes on public.clientes;
    drop policy if exists operador_all_clientes on public.clientes;
  end if;
end $$;

