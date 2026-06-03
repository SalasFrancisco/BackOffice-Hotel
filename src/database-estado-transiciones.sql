-- ============================================
-- RESERVAS: VALIDACION DE TRANSICIONES DE ESTADO
-- Ejecutar en Supabase SQL Editor
-- ============================================

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
execute procedure public.validate_reserva_estado_transition();
