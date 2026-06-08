-- Public requests must be recorded even when the salon already has an active booking.

create or replace function public.prevent_reserva_overlap_with_locked_reservas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = U&'Pendiente validaci\00F3n' and new.creado_por is null then
    return new;
  end if;

  if new.estado = 'Cancelado' then
    return new;
  end if;

  if exists (
    select 1
    from public.reservas r
    where r.id <> coalesce(new.id, -1)
      and r.id_salon = new.id_salon
      and tstzrange(r.fecha_inicio, r.fecha_fin, '[)') && tstzrange(new.fecha_inicio, new.fecha_fin, '[)')
      and r.estado in ('Confirmado', 'Pagado')
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Ya existe una reserva bloqueante en ese rango para el salon seleccionado.';
  end if;

  return new;
end;
$$;
