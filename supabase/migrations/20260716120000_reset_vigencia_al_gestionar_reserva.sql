-- Reinicia el contador de vigencia del presupuesto (presupuesto_emitido_en) cuando
-- el personal GESTIONA la reserva: cambia el estado o registra una nota. Objetivo:
-- una reserva en gestion/negociacion activa no debe auto-cancelarse a los 7 dias.
--
-- NO cambia la regla de vigencia (7 dias desde presupuesto_emitido_en); solo agrega el
-- reinicio del contador ante estas acciones, reutilizando el mismo campo. Antes, el
-- contador solo se reiniciaba al REGENERAR el presupuesto (edicion completa); cambiar de
-- estado o agregar una nota no lo reiniciaban.
--
-- Seguridad: solo reinicia cuando ya existe un presupuesto emitido
-- (presupuesto_emitido_en not null). Nunca inicia el contador en una reserva que nunca
-- tuvo presupuesto (esas siguen sin ser alcanzadas por la auto-cancelacion por vigencia).
--
-- Idempotente (create or replace). No requiere redeploy del Edge Function; se aplica con
-- `supabase db push` o pegando este archivo en el SQL editor.

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

    -- Gestion (nota): reinicia la vigencia solo si ya habia presupuesto emitido.
    update public.reservas
    set presupuesto_emitido_en = now()
    where id = p_reserva_id
      and presupuesto_emitido_en is not null;

    return;
  end if;

  perform set_config(
    'app.reserva_estado_detalle',
    coalesce(v_detalle, ''),
    true
  );

  -- Cambio de estado: reinicia la vigencia (si ya habia presupuesto emitido) junto al estado.
  update public.reservas
  set estado = p_nuevo_estado,
      presupuesto_emitido_en = case
        when presupuesto_emitido_en is not null then now()
        else presupuesto_emitido_en
      end
  where id = p_reserva_id;
end;
$$;

revoke all on function public.cambiar_estado_reserva(bigint, text, text) from public;
grant execute on function public.cambiar_estado_reserva(bigint, text, text) to authenticated;
