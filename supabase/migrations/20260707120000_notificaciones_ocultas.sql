-- ============================================================================
-- Borrado de notificaciones POR USUARIO.
--
-- La tabla `notificaciones` es compartida (una fila por evento, visible para
-- varios usuarios según su metadata). Hasta ahora "Eliminar" hacía un DELETE
-- físico de esa fila, por lo que afectaba a TODOS los usuarios.
--
-- Esta tabla replica el patrón de `notificaciones_leidas`: registra, por
-- usuario, qué notificaciones ocultó. "Eliminar" pasa a ser un INSERT acá
-- (ocultar solo para vos); la campana y el módulo filtran las ocultas. Nadie
-- le borra notificaciones a los demás.
--
-- Aplicar una vez en el SQL editor de Supabase (o vía `supabase db push`).
-- Es idempotente.
-- ============================================================================

create table if not exists public.notificaciones_ocultas (
  id_notificacion bigint not null
    references public.notificaciones (id) on delete cascade,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (id_notificacion, user_id)
);

create index if not exists notificaciones_ocultas_user_id_idx
  on public.notificaciones_ocultas (user_id);

alter table public.notificaciones_ocultas enable row level security;

-- Cada usuario sólo puede ver / crear / borrar sus propias filas.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notificaciones_ocultas'
      and policyname = 'notificaciones_ocultas_select_own'
  ) then
    create policy notificaciones_ocultas_select_own
      on public.notificaciones_ocultas
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notificaciones_ocultas'
      and policyname = 'notificaciones_ocultas_insert_own'
  ) then
    create policy notificaciones_ocultas_insert_own
      on public.notificaciones_ocultas
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notificaciones_ocultas'
      and policyname = 'notificaciones_ocultas_delete_own'
  ) then
    create policy notificaciones_ocultas_delete_own
      on public.notificaciones_ocultas
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Realtime, para sincronizar el ocultamiento entre pestañas / dispositivos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notificaciones_ocultas'
  ) then
    alter publication supabase_realtime add table public.notificaciones_ocultas;
  end if;
end $$;
