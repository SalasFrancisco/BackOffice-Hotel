-- Conserva el precio cotizado de cada servicio dentro de la reserva. Los cambios
-- posteriores en el catalogo no deben modificar reservas ya presupuestadas,
-- confirmadas o pagadas.

alter table public.reserva_servicios
  add column if not exists precio_unitario numeric(12, 2);

update public.reserva_servicios rs
set precio_unitario = s.precio
from public.servicios s
where s.id = rs.id_servicio
  and rs.precio_unitario is null;

-- Una relacion valida siempre debe apuntar a un servicio existente. El fallback
-- evita que datos legados incompletos bloqueen la migracion.
update public.reserva_servicios
set precio_unitario = 0
where precio_unitario is null;

alter table public.reserva_servicios
  alter column precio_unitario set not null;

alter table public.reserva_servicios
  drop constraint if exists reserva_servicios_precio_unitario_no_negativo;

alter table public.reserva_servicios
  add constraint reserva_servicios_precio_unitario_no_negativo
  check (precio_unitario >= 0);

create or replace function public.asignar_precio_historico_reserva_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_precio numeric(12, 2);
  v_capturar_precio boolean;
begin
  v_capturar_precio := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    v_capturar_precio := new.id_servicio is distinct from old.id_servicio;
  end if;

  if v_capturar_precio then
    select s.precio
    into v_precio
    from public.servicios s
    where s.id = new.id_servicio;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'El servicio adicional seleccionado no existe.';
    end if;

    new.precio_unitario := coalesce(v_precio, 0);
  else
    -- El precio historico es inmutable. Para actualizar una seleccion pendiente,
    -- la aplicacion reemplaza la fila y se toma el precio vigente en ese momento.
    new.precio_unitario := old.precio_unitario;
  end if;

  return new;
end;
$$;

drop trigger if exists reserva_servicios_asignar_precio_historico
  on public.reserva_servicios;

create trigger reserva_servicios_asignar_precio_historico
before insert or update on public.reserva_servicios
for each row
execute function public.asignar_precio_historico_reserva_servicio();

create or replace function public.proteger_servicios_reserva_facturada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva_id bigint;
begin
  v_reserva_id := case when tg_op = 'DELETE' then old.id_reserva else new.id_reserva end;

  if exists (
    select 1
    from public.reservas r
    where r.id = v_reserva_id
      and r.estado in ('Confirmado', 'Pagado')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Los servicios de una reserva confirmada o pagada no se pueden modificar.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists reserva_servicios_proteger_facturados
  on public.reserva_servicios;

create trigger reserva_servicios_proteger_facturados
before insert or update or delete on public.reserva_servicios
for each row
execute function public.proteger_servicios_reserva_facturada();

create or replace function public.proteger_monto_reserva_facturada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado in ('Confirmado', 'Pagado') then
    new.monto := old.monto;
  end if;
  return new;
end;
$$;

drop trigger if exists reservas_proteger_monto_facturado on public.reservas;

create trigger reservas_proteger_monto_facturado
before update on public.reservas
for each row
execute function public.proteger_monto_reserva_facturada();

comment on column public.reserva_servicios.precio_unitario is
  'Precio unitario del servicio al incorporarlo a la reserva; no cambia con el catalogo.';
