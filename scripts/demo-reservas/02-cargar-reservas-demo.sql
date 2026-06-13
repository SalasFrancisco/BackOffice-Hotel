-- Carga deterministica de reservas ficticias para evaluar varios meses de operacion.
--
-- Lote: operacion-hotel-v1
-- Cantidad: 240 reservas
-- Periodo: 8 meses hacia atras y 4 meses hacia adelante
--
-- Este script:
-- - no envia emails;
-- - no genera PDFs;
-- - no crea notificaciones;
-- - no crea clientes recurrentes;
-- - identifica todos los registros mediante DEMO_LOTE en observaciones;
-- - se ejecuta dentro de una transaccion;
-- - se niega a duplicar el mismo lote.

begin;

set local timezone = 'America/Argentina/Buenos_Aires';

do $seed$
declare
  v_batch_id constant text := 'operacion-hotel-v1';
  v_marker constant text := '[DEMO_LOTE:operacion-hotel-v1]';
  v_total_reservas constant integer := 240;
  v_meses_pasados constant integer := 8;
  v_meses_futuros constant integer := 4;

  v_nombres constant text[] := array[
    'Agustina Rios',
    'Bruno Herrera',
    'Camila Acosta',
    'Diego Peralta',
    'Elena Suarez',
    'Federico Molina',
    'Gabriela Romero',
    'Hernan Castro',
    'Isabel Vega',
    'Joaquin Navarro',
    'Karina Ortiz',
    'Leonardo Medina',
    'Mariana Luna',
    'Nicolas Cabrera',
    'Olivia Arias',
    'Pablo Gimenez'
  ];
  v_empresas constant text[] := array[
    'Andes Tecnologia',
    'Grupo Centro',
    'Horizonte Salud',
    'Logistica Federal',
    'Mercado Norte',
    'Nova Energia',
    'Pampa Alimentos',
    'Red Educativa'
  ];
  v_tipos_evento constant text[] := array[
    'Congreso corporativo',
    'Cena de fin de ano',
    'Capacitacion interna',
    'Presentacion de producto',
    'Casamiento',
    'Jornada medica',
    'Convencion comercial',
    'Desayuno de trabajo',
    'Acto academico',
    'Encuentro institucional'
  ];

  v_inicio_periodo date;
  v_fin_periodo date;
  v_dias_periodo integer;
  v_fecha_evento date;
  v_fecha_inicio timestamptz;
  v_fecha_fin timestamptz;
  v_creado_en timestamptz;
  v_actualizado_en timestamptz;
  v_estado text;
  v_reserva_id bigint;
  v_salon_id bigint;
  v_salon_capacidad integer;
  v_salon_precio numeric;
  v_distribucion_id bigint;
  v_distribucion_capacidad integer;
  v_capacidad_efectiva integer;
  v_cantidad_personas integer;
  v_monto numeric;
  v_monto_inicial numeric;
  v_duracion_horas integer;
  v_hora_inicio integer;
  v_servicios_cantidad integer;
  v_salon_count integer;
  v_distribucion_count integer;
  v_servicio_count integer;
  v_intentos integer;
  v_tiene_conflicto boolean;
  v_historial_fecha timestamptz;
  i integer;
