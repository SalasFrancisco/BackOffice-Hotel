-- ============================================
-- SECURITY HARDENING
-- Ejecutar en Supabase SQL Editor despues de revisar en staging
-- ============================================

-- 1) Perfiles: evitar lectura global y autoescalado de rol
create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select rol from public.perfiles where user_id = auth.uid();
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
  end if;

  return NEW;
end;
$$;

drop trigger if exists perfiles_prevent_unsafe_self_update on public.perfiles;
create trigger perfiles_prevent_unsafe_self_update
before update on public.perfiles
for each row execute function public.prevent_unsafe_self_perfil_update();

alter table public.perfiles enable row level security;

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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy service_role_all_perfiles on public.perfiles
  for all
  to service_role
  using (true)
  with check (true);

-- 2) Rate limit persistente para Supabase Functions
create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

drop policy if exists service_role_all_rate_limits on public.rate_limits;
create policy service_role_all_rate_limits on public.rate_limits
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.check_rate_limit(
  p_key text,
  p_max_count int,
  p_window_seconds int,
  p_block_seconds int
)
returns table (
  allowed boolean,
  remaining int,
  retry_after_seconds int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_record public.rate_limits%rowtype;
  v_window_interval interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_block_interval interval := make_interval(secs => greatest(p_block_seconds, 1));
  v_max_count int := greatest(p_max_count, 1);
begin
  insert into public.rate_limits (key, count, window_start, blocked_until, updated_at)
  values (p_key, 0, v_now, null, v_now)
  on conflict (key) do nothing;

  select *
  into v_record
  from public.rate_limits
  where key = p_key
  for update;

  if v_record.blocked_until is not null and v_record.blocked_until > v_now then
    allowed := false;
    remaining := 0;
    retry_after_seconds := ceil(extract(epoch from (v_record.blocked_until - v_now)))::int;
    return next;
    return;
  end if;

  if v_record.window_start <= v_now - v_window_interval then
    update public.rate_limits
    set count = 1,
        window_start = v_now,
        blocked_until = null,
        updated_at = v_now
    where key = p_key;

    allowed := true;
    remaining := v_max_count - 1;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  if v_record.count >= v_max_count then
    update public.rate_limits
    set blocked_until = v_now + v_block_interval,
        updated_at = v_now
    where key = p_key;

    allowed := false;
    remaining := 0;
    retry_after_seconds := greatest(p_block_seconds, 1);
    return next;
    return;
  end if;

  update public.rate_limits
  set count = v_record.count + 1,
      blocked_until = null,
      updated_at = v_now
  where key = p_key;

  allowed := true;
  remaining := greatest(v_max_count - v_record.count - 1, 0);
  retry_after_seconds := 0;
  return next;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int, int) from anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int, int) to service_role;

-- 3) Notificaciones: lectura para backoffice, inserts solo por admin/service role/triggers
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
  for all
  to authenticated
  using (public.get_user_role() = 'ADMIN')
  with check (public.get_user_role() = 'ADMIN');

create policy operador_read_notificaciones on public.notificaciones
  for select
  to authenticated
  using (public.get_user_role() in ('ADMIN', 'OPERADOR'));

create policy admin_all_notificaciones_leidas on public.notificaciones_leidas
  for all
  to authenticated
  using (public.get_user_role() = 'ADMIN')
  with check (public.get_user_role() = 'ADMIN');

create policy users_select_notificaciones_leidas on public.notificaciones_leidas
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy users_insert_notificaciones_leidas on public.notificaciones_leidas
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.get_user_role() in ('ADMIN', 'OPERADOR')
  );

create policy users_delete_notificaciones_leidas on public.notificaciones_leidas
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4) Storage: presupuestos siempre privado
update storage.buckets
set public = false
where id = 'presupuestos';
