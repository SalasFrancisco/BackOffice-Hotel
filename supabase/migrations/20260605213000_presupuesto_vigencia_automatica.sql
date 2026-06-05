-- Vigencia de 7 días desde la emisión del presupuesto.

alter table public.reservas
  add column if not exists presupuesto_emitido_en timestamptz;

update public.reservas
set presupuesto_emitido_en = coalesce(actualizado_en, creado_en, now())
where presupuesto_emitido_en is null
  and nullif(btrim(presupuesto_url), '') is not null;

create index if not exists reservas_presupuesto_emitido_en_pendientes_idx
  on public.reservas (presupuesto_emitido_en)
  where estado in ('Pendiente validación', 'Validado');

create or replace function public.cancelar_reservas_presupuesto_vencido()
returns table (
  id bigint,
  cliente_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detalle constant text :=
    'La reserva se dio de baja automáticamente ya que pasaron los 7 días de vigencia del presupuesto.';
begin
  perform set_config('app.reserva_estado_detalle', v_detalle, true);

  return query
  with actualizadas as (
    update public.reservas r
    set estado = 'Cancelado'
    where r.estado in ('Pendiente validación', 'Validado')
      and r.presupuesto_emitido_en is not null
      and r.presupuesto_emitido_en + interval '7 days' <= now()
    returning
      r.id,
      r.cliente_nombre,
      r.presupuesto_emitido_en
  ),
  notificaciones_insertadas as (
    insert into public.notificaciones (
      tipo,
      titulo,
      mensaje,
      reserva_id,
      metadata
    )
    select
      'ESTADO_CAMBIADO',
      format('Reserva #%s cancelada automáticamente', a.id),
      format(
        'La reserva #%s de %s fue cancelada automáticamente porque pasaron los 7 días de vigencia del presupuesto.',
        a.id,
        coalesce(nullif(btrim(a.cliente_nombre), ''), 'Sin nombre')
      ),
      a.id,
      jsonb_build_object(
        'origen', 'reserva_vencimiento_auto',
        'alerta', 'cancelacion_automatica',
        'dias_restantes', 0,
        'cycle_key', a.presupuesto_emitido_en::text,
        'motivo', 'presupuesto_vencido',
        'regla_dias', 7,
        'regla_tipo', 'vigencia_presupuesto',
        'estado', 'Cancelado'
      )
    from actualizadas a
    returning reserva_id
  )
  select
    a.id,
    a.cliente_nombre
  from actualizadas a;
end;
$$;

revoke all on function public.cancelar_reservas_presupuesto_vencido() from public;
revoke all on function public.cancelar_reservas_presupuesto_vencido() from anon;
revoke all on function public.cancelar_reservas_presupuesto_vencido() from authenticated;
grant execute on function public.cancelar_reservas_presupuesto_vencido() to service_role;

create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'cancelar-reservas-presupuesto-vencido'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'cancelar-reservas-presupuesto-vencido',
    '0 * * * *',
    'select public.cancelar_reservas_presupuesto_vencido();'
  );
end;
$$;
