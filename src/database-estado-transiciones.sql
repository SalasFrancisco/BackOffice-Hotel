-- ============================================
-- RESERVAS: VALIDACION DE TRANSICIONES DE ESTADO
-- Ejecutar en Supabase SQL Editor
-- ============================================

create or replace function public.validate_reserva_estado_transition()
returns trigger
language plpgsql
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

  if old.estado = 'Pendiente' and new.estado not in ('Confirmado', 'Cancelado') then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Una reserva pendiente solo puede pasar a Confirmado o Cancelado.',
        old.estado,
        new.estado
      );
  end if;

  if new.estado = 'Pagado' and old.estado <> 'Confirmado' then
    raise exception using
      errcode = '23514',
      message = format(
        'Transicion de estado no permitida: %s -> %s. Para pasar a Pagado, la reserva debe estar en Confirmado.',
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
