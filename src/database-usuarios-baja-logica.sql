-- ============================================
-- BAJA LOGICA DE USUARIOS
-- Ejecutar en Supabase SQL Editor sobre una base existente.
-- ============================================

alter table public.perfiles
  add column if not exists activo boolean not null default true;

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

drop policy if exists admin_all_perfiles on public.perfiles;
drop policy if exists users_read_own_perfil on public.perfiles;
drop policy if exists users_read_all_perfiles on public.perfiles;
drop policy if exists authenticated_read_perfiles on public.perfiles;
drop policy if exists users_update_own_perfil on public.perfiles;
drop policy if exists service_role_all_perfiles on public.perfiles;

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

create policy service_role_all_perfiles on public.perfiles
  for all
  to service_role
  using (true)
  with check (true);
