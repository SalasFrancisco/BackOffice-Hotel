-- Centraliza los cambios de estado y registra una justificacion opcional.

create table if not exists public.auditoria_reservas (
  id bigint generated always as identity primary key,
  id_reserva bigint not null references public.reservas(id) on delete cascade,
  estado_anterior text not null,
  estado_nuevo text not null,
  usuario_id uuid,
  accion text not null default 'UPDATE',
  creado_en timestamptz not null default now()
);

alter table public.auditoria_reservas
  add column if not exists detalle text;

alter table public.auditoria_reservas enable row level security;

create index if not exists auditoria_reservas_id_reserva_creado_en_idx
  on public.auditoria_reservas (id_reserva, creado_en desc);

create or replace function public.audit_reserva_estado_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb;
  v_usuario_id uuid;
  v_detalle text;
begin
  if TG_OP = 'UPDATE' and old.estado is distinct from new.estado then
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_usuario_id := auth.uid();

    if v_usuario_id is null and v_claims is not null then
      v_usuario_id := nullif(v_claims ->> 'sub', '')::uuid;
    end if;

    v_detalle := nullif(trim(current_setting('app.reserva_estado_detalle', true)), '');

    insert into public.auditoria_reservas (
      id_reserva,
      estado_anterior,
      estado_nuevo,
      usuario_id,
      detalle
    )
    values (
      new.id,
      old.estado,
      new.estado,
      v_usuario_id,
      left(v_detalle, 1000)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reservas_audit_estado_cambio on public.reservas;

create trigger reservas_audit_estado_cambio
after update of estado on public.reservas
for each row
execute function public.audit_reserva_estado_cambio();

create or replace function public.cambiar_estado_reserva(
  p_reserva_id bigint,
  p_nuevo_estado text,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_actual text;
  v_detalle text;
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
      message = 'No tiene permisos para cambiar el estado de la reserva.';
  end if;

  if p_nuevo_estado not in (
    'Pendiente validación',
    'Validado',
    'Confirmado',
    'Pagado',
    'Cancelado'
  ) then
    raise exception using
      errcode = '22023',
      message = 'El estado seleccionado no es válido.';
  end if;

  v_detalle := nullif(trim(p_detalle), '');

  if char_length(coalesce(v_detalle, '')) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'La justificación no puede superar los 1000 caracteres.';
  end if;

  select r.estado
  into v_estado_actual
  from public.reservas r
  where r.id = p_reserva_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La reserva indicada no existe.';
  end if;

  if v_estado_actual = p_nuevo_estado then
    raise exception using
      errcode = '22023',
      message = 'La reserva ya se encuentra en el estado seleccionado.';
  end if;

  perform set_config(
    'app.reserva_estado_detalle',
    coalesce(v_detalle, ''),
    true
  );

  update public.reservas
  set estado = p_nuevo_estado
  where id = p_reserva_id;
end;
$$;

create or replace function public.obtener_historial_estado_reserva(
  p_reserva_id bigint
)
returns table (
  id bigint,
  estado_anterior text,
  estado_nuevo text,
  detalle text,
  usuario_id uuid,
  usuario_nombre text,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
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
      message = 'No tiene permisos para consultar el historial de la reserva.';
  end if;

  return query
  select
    ar.id,
    ar.estado_anterior,
    ar.estado_nuevo,
    ar.detalle,
    ar.usuario_id,
    coalesce(
      nullif(trim(p.nombre), ''),
      case when ar.usuario_id is null then 'Sistema' else 'Usuario back office' end
    ) as usuario_nombre,
    ar.creado_en
  from public.auditoria_reservas ar
  left join public.perfiles p on p.user_id = ar.usuario_id
  where ar.id_reserva = p_reserva_id
  order by ar.creado_en desc, ar.id desc;
end;
$$;

revoke all on function public.cambiar_estado_reserva(bigint, text, text) from public;
revoke all on function public.obtener_historial_estado_reserva(bigint) from public;

grant execute on function public.cambiar_estado_reserva(bigint, text, text) to authenticated;
grant execute on function public.obtener_historial_estado_reserva(bigint) to authenticated;
