-- ============================================
-- RESERVAS: REGISTRADA POR, MONTO INICIAL Y ESTADO VALIDADO
-- Ejecutar en Supabase SQL Editor
-- ============================================

create extension if not exists btree_gist;

alter table public.reservas
  add column if not exists creado_por uuid references auth.users(id);

alter table public.reservas
  add column if not exists monto_inicial numeric(12,2);

alter table public.reservas
  add column if not exists rango tstzrange generated always as (tstzrange(fecha_inicio, fecha_fin, '[)')) stored;

alter table public.reservas drop constraint if exists reservas_estado_check;
alter table public.reservas add constraint reservas_estado_check
  check (estado in ('Pendiente','Validado Pendiente Seña','Confirmado','Pagado','Cancelado'));

alter table public.reservas drop constraint if exists reservas_no_solape_excl;
alter table public.reservas add constraint reservas_no_solape_excl
  exclude using gist (id_salon with =, rango with &&)
  where (estado in ('Validado Pendiente Seña','Confirmado','Pagado'));

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
      and r.estado in ('Validado Pendiente Seña', 'Confirmado', 'Pagado')
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

create or replace function public.validate_reserva_estado_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado = new.estado then
    return new;
  end if;

  if old.estado = 'Pagado' then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Una reserva en Pagado no puede volver a estados anteriores.',
        old.estado,
        new.estado
      );
  end if;

  if old.estado = 'Cancelado' then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Una reserva cancelada no puede volver a estados anteriores.',
        old.estado,
        new.estado
      );
  end if;

  if old.estado = 'Pendiente' and new.estado not in ('Validado Pendiente Seña', 'Confirmado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Una reserva pendiente solo puede pasar a Validado Pendiente Seña, Confirmado o Cancelado.',
        old.estado,
        new.estado
      );
  end if;

  if old.estado = 'Validado Pendiente Seña' and new.estado not in ('Confirmado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Una reserva validada pendiente de seña solo puede pasar a Confirmado o Cancelado.',
        old.estado,
        new.estado
      );
  end if;

  if old.estado = 'Confirmado' and new.estado not in ('Pagado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Una reserva confirmada solo puede pasar a Pagado o Cancelado.',
        old.estado,
        new.estado
      );
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_validate_estado_transition on public.reservas;
create trigger reservas_validate_estado_transition
before update on public.reservas
for each row
execute function public.validate_reserva_estado_transition();

update public.reservas r
set monto_inicial = round((
  coalesce(r.monto, 0)
  + coalesce((
    select sum(coalesce(rs.cantidad, 0) * coalesce(s.precio, 0))
    from public.reserva_servicios rs
    join public.servicios s on s.id = rs.id_servicio
    where rs.id_reserva = r.id
  ), 0)
)::numeric, 2)
where r.monto_inicial is null
  and nullif(trim(coalesce(r.presupuesto_url, '')), '') is not null;
