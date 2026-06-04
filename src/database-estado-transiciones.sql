-- ============================================
-- RESERVAS: VALIDACION DE TRANSICIONES DE ESTADO
-- Ejecutar en Supabase SQL Editor
-- ============================================

drop trigger if exists reservas_validate_estado_transition on public.reservas;

alter table public.reservas drop constraint if exists reservas_estado_check;

update public.reservas
set estado = 'Pendiente validación'
where estado = 'Pendiente';

update public.reservas
set estado = 'Validado Pendiente de Seña'
where estado = 'Validado Pendiente Seña';

alter table public.reservas
add constraint reservas_estado_check
check (estado in (
  'Pendiente validación',
  'Validado Pendiente de Seña',
  'Confirmado',
  'Pagado',
  'Cancelado'
));

create or replace function public.validate_reserva_estado_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado = new.estado then
    return new;
  end if;

  if old.estado in ('Pagado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Pagado y Cancelado son estados finales.',
        old.estado,
        new.estado
      );
  end if;

  if old.estado = 'Pendiente validación'
    and new.estado not in ('Validado Pendiente de Seña', 'Confirmado', 'Pagado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Pendiente validacion puede pasar a Validado Pendiente de Sena, Confirmado, Pagado o Cancelado.',
        old.estado,
        new.estado
      );
  end if;

  if old.estado = 'Validado Pendiente de Seña'
    and new.estado not in ('Confirmado', 'Pagado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Validado Pendiente de Sena puede pasar a Confirmado, Pagado o Cancelado.',
        old.estado,
        new.estado
      );
  end if;

  if old.estado = 'Confirmado' and new.estado not in ('Pagado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Confirmado solo puede pasar a Pagado o Cancelado.',
        old.estado,
        new.estado
      );
  end if;

  return new;
end;
$$;

create trigger reservas_validate_estado_transition
before update on public.reservas
for each row
execute function public.validate_reserva_estado_transition();
