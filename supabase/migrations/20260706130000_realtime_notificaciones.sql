-- ============================================================================
-- Habilita Realtime para las notificaciones, así aparecen al instante en la
-- campana y el módulo (y salta el toast) sin esperar al refresco periódico.
--
-- Sin esto, el sistema igual funciona (hay polling de respaldo cada 60-90 s),
-- pero la entrega no es instantánea.
--
-- Ejecutar una vez en el SQL editor de Supabase (o vía `supabase db push`).
-- Es idempotente: no falla si las tablas ya están en la publicación.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notificaciones'
  ) then
    alter publication supabase_realtime add table public.notificaciones;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notificaciones_leidas'
  ) then
    alter publication supabase_realtime add table public.notificaciones_leidas;
  end if;
end $$;