begin
  if exists (
    select 1
    from public.reservas
    where observaciones like '%' || v_marker || '%'
  ) then
    raise exception
      'El lote % ya existe. Ejecute 03-eliminar-reservas-demo.sql antes de volver a cargarlo.',
      v_batch_id;
  end if;

  select count(*)
  into v_salon_count
  from public.salones
  where coalesce(activo, true);

  if v_salon_count = 0 then
    raise exception 'No hay salones activos para generar reservas demo.';
  end if;

  select count(*)
  into v_servicio_count
  from public.servicios
  where coalesce(activo, true);

  v_inicio_periodo := (current_date - make_interval(months => v_meses_pasados))::date;
  v_fin_periodo := (current_date + make_interval(months => v_meses_futuros))::date;
  v_dias_periodo := greatest(1, v_fin_periodo - v_inicio_periodo);

  for i in 1..v_total_reservas loop
    select
      s.id,
      greatest(1, coalesce(s.capacidad, 1)),
      greatest(0, coalesce(s.precio_base, 0))
    into
      v_salon_id,
      v_salon_capacidad,
      v_salon_precio
    from public.salones s
    where coalesce(s.activo, true)
    order by s.id
    offset mod((i - 1) * 5, v_salon_count)
    limit 1;

    select count(*)
    into v_distribucion_count
    from public.distribuciones d
    where d.id_salon = v_salon_id;

    v_distribucion_id := null;
    v_distribucion_capacidad := null;

    if v_distribucion_count > 0 and mod(i, 5) <> 0 then
      select d.id, greatest(1, coalesce(d.capacidad, v_salon_capacidad))
      into v_distribucion_id, v_distribucion_capacidad
      from public.distribuciones d
      where d.id_salon = v_salon_id
      order by d.id
      offset mod((i - 1) * 3, v_distribucion_count)
      limit 1;
    end if;

    v_capacidad_efectiva := least(
      v_salon_capacidad,
      coalesce(v_distribucion_capacidad, v_salon_capacidad)
    );
    v_cantidad_personas := least(
      v_capacidad_efectiva,
      greatest(
        1,
        floor(v_capacidad_efectiva * (0.25 + (mod(i * 17, 66)::numeric / 100)))::integer
      )
    );

    v_fecha_evento := v_inicio_periodo
      + floor(
          ((i - 1)::numeric * v_dias_periodo)
          / greatest(v_total_reservas - 1, 1)
        )::integer;

    if mod(i, 60) = 0 then
      v_fecha_evento := current_date;
    end if;

    v_hora_inicio := (array[8, 9, 13, 14, 18, 19])[mod(i * 7, 6) + 1];
    v_duracion_horas := case
      when mod(i, 17) = 0 then 30
      when mod(i, 11) = 0 then 12
      else 4 + mod(i * 5, 5)
    end;

    v_fecha_inicio := (
      v_fecha_evento::timestamp
      + make_interval(hours => v_hora_inicio)
    ) at time zone 'America/Argentina/Buenos_Aires';
    v_fecha_fin := v_fecha_inicio + make_interval(hours => v_duracion_horas);

    if v_fecha_evento < current_date then
      v_estado := case mod(i, 10)
        when 0 then 'Cancelado'
        when 1 then 'Cancelado'
        when 2 then 'Confirmado'
        when 3 then 'Confirmado'
        else 'Pagado'
      end;
    else
      v_estado := case mod(i, 10)
        when 0 then U&'Pendiente validaci\00F3n'
        when 1 then U&'Pendiente validaci\00F3n'
        when 2 then 'Validado'
        when 3 then 'Validado'
        when 4 then 'Confirmado'
        when 5 then 'Confirmado'
        when 6 then 'Confirmado'
        when 7 then 'Confirmado'
        when 8 then 'Pagado'
        else 'Cancelado'
      end;
    end if;

    -- Conserva el estado elegido buscando una fecha libre frente a reservas
    -- Confirmadas o Pagadas existentes. Si no encuentra lugar, la deja pendiente.
    if v_estado not in (U&'Pendiente validaci\00F3n', 'Cancelado') then
      v_intentos := 0;

      loop
        select exists (
          select 1
          from public.reservas r
          where r.id_salon = v_salon_id
            and r.estado in ('Confirmado', 'Pagado')
            and tstzrange(r.fecha_inicio, r.fecha_fin, '[)')
              && tstzrange(v_fecha_inicio, v_fecha_fin, '[)')
        )
        into v_tiene_conflicto;

        exit when not v_tiene_conflicto;

        v_intentos := v_intentos + 1;
        exit when v_intentos >= 45;

        v_fecha_inicio := v_fecha_inicio + interval '1 day';
        v_fecha_fin := v_fecha_fin + interval '1 day';
      end loop;

      if v_tiene_conflicto then
        v_estado := U&'Pendiente validaci\00F3n';
      end if;
    end if;

    v_creado_en := least(
      v_fecha_inicio - make_interval(days => 5 + mod(i * 11, 75)),
      now() - make_interval(hours => 1 + mod(i * 13, 240))
    );
    v_actualizado_en := least(
      v_creado_en + make_interval(days => 1 + mod(i * 3, 6)),
      now()
    );

    v_monto := round(
      v_salon_precio
      * greatest(1, ceil(v_duracion_horas::numeric / 24)),
      2
    );
    v_monto_inicial := case
      when v_estado in ('Confirmado', 'Pagado') then round(v_monto * 0.30, 2)
      else null
    end;

    begin
      insert into public.reservas (
        cliente_nombre,
        cliente_email,
        cliente_telefono,
        id_cliente,
        id_salon,
        id_distribucion,
        fecha_inicio,
        fecha_fin,
        estado,
        monto,
        monto_inicial,
        cantidad_personas,
        observaciones,
        creado_por,
        creado_en,
        actualizado_en,
        presupuesto_url,
        presupuesto_emitido_en
      )
      values (
        v_nombres[mod(i - 1, array_length(v_nombres, 1)) + 1]
          || ' - '
          || v_empresas[mod((i - 1) * 3, array_length(v_empresas, 1)) + 1],
        format('reserva.demo.%s@example.invalid', lpad(i::text, 4, '0')),
        format('3517%s', lpad(i::text, 6, '0')),
        null,
        v_salon_id,
        v_distribucion_id,
        v_fecha_inicio,
        v_fecha_fin,
        v_estado,
        v_monto,
        v_monto_inicial,
        v_cantidad_personas,
        concat_ws(
          E'\n',
          v_marker,
          'Evento ficticio para pruebas de operacion.',
          'Tipo: ' || v_tipos_evento[mod((i - 1) * 7, array_length(v_tipos_evento, 1)) + 1],
          'Referencia: DEMO-' || lpad(i::text, 4, '0')
        ),
        null,
        v_creado_en,
        v_actualizado_en,
        null,
        null
      )
      returning id into v_reserva_id;
    exception
      when exclusion_violation then
        -- Proteccion adicional ante una insercion concurrente real.
        v_estado := U&'Pendiente validaci\00F3n';
        v_monto_inicial := null;

        insert into public.reservas (
          cliente_nombre,
          cliente_email,
          cliente_telefono,
          id_cliente,
          id_salon,
          id_distribucion,
          fecha_inicio,
          fecha_fin,
          estado,
          monto,
          monto_inicial,
          cantidad_personas,
          observaciones,
          creado_por,
          creado_en,
          actualizado_en,
          presupuesto_url,
          presupuesto_emitido_en
        )
        values (
          v_nombres[mod(i - 1, array_length(v_nombres, 1)) + 1]
            || ' - '
            || v_empresas[mod((i - 1) * 3, array_length(v_empresas, 1)) + 1],
          format('reserva.demo.%s@example.invalid', lpad(i::text, 4, '0')),
          format('3517%s', lpad(i::text, 6, '0')),
          null,
          v_salon_id,
          v_distribucion_id,
          v_fecha_inicio,
          v_fecha_fin,
          v_estado,
          v_monto,
          v_monto_inicial,
          v_cantidad_personas,
          concat_ws(
            E'\n',
            v_marker,
            'Evento ficticio para pruebas de operacion.',
            'Tipo: ' || v_tipos_evento[mod((i - 1) * 7, array_length(v_tipos_evento, 1)) + 1],
            'Referencia: DEMO-' || lpad(i::text, 4, '0')
          ),
          null,
          v_creado_en,
          v_actualizado_en,
          null,
          null
        )
        returning id into v_reserva_id;
    end;

    if v_servicio_count > 0 then
      v_servicios_cantidad := least(v_servicio_count, mod(i * 7, 6));

      if v_servicios_cantidad > 0 then
        insert into public.reserva_servicios (
          id_reserva,
          id_servicio,
          cantidad
        )
        select
          v_reserva_id,
          seleccion.id,
          1 + mod(i + seleccion.posicion::integer, 4)
        from (
          select
            s.id,
            row_number() over (
              order by mod((s.id * 37 + i * 17)::bigint, 1009), s.id
            ) as posicion
          from public.servicios s
          where coalesce(s.activo, true)
          order by mod((s.id * 37 + i * 17)::bigint, 1009), s.id
          limit v_servicios_cantidad
        ) seleccion;
      end if;
    end if;

    -- Historial ficticio coherente con el estado final.
    v_historial_fecha := least(v_creado_en + interval '1 day', now());

    if v_estado = 'Validado' then
      insert into public.auditoria_reservas (
        id_reserva, estado_anterior, estado_nuevo, usuario_id, accion, detalle, creado_en
      )
      values (
        v_reserva_id,
        U&'Pendiente validaci\00F3n',
        'Validado',
        null,
        'UPDATE',
        'Validacion simulada del lote demo.',
        v_historial_fecha
      );
    elsif v_estado = 'Confirmado' then
      insert into public.auditoria_reservas (
        id_reserva, estado_anterior, estado_nuevo, usuario_id, accion, detalle, creado_en
      )
      values
        (
          v_reserva_id,
          U&'Pendiente validaci\00F3n',
          'Validado',
          null,
          'UPDATE',
          'Validacion simulada del lote demo.',
          v_historial_fecha
        ),
        (
          v_reserva_id,
          'Validado',
          'Confirmado',
          null,
          'UPDATE',
          'Confirmacion simulada con sena.',
          least(v_historial_fecha + interval '2 days', now())
        );
    elsif v_estado = 'Pagado' then
      insert into public.auditoria_reservas (
        id_reserva, estado_anterior, estado_nuevo, usuario_id, accion, detalle, creado_en
      )
      values
        (
          v_reserva_id,
          U&'Pendiente validaci\00F3n',
          'Validado',
          null,
          'UPDATE',
          'Validacion simulada del lote demo.',
          v_historial_fecha
        ),
        (
          v_reserva_id,
          'Validado',
          'Confirmado',
          null,
          'UPDATE',
          'Confirmacion simulada con sena.',
          least(v_historial_fecha + interval '2 days', now())
        ),
        (
          v_reserva_id,
          'Confirmado',
          'Pagado',
          null,
          'UPDATE',
          'Pago total simulado.',
          least(v_historial_fecha + interval '7 days', now())
        );
    elsif v_estado = 'Cancelado' then
      insert into public.auditoria_reservas (
        id_reserva, estado_anterior, estado_nuevo, usuario_id, accion, detalle, creado_en
      )
      values (
        v_reserva_id,
        case
          when mod(i, 2) = 0 then U&'Pendiente validaci\00F3n'
          else 'Validado'
        end,
        'Cancelado',
        null,
        'UPDATE',
        'Cancelacion simulada para analisis historico.',
        v_historial_fecha
      );
    end if;
  end loop;

  raise notice 'Lote % generado correctamente con % reservas.', v_batch_id, v_total_reservas;
end;
$seed$;

commit;

-- Resumen del lote insertado.
select
  estado,
  count(*) as cantidad,
  round(sum(monto), 2) as monto_salones
from public.reservas
where observaciones like '%[DEMO_LOTE:operacion-hotel-v1]%'
group by estado
order by estado;

select
  date_trunc('month', fecha_inicio)::date as mes,
  count(*) as cantidad
from public.reservas
where observaciones like '%[DEMO_LOTE:operacion-hotel-v1]%'
group by 1
order by 1;

select
  s.nombre as salon,
  count(*) as cantidad
from public.reservas r
join public.salones s on s.id = r.id_salon
where r.observaciones like '%[DEMO_LOTE:operacion-hotel-v1]%'
group by s.id, s.nombre
order by cantidad desc, s.nombre;
