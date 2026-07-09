-- ============================================================================
-- Fuerza el cambio de contraseñas "viejas" (creadas con la política anterior).
--
-- Agrega a `perfiles`:
--   · requiere_cambio_password: si el usuario debe cambiar su contraseña.
--   · cambio_password_limite:   fecha límite; pasada esa fecha, el login lo obliga.
--
-- Backfill: marca a TODOS los usuarios activos actuales con un plazo de gracia
-- de 14 días. Los usuarios nuevos (creados después) quedan en false por defecto
-- (según la decisión: las claves que pone el admin no fuerzan cambio).
--
-- Ejecutar una vez en el SQL editor de Supabase (o `supabase db push`).
-- Es idempotente (no re-marca a quien ya cambió).
-- ============================================================================

alter table public.perfiles
  add column if not exists requiere_cambio_password boolean not null default false;

alter table public.perfiles
  add column if not exists cambio_password_limite timestamptz;

update public.perfiles
set requiere_cambio_password = true,
    cambio_password_limite = now() + interval '14 days'
where coalesce(activo, true) = true
  and requiere_cambio_password = false
  and cambio_password_limite is null;

comment on column public.perfiles.requiere_cambio_password is
  'Si es true, el usuario debe cambiar su contraseña (política de seguridad).';
comment on column public.perfiles.cambio_password_limite is
  'Fecha límite para cambiar la contraseña; pasada, el login obliga el cambio.';
