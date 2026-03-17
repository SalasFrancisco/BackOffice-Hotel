-- ============================================
-- NOTIFICACIONES BACK-OFFICE
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1) TABLAS
create table if not exists public.notificaciones (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('RESERVA_NUEVA','RESERVA_EDITADA','ESTADO_CAMBIADO','RESERVA_ELIMINADA')),
  titulo text not null,
  mensaje text not null,
  reserva_id bigint references public.reservas(id) on delete set null,
  metadata jsonb,
  creado_en timestamptz default now()
);

create table if not exists public.notificaciones_leidas (
  id bigint generated always as identity primary key,
  id_notificacion bigint not null references public.notificaciones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  leido_en timestamptz default now(),
  unique (id_notificacion, user_id)
);

create index if not exists idx_notificaciones_creado_en on public.notificaciones(creado_en desc);
create index if not exists idx_notificaciones_leidas_user on public.notificaciones_leidas(user_id, id_notificacion);

-- 2) RLS
alter table public.notificaciones enable row level security;
alter table public.notificaciones_leidas enable row level security;

drop policy if exists admin_all_notificaciones on public.notificaciones;
drop policy if exists operador_read_notificaciones on public.notificaciones;
drop policy if exists operador_insert_notificaciones on public.notificaciones;

drop policy if exists admin_all_notificaciones_leidas on public.notificaciones_leidas;
drop policy if exists users_select_notificaciones_leidas on public.notificaciones_leidas;
drop policy if exists users_insert_notificaciones_leidas on public.notificaciones_leidas;
drop policy if exists users_delete_notificaciones_leidas on public.notificaciones_leidas;

create policy admin_all_notificaciones on public.notificaciones
  for all using (public.get_user_role() = 'ADMIN');

create policy operador_read_notificaciones on public.notificaciones
  for select using (public.get_user_role() in ('ADMIN', 'OPERADOR'));

create policy operador_insert_notificaciones on public.notificaciones
  for insert with check (public.get_user_role() in ('ADMIN', 'OPERADOR'));

create policy admin_all_notificaciones_leidas on public.notificaciones_leidas
  for all using (public.get_user_role() = 'ADMIN');

create policy users_select_notificaciones_leidas on public.notificaciones_leidas
  for select using (auth.uid() = user_id);

create policy users_insert_notificaciones_leidas on public.notificaciones_leidas
  for insert with check (
    auth.uid() = user_id
    and public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

create policy users_delete_notificaciones_leidas on public.notificaciones_leidas
  for delete using (auth.uid() = user_id);

-- 3) TRIGGERS AUTOMATICOS SOBRE RESERVAS
create or replace function public.generar_notificacion_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo notificar altas provenientes del formulario publico de salones.
  -- En el flujo actual esas reservas se insertan con creado_por NULL.
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  if NEW.creado_por is not null then
    return NEW;
  end if;

  insert into public.notificaciones (tipo, titulo, mensaje, reserva_id, metadata)
  values (
    'RESERVA_NUEVA',
    'Nueva reserva desde Salones',
    format(
      'Se creo la reserva #%s de %s en estado %s.',
      NEW.id,
      coalesce(NEW.cliente_nombre, 'Sin nombre'),
      NEW.estado
    ),
    NEW.id,
    jsonb_build_object(
      'cliente_nombre', NEW.cliente_nombre,
      'estado', NEW.estado,
      'id_salon', NEW.id_salon,
      'origen', 'salones_form',
      'canal', 'web_publica'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists reservas_notify_insert on public.reservas;
create trigger reservas_notify_insert
after insert on public.reservas
for each row execute function public.generar_notificacion_reserva();

drop trigger if exists reservas_notify_update on public.reservas;
drop trigger if exists reservas_notify_delete on public.reservas;
