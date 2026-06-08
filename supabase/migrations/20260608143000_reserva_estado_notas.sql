-- Permite registrar notas sobre el estado actual y exponerlas en el historial.

create or replace function public.cambiar_estado_reserva(
  p_reserva_id bigint,
  p_nuevo_estado text,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_actual text;
  v_detalle text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.perfiles p
    where p.user_id = auth.uid()
      and p.activo is not false
      and upper(coalesce(p.rol::text, '')) in ('ADMIN', 'OPERADOR')
  ) then
    raise exception using
      errcode = '42501',
      message = 'No tiene permisos para gestionar el estado de la reserva.';
  end if;

  if p_nuevo_estado is null or p_nuevo_estado not in (
    U&'Pendiente validaci\00F3n',
    'Validado',
    'Confirmado',
    'Pagado',
    'Cancelado'
  ) then
    raise exception using
      errcode = '22023',
      message = 'El estado seleccionado no es valido.';
  end if;

  v_detalle := nullif(trim(p_detalle), '');

  if char_length(coalesce(v_detalle, '')) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'La observacion no puede superar los 1000 caracteres.';
  end if;

  select r.estado
  into v_estado_actual
  from public.reservas r
  where r.id = p_reserva_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La reserva indicada no existe.';
  end if;

  if v_estado_actual = p_nuevo_estado then
    if v_detalle is null then
      raise exception using
        errcode = '22023',
        message = 'Debe escribir una observacion para registrar una nota en el estado actual.';
    end if;

    insert into public.auditoria_reservas (
      id_reserva,
      estado_anterior,
      estado_nuevo,
      usuario_id,
      accion,
      detalle
    )
    values (
      p_reserva_id,
      v_estado_actual,
      v_estado_actual,
      auth.uid(),
      'NOTE',
      v_detalle
    );

    return;
  end if;

  perform set_config(
    'app.reserva_estado_detalle',
    coalesce(v_detalle, ''),
    true
  );

  update public.reservas
  set estado = p_nuevo_estado
  where id = p_reserva_id;
end;
$$;

revoke all on function public.cambiar_estado_reserva(bigint, text, text) from public;
grant execute on function public.cambiar_estado_reserva(bigint, text, text) to authenticated;
