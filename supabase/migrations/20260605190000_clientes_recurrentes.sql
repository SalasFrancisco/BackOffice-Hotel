-- Entidad de clientes recurrentes para reservas creadas desde el back office.

create table if not exists public.clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  email text not null,
  telefono text not null,
  email_normalizado text not null,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint clientes_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint clientes_email_no_vacio check (btrim(email) <> ''),
  constraint clientes_telefono_no_vacio check (btrim(telefono) <> '')
);

create unique index if not exists clientes_email_normalizado_uidx
  on public.clientes (email_normalizado);

create index if not exists clientes_nombre_lower_idx
  on public.clientes (lower(nombre));

alter table public.clientes enable row level security;

alter table public.reservas
  add column if not exists id_cliente bigint references public.clientes(id);

create index if not exists reservas_id_cliente_idx
  on public.reservas (id_cliente);

create or replace function public.set_cliente_actualizado_en()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists clientes_set_actualizado_en on public.clientes;

create trigger clientes_set_actualizado_en
before update on public.clientes
for each row
execute function public.set_cliente_actualizado_en();

create or replace function public.vincular_cliente_reserva_backoffice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_email text;
  v_email_normalizado text;
  v_telefono text;
  v_cliente_id bigint;
begin
  if new.creado_por is null then
    return new;
  end if;

  v_nombre := nullif(btrim(new.cliente_nombre), '');
  v_email := nullif(btrim(new.cliente_email), '');
  v_email_normalizado := lower(v_email);
  v_telefono := nullif(regexp_replace(coalesce(new.cliente_telefono, ''), '[^0-9]', '', 'g'), '');

  if v_nombre is null or v_email is null or v_telefono is null then
    return new;
  end if;

  if new.id_cliente is not null then
    update public.clientes
    set
      nombre = v_nombre,
      email = v_email,
      email_normalizado = v_email_normalizado,
      telefono = v_telefono
    where id = new.id_cliente
    returning id into v_cliente_id;

    if v_cliente_id is null then
      raise exception using
        errcode = 'P0002',
        message = 'El cliente recurrente seleccionado ya no existe.';
    end if;
  else
    insert into public.clientes (
      nombre,
      email,
      telefono,
      email_normalizado,
      creado_por
    )
    values (
      v_nombre,
      v_email,
      v_telefono,
      v_email_normalizado,
      new.creado_por
    )
    on conflict (email_normalizado) do update
    set
      nombre = excluded.nombre,
      email = excluded.email,
      telefono = excluded.telefono
    returning id into v_cliente_id;
  end if;

  new.id_cliente := v_cliente_id;
  return new;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'Ya existe otro cliente recurrente con ese email.';
end;
$$;

drop trigger if exists reservas_vincular_cliente_backoffice on public.reservas;

create trigger reservas_vincular_cliente_backoffice
before insert on public.reservas
for each row
execute function public.vincular_cliente_reserva_backoffice();

insert into public.clientes (
  nombre,
  email,
  telefono,
  email_normalizado,
  creado_por,
  creado_en,
  actualizado_en
)
select
  source.cliente_nombre,
  source.cliente_email,
  source.cliente_telefono,
  source.email_normalizado,
  source.creado_por,
  source.creado_en,
  now()
from (
  select distinct on (lower(btrim(r.cliente_email)))
    btrim(r.cliente_nombre) as cliente_nombre,
    btrim(r.cliente_email) as cliente_email,
    regexp_replace(r.cliente_telefono, '[^0-9]', '', 'g') as cliente_telefono,
    lower(btrim(r.cliente_email)) as email_normalizado,
    r.creado_por,
    coalesce(r.creado_en, now()) as creado_en
  from public.reservas r
  where r.creado_por is not null
    and nullif(btrim(r.cliente_nombre), '') is not null
    and nullif(btrim(r.cliente_email), '') is not null
    and nullif(regexp_replace(coalesce(r.cliente_telefono, ''), '[^0-9]', '', 'g'), '') is not null
  order by lower(btrim(r.cliente_email)), r.creado_en desc
) source
on conflict (email_normalizado) do update
set
  nombre = excluded.nombre,
  email = excluded.email,
  telefono = excluded.telefono;

update public.reservas r
set id_cliente = c.id
from public.clientes c
where r.id_cliente is null
  and r.creado_por is not null
  and c.email_normalizado = lower(btrim(r.cliente_email));

create or replace function public.buscar_clientes_recurrentes(
  p_busqueda text,
  p_limite integer default 8
)
returns table (
  id bigint,
  nombre text,
  email text,
  telefono text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_busqueda text;
  v_limite integer;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.perfiles p
    where p.user_id = auth.uid()
      and p.activo is not false
      and upper(coalesce(p.rol::text, '')) in ('ADMIN', 'OPERADOR')
  ) then
    raise exception using
      errcode = '42501',
      message = 'No tiene permisos para consultar clientes recurrentes.';
  end if;

  v_busqueda := lower(btrim(coalesce(p_busqueda, '')));
  v_limite := greatest(1, least(coalesce(p_limite, 8), 20));

  if v_busqueda = '' then
    return;
  end if;

  return query
  select
    c.id,
    c.nombre,
    c.email,
    c.telefono
  from public.clientes c
  where position(v_busqueda in lower(c.nombre)) > 0
  order by
    case when lower(c.nombre) like v_busqueda || '%' then 0 else 1 end,
    c.nombre,
    c.id
  limit v_limite;
end;
$$;

revoke all on function public.buscar_clientes_recurrentes(text, integer) from public;
grant execute on function public.buscar_clientes_recurrentes(text, integer) to authenticated;
