-- =============================================================================
-- Carga de reservas de DEMOSTRACION para el back office del Centro de Convenciones.
--
--   Lote      : operacion-2m-v2
--   Marcador  : [DEMO_LOTE:operacion-2m-v2]   (dentro de `observaciones`)
--   Volumen   : 173 reservas, 406 servicios contratados,
--               326 movimientos de historial.
--   Ventana   : desde 62 dias ANTES hasta 61 dias DESPUES del dia en que se
--               ejecuta el script (aprox. 2 meses hacia atras y 2 hacia adelante).
--
-- Que hace y que NO hace
--   - Todas las fechas son relativas a `current_date` / `now()`: el lote queda
--     bien ubicado sin importar el dia en que se ejecute.
--   - NO envia emails y NO genera PDFs. `presupuesto_url` queda en NULL a
--     proposito (no hay archivos reales en Storage); lo que si se completa es
--     `presupuesto_emitido_en`, que es el campo que gobierna la vigencia de 7
--     dias y la auto-cancelacion.
--   - Los emails usan el TLD reservado `.test`, que no resuelve: si alguien
--     aprieta "enviar presupuesto por email" no le llega a ninguna persona real.
--   - Las altas de origen WEB (creado_por NULL) disparan el trigger de
--     notificaciones, igual que en produccion; al final se les corrige la fecha
--     para que la campana muestre una cronologia coherente.
--   - Las altas de back office disparan el trigger de clientes recurrentes, asi
--     que tambien se puebla `public.clientes`.
--
-- Orden de insercion: primero las reservas NO bloqueantes y despues las
-- Confirmado / Pagado. Es lo que permite dejar superposiciones visibles
-- (Pendiente o Validado encima de una fecha ya tomada) sin que el trigger
-- `reservas_block_locked_overlap` las rechace.
--
-- Para revertir: 12-eliminar-demo-operacion.sql
-- =============================================================================

begin;

set local timezone = 'America/Argentina/Cordoba';

do $guard$
begin
  if exists (select 1 from public.reservas
             where observaciones like '%' || '[DEMO_LOTE:operacion-2m-v2]' || '%') then
    raise exception
      'El lote % ya esta cargado. Ejecute 12-eliminar-demo-operacion.sql antes de repetirlo.',
      'operacion-2m-v2';
  end if;

  if exists (select unnest(array[12,15,18,22,27,28,29,31,33,36]::bigint[])
             except select id from public.salones) then
    raise exception 'Faltan salones esperados por el lote (ids: %).',
      '12,15,18,22,27,28,29,31,33,36';
  end if;

  if exists (select unnest(array[16,17,19,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36]::bigint[])
             except select id from public.servicios) then
    raise exception 'Faltan servicios esperados por el lote (ids: %).',
      '16,17,19,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36';
  end if;

  if exists (select unnest(array[9,10,11,12,21,22,24,33,34,35,36,49,50,52,68,69,70,73,75,76,77]::bigint[])
             except select id from public.distribuciones) then
    raise exception 'Faltan distribuciones esperadas por el lote (ids: %).',
      '9,10,11,12,21,22,24,33,34,35,36,49,50,52,68,69,70,73,75,76,77';
  end if;
end;
$guard$;

create temporary table demo_carga_reservas (
  clave                   text primary key,
  orden                   integer not null,
  caso                    text not null,
  id_salon                bigint not null,
  id_distribucion         bigint,
  fecha_inicio            timestamptz not null,
  fecha_fin               timestamptz not null,
  estado                  text not null,
  monto                   numeric(12,2) not null,
  monto_inicial           numeric(12,2),
  cantidad_personas       integer not null,
  cliente_nombre          text not null,
  cliente_email           text not null,
  cliente_telefono        text not null,
  creado_por              uuid,
  creado_en               timestamptz not null,
  actualizado_en          timestamptz not null,
  presupuesto_emitido_en  timestamptz,
  observaciones           text not null,
  bloqueante              boolean not null,
  reserva_id              bigint
);

create temporary table demo_carga_servicios (
  clave        text not null,
  id_servicio  bigint not null,
  cantidad     integer not null
);

create temporary table demo_carga_historial (
  clave            text not null,
  orden            integer not null,
  estado_anterior  text not null,
  estado_nuevo     text not null,
  detalle          text not null,
  usuario_id       uuid,
  accion           text not null,
  creado_en        timestamptz not null
);

do $carga$
declare
  v_ahora constant timestamptz := now();
  v_hoy   constant date := current_date;
begin

insert into demo_carga_reservas (
  clave, orden, caso, id_salon, id_distribucion, fecha_inicio, fecha_fin, estado,
  monto, monto_inicial, cantidad_personas, cliente_nombre, cliente_email,
  cliente_telefono, creado_por, creado_en, actualizado_en, presupuesto_emitido_en,
  observaciones, bloqueante
)
values
  ('DEMO-0001', 1, 'Operación habitual · Congreso corporativo', 12, null, ((v_hoy - 61) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 61) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 6302.00, 54, 'Kevin Miranda - Logística Federal', 'kmiranda@logisticafederal.test', '3514422103', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 3408), v_ahora - make_interval(hours => 852), v_ahora - make_interval(hours => 852), 'Evento: Congreso corporativo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Congreso corporativo | Ref: DEMO-0001', true),
  ('DEMO-0002', 2, 'Operación habitual · Capacitación interna', 15, 21, ((v_hoy - 58) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 58) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2621.00, 59, 'Tomás Maidana - Pampa Alimentos', 'tmaidana@pampaalimentos.test', '3517913546', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3120), v_ahora - make_interval(hours => 780), v_ahora - make_interval(hours => 780), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0002', true),
  ('DEMO-0003', 3, 'I1 · Reserva histórica en un salón que luego se dio de baja', 36, null, ((v_hoy - 58) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 58) + time '16:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 500.00, 9140.00, 180, 'Cristian Ávalos - Grupo Centro', 'cavalos@grupocentro.test', '3514220091', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2352), v_ahora - make_interval(hours => 1368), v_ahora - make_interval(hours => 1368), 'Evento: Reunión regional.
[DEMO_LOTE:operacion-2m-v2] Caso: I1 · Reserva histórica en un salón que luego se dio de baja | Ref: DEMO-0003', true),
  ('DEMO-0004', 4, 'Operación habitual · Acto académico', 31, null, ((v_hoy - 56) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 56) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 288.00, 740.00, 8, 'Martín Ocampo - Clínica del Valle', 'mocampo@clinicadelvalle.test', '3515952289', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2256), v_ahora - make_interval(hours => 752), v_ahora - make_interval(hours => 752), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0004', true),
  ('DEMO-0005', 5, 'Operación habitual · Reunión de trabajo', 12, 9, ((v_hoy - 55) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 55) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 1200.00, 72, 'Ramiro Zárate - Constructora Sierras', 'rzarate@constructorasierras.test', '3514271874', null, v_ahora - make_interval(hours => 3624), v_ahora - make_interval(hours => 1208), v_ahora - make_interval(hours => 1208), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0005', true),
  ('DEMO-0006', 6, 'Operación habitual · Reunión de trabajo', 31, null, ((v_hoy - 54) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 54) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 288.00, 288.00, 7, 'Leonardo Medina - Clínica del Valle', 'lmedina@clinicadelvalle.test', '3515647238', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2160), v_ahora - make_interval(hours => 540), v_ahora - make_interval(hours => 540), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0006', true),
  ('DEMO-0007', 7, 'Operación habitual · Taller de capacitación', 15, 21, ((v_hoy - 53) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 53) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2849.00, 71, 'Ramiro Zárate - Cooperativa El Progreso', 'rzarate@coopelprogreso.test', '3515587422', null, v_ahora - make_interval(hours => 3744), v_ahora - make_interval(hours => 936), v_ahora - make_interval(hours => 936), 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0007', true),
  ('DEMO-0008', 8, 'G1 · Cliente recurrente del back office (1 de 3 reservas del mismo ciclo)', 12, 9, ((v_hoy - 52) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 52) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2792.00, 68, 'Silvana Roldán - Consultora Sinergia', 'sroldan@consultorasinergia.test', '3515447790', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2088), v_ahora - make_interval(hours => 1152), v_ahora - make_interval(hours => 1152), 'Evento: Ciclo de capacitaciones.
[DEMO_LOTE:operacion-2m-v2] Caso: G1 · Cliente recurrente del back office (1 de 3 reservas del mismo ciclo) | Ref: DEMO-0008', true),
  ('DEMO-0009', 9, 'Operación habitual · Casamiento', 28, null, ((v_hoy - 52) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 51) + time '04:30') at time zone 'America/Argentina/Cordoba', 'Pagado', 3510.00, 13569.00, 102, 'Diego Peralta', 'diego.peralta@correo-personal.test', '3515783059', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 4824), v_ahora - make_interval(hours => 1206), v_ahora - make_interval(hours => 1206), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Casamiento | Ref: DEMO-0009', true),
  ('DEMO-0010', 10, 'Operación habitual · Jornada médica', 27, 68, ((v_hoy - 51) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 51) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 2000.00, 7812.00, 106, 'Nicolás Cabrera - Instituto Belgrano', 'ncabrera@institutobelgrano.test', '3514417970', null, v_ahora - make_interval(hours => 2232), v_ahora - make_interval(hours => 558), v_ahora - make_interval(hours => 558), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0010', true),
  ('DEMO-0011', 11, 'Operación habitual · Capacitación interna', 12, 9, ((v_hoy - 51) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 51) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2849.00, 71, 'Joaquín Navarro - Red Educativa', 'jnavarro@rededucativa.test', '3515847382', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2976), v_ahora - make_interval(hours => 744), v_ahora - make_interval(hours => 744), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0011', true),
  ('DEMO-0012', 12, 'Operación habitual · Asamblea de socios', 31, null, ((v_hoy - 50) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 50) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 288.00, 352.00, 8, 'Federico Molina - Horizonte Salud', 'fmolina@horizontesalud.test', '3514916880', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 1992), v_ahora - make_interval(hours => 498), v_ahora - make_interval(hours => 498), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0012', true),
  ('DEMO-0013', 13, 'Operación habitual · Reunión de trabajo', 33, null, ((v_hoy - 49) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 49) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 558.00, 558.00, 16, 'Octavio Alcaraz - Instituto Belgrano', 'oalcaraz@institutobelgrano.test', '3517118553', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 3648), v_ahora - make_interval(hours => 912), v_ahora - make_interval(hours => 912), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0013', false),
  ('DEMO-0014', 14, 'Operación habitual · Asamblea de socios', 22, 49, ((v_hoy - 49) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 49) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 4000.00, 6088.00, 261, 'Agustina Ríos - Grupo Centro', 'arios@grupocentro.test', '3517513858', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 2184), v_ahora - make_interval(hours => 546), v_ahora - make_interval(hours => 546), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0014', true),
  ('DEMO-0015', 15, 'Operación habitual · Desayuno de trabajo', 33, null, ((v_hoy - 47) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 47) + time '11:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 558.00, 957.00, 19, 'Octavio Alcaraz - Pampa Alimentos', 'oalcaraz@pampaalimentos.test', '3514204809', null, v_ahora - make_interval(hours => 3360), v_ahora - make_interval(hours => 840), v_ahora - make_interval(hours => 840), 'Evento: Desayuno de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Desayuno de trabajo | Ref: DEMO-0015', true),
  ('DEMO-0016', 16, 'Operación habitual · Capacitación interna', 12, 9, ((v_hoy - 47) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 47) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2583.00, 57, 'Gustavo Nieva - Andes Tecnología', 'gnieva@andestecnologia.test', '3516756815', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3720), v_ahora - make_interval(hours => 930), v_ahora - make_interval(hours => 930), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0016', true),
  ('DEMO-0017', 17, 'Operación habitual · Reunión de trabajo', 22, null, ((v_hoy - 46) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 46) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 4000.00, 4000.00, 216, 'Camila Acosta - Grupo Centro', 'cacosta@grupocentro.test', '3514726236', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3360), v_ahora - make_interval(hours => 840), v_ahora - make_interval(hours => 840), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0017', true),
  ('DEMO-0018', 18, 'F1 · Congreso de 3 días completo, ya Pagado (evento pasado)', 18, 33, ((v_hoy - 45) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 43) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 19500.00, 81030.00, 720, 'Adrián Vázquez - Federación Empresaria', 'avazquez@federacionempresaria.test', '3515114420', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3960), v_ahora - make_interval(hours => 1008), v_ahora - make_interval(hours => 1008), 'Evento: Congreso federal.
[DEMO_LOTE:operacion-2m-v2] Caso: F1 · Congreso de 3 días completo, ya Pagado (evento pasado) | Ref: DEMO-0018', true),
  ('DEMO-0019', 19, 'Operación habitual · Fiesta de 15', 15, 21, ((v_hoy - 45) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 44) + time '04:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1560.00, 8784.00, 72, 'Sabrina Ávila', 'sabrina.avila@correo-personal.test', '3514333079', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 3288), v_ahora - make_interval(hours => 822), v_ahora - make_interval(hours => 822), 'Evento: Fiesta de 15.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Fiesta de 15 | Ref: DEMO-0019', true),
  ('DEMO-0020', 20, 'Operación habitual · Desayuno de trabajo', 22, 52, ((v_hoy - 44) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 44) + time '11:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 4000.00, 9019.00, 239, 'Florencia Ledesma - Instituto Belgrano', 'fledesma@institutobelgrano.test', '3516535653', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2088), v_ahora - make_interval(hours => 696), v_ahora - make_interval(hours => 696), 'Evento: Desayuno de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Desayuno de trabajo | Ref: DEMO-0020', true),
  ('DEMO-0021', 21, 'Operación habitual · Almuerzo familiar', 27, 68, ((v_hoy - 44) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 44) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 2000.00, null, 109, 'Gustavo Nieva', 'gustavo.nieva@correo-personal.test', '3515365811', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 4200), v_ahora - make_interval(hours => 1050), null, 'Evento: Almuerzo familiar.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Almuerzo familiar | Ref: DEMO-0021', false),
  ('DEMO-0022', 22, 'Operación habitual · Taller de capacitación', 15, 21, ((v_hoy - 43) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 43) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2697.00, 63, 'Rocío Ferreyra - Andes Tecnología', 'rferreyra@andestecnologia.test', '3515334807', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1584), v_ahora - make_interval(hours => 396), v_ahora - make_interval(hours => 396), 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0022', true),
  ('DEMO-0023', 23, 'Operación habitual · Jornada médica', 28, null, ((v_hoy - 42) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 42) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 2700.00, 11424.00, 162, 'Ramiro Zárate - Andes Tecnología', 'rzarate@andestecnologia.test', '3517004925', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 3600), v_ahora - make_interval(hours => 900), v_ahora - make_interval(hours => 900), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0023', true),
  ('DEMO-0024', 24, 'Operación habitual · Almuerzo institucional', 33, null, ((v_hoy - 42) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 42) + time '16:30') at time zone 'America/Argentina/Cordoba', 'Confirmado', 558.00, 1594.00, 14, 'Karina Ortiz - Logística Federal', 'kortiz@logisticafederal.test', '3516923581', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3432), v_ahora - make_interval(hours => 1144), v_ahora - make_interval(hours => 1144), 'Evento: Almuerzo institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Almuerzo institucional | Ref: DEMO-0024', true),
  ('DEMO-0025', 25, 'Operación habitual · Congreso corporativo', 31, null, ((v_hoy - 40) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 40) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 288.00, 1254.00, 7, 'Federico Molina - Cooperativa El Progreso', 'fmolina@coopelprogreso.test', '3516758588', null, v_ahora - make_interval(hours => 2184), v_ahora - make_interval(hours => 546), v_ahora - make_interval(hours => 546), 'Evento: Congreso corporativo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Congreso corporativo | Ref: DEMO-0025', true),
  ('DEMO-0026', 26, 'Operación habitual · Asamblea de socios', 27, 68, ((v_hoy - 40) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 40) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 2000.00, 3000.00, 125, 'Ulises Domínguez - Seguros Del Plata', 'udominguez@segurosdelplata.test', '3515746346', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1944), v_ahora - make_interval(hours => 486), v_ahora - make_interval(hours => 486), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0026', true),
  ('DEMO-0027', 27, 'Operación habitual · Asamblea de socios', 12, 9, ((v_hoy - 38) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 38) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 1680.00, 60, 'Julia Cáceres - Cooperativa El Progreso', 'jcaceres@coopelprogreso.test', '3516134730', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2328), v_ahora - make_interval(hours => 582), v_ahora - make_interval(hours => 582), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0027', true),
  ('DEMO-0028', 28, 'Operación habitual · Casamiento', 28, null, ((v_hoy - 37) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 36) + time '04:30') at time zone 'America/Argentina/Cordoba', 'Pagado', 3510.00, 18483.00, 154, 'Ulises Domínguez', 'ulises.dominguez@correo-personal.test', '3517046247', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3384), v_ahora - make_interval(hours => 846), v_ahora - make_interval(hours => 846), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Casamiento | Ref: DEMO-0028', true),
  ('DEMO-0029', 29, 'Operación habitual · Reunión de trabajo', 27, 68, ((v_hoy - 35) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 35) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 2000.00, 2000.00, 130, 'Martín Ocampo - Consultora Sinergia', 'mocampo@consultorasinergia.test', '3516373213', null, v_ahora - make_interval(hours => 3144), v_ahora - make_interval(hours => 786), v_ahora - make_interval(hours => 786), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0029', true),
  ('DEMO-0030', 30, 'Operación habitual · Acto académico', 18, 33, ((v_hoy - 33) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 33) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 6500.00, 15008.00, 432, 'Diego Peralta - Logística Federal', 'dperalta@logisticafederal.test', '3515307052', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3288), v_ahora - make_interval(hours => 822), v_ahora - make_interval(hours => 822), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0030', true),
  ('DEMO-0031', 31, 'Operación habitual · Encuentro institucional', 31, null, ((v_hoy - 33) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 33) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 288.00, 721.00, 7, 'Tamara Villalba - Logística Federal', 'tvillalba@logisticafederal.test', '3515752914', null, v_ahora - make_interval(hours => 1944), v_ahora - make_interval(hours => 486), v_ahora - make_interval(hours => 486), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0031', true),
  ('DEMO-0032', 32, 'Operación habitual · Jornada médica', 15, 24, ((v_hoy - 32) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 32) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 3944.00, 47, 'Elena Suárez - Instituto Belgrano', 'esuarez@institutobelgrano.test', '3515894938', null, v_ahora - make_interval(hours => 2400), v_ahora - make_interval(hours => 600), v_ahora - make_interval(hours => 600), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0032', true),
  ('DEMO-0033', 33, 'Operación habitual · Presentación de producto', 12, 12, ((v_hoy - 32) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 32) + time '14:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 1200.00, null, 48, 'Valeria Ponce - Mercado Norte', 'vponce@mercadonorte.test', '3516938288', null, v_ahora - make_interval(hours => 2712), v_ahora - make_interval(hours => 678), null, 'Evento: Presentación de producto.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Presentación de producto | Ref: DEMO-0033', false),
  ('DEMO-0034', 34, 'Operación habitual · Cena de fin de año', 22, 49, ((v_hoy - 31) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 30) + time '01:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 5200.00, 26650.00, 260, 'Ulises Domínguez', 'ulises.dominguez@correo-personal.test', '3517087714', null, v_ahora - make_interval(hours => 2784), v_ahora - make_interval(hours => 696), v_ahora - make_interval(hours => 696), 'Evento: Cena de fin de año.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cena de fin de año | Ref: DEMO-0034', false),
  ('DEMO-0035', 35, 'Operación habitual · Fiesta de 15', 12, 9, ((v_hoy - 31) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 30) + time '04:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1560.00, 8595.00, 70, 'Walter Ávalos', 'walter.avalos@correo-personal.test', '3515295585', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 3120), v_ahora - make_interval(hours => 24), v_ahora - make_interval(hours => 24), 'Evento: Fiesta de 15.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Fiesta de 15 | Ref: DEMO-0035', false),
  ('DEMO-0036', 36, 'Operación habitual · Cumpleaños', 28, null, ((v_hoy - 30) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 29) + time '03:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 3510.00, 16784.00, 161, 'Helena Bianchi', 'helena.bianchi@correo-personal.test', '3516484222', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 3840), v_ahora - make_interval(hours => 960), v_ahora - make_interval(hours => 960), 'Evento: Cumpleaños.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cumpleaños | Ref: DEMO-0036', true),
  ('DEMO-0037', 37, 'Operación habitual · Reunión de trabajo', 22, 49, ((v_hoy - 28) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 28) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 4000.00, 4000.00, 261, 'Yamila Sosa - Red Educativa', 'ysosa@rededucativa.test', '3517641276', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 3312), v_ahora - make_interval(hours => 828), v_ahora - make_interval(hours => 828), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0037', true),
  ('DEMO-0038', 38, 'E3 · Día pico pasado (-27 d): jornada institucional', 18, 34, ((v_hoy - 27) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 27) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 6500.00, 37810.00, 430, 'Claudia Reinoso - Universidad Provincial', 'creinoso@univprovincial.test', '3514008812', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2688), v_ahora - make_interval(hours => 600), v_ahora - make_interval(hours => 600), 'Evento: Jornada académica.
[DEMO_LOTE:operacion-2m-v2] Caso: E3 · Día pico pasado (-27 d): jornada institucional | Ref: DEMO-0038', true),
  ('DEMO-0039', 39, 'E3 · Día pico pasado (-27 d): taller simultáneo', 27, 69, ((v_hoy - 27) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 27) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 2000.00, 3915.00, 85, 'Diego Peralta - Nova Energía SA', 'dperalta@novaenergia.test', '3515773390', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1728), v_ahora - make_interval(hours => 624), v_ahora - make_interval(hours => 624), 'Evento: Taller técnico.
[DEMO_LOTE:operacion-2m-v2] Caso: E3 · Día pico pasado (-27 d): taller simultáneo | Ref: DEMO-0039', true),
  ('DEMO-0040', 40, 'E3 · Día pico pasado (-27 d): almuerzo de cierre', 12, 12, ((v_hoy - 27) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 27) + time '16:30') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 5492.00, 58, 'Gabriela Romero - Mercado Norte', 'gromero@mercadonorte.test', '3516220045', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 1368), v_ahora - make_interval(hours => 624), v_ahora - make_interval(hours => 624), 'Evento: Almuerzo de cierre.
[DEMO_LOTE:operacion-2m-v2] Caso: E3 · Día pico pasado (-27 d): almuerzo de cierre | Ref: DEMO-0040', true),
  ('DEMO-0041', 41, 'E3 · Día pico pasado (-27 d): reunión de trabajo', 33, null, ((v_hoy - 27) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 27) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 558.00, 718.00, 20, 'Karina Ortiz - Estudio Ortiz', 'kortiz@estudioortiz.test', '3514667701', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 1128), v_ahora - make_interval(hours => 684), v_ahora - make_interval(hours => 684), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: E3 · Día pico pasado (-27 d): reunión de trabajo | Ref: DEMO-0041', false),
  ('DEMO-0042', 42, 'Operación habitual · Encuentro institucional', 33, null, ((v_hoy - 26) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 26) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 558.00, 1219.00, 19, 'Yamila Sosa - Instituto Belgrano', 'ysosa@institutobelgrano.test', '3516184680', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2352), v_ahora - make_interval(hours => 588), v_ahora - make_interval(hours => 588), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0042', true),
  ('DEMO-0043', 43, 'Operación habitual · Reunión de trabajo', 33, null, ((v_hoy - 24) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 24) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 558.00, null, 13, 'Rocío Ferreyra - Red Educativa', 'rferreyra@rededucativa.test', '3515716785', null, v_ahora - make_interval(hours => 2496), v_ahora - make_interval(hours => 624), null, 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0043', false),
  ('DEMO-0044', 44, 'Operación habitual · Cumpleaños', 28, null, ((v_hoy - 23) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 22) + time '03:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 3510.00, 10349.00, 83, 'Kevin Miranda', 'kevin.miranda@correo-personal.test', '3516681181', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2328), v_ahora - make_interval(hours => 582), v_ahora - make_interval(hours => 582), 'Evento: Cumpleaños.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cumpleaños | Ref: DEMO-0044', true),
  ('DEMO-0045', 45, 'A9 · Cancelado desde Pendiente validación (no llegó respuesta del cliente)', 27, 68, ((v_hoy - 22) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 22) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 2000.00, null, 140, 'Julieta Sosa - Mercado Norte', 'jsosa@mercadonorte.test', '3515007719', null, v_ahora - make_interval(hours => 1368), v_ahora - make_interval(hours => 624), null, 'Evento: Presentación de producto.
[DEMO_LOTE:operacion-2m-v2] Caso: A9 · Cancelado desde Pendiente validación (no llegó respuesta del cliente) | Ref: DEMO-0045', false),
  ('DEMO-0046', 46, 'Operación habitual · Reunión de trabajo', 18, 35, ((v_hoy - 19) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 19) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 6500.00, 6500.00, 689, 'Sabrina Ávila - Clínica del Valle', 'savila@clinicadelvalle.test', '3516361786', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 2520), v_ahora - make_interval(hours => 630), v_ahora - make_interval(hours => 630), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0046', true),
  ('DEMO-0047', 47, 'C7 · Pendiente validación del pasado que nunca se gestionó (backlog vencido)', 33, null, ((v_hoy - 18) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 18) + time '14:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 558.00, null, 20, 'Antonella Suárez', 'antonella.suarez@correo-personal.test', '3514883310', null, v_ahora - make_interval(hours => 1032), v_ahora - make_interval(hours => 1032), null, 'Evento: Reunión de padres.
[DEMO_LOTE:operacion-2m-v2] Caso: C7 · Pendiente validación del pasado que nunca se gestionó (backlog vencido) | Ref: DEMO-0047', false),
  ('DEMO-0048', 48, 'G1 · Cliente recurrente del back office (2 de 3 reservas del mismo ciclo)', 12, 9, ((v_hoy - 16) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 16) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2906.00, 74, 'Silvana Roldán - Consultora Sinergia', 'sroldan@consultorasinergia.test', '3515447790', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1224), v_ahora - make_interval(hours => 336), v_ahora - make_interval(hours => 336), 'Evento: Ciclo de capacitaciones.
[DEMO_LOTE:operacion-2m-v2] Caso: G1 · Cliente recurrente del back office (2 de 3 reservas del mismo ciclo) | Ref: DEMO-0048', true),
  ('DEMO-0049', 49, 'Operación habitual · Encuentro institucional', 28, null, ((v_hoy - 16) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 16) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 2700.00, 5242.00, 118, 'Isabel Vega - Bodega Alta Vista', 'ivega@bodegaaltavista.test', '3516712013', null, v_ahora - make_interval(hours => 1392), v_ahora - make_interval(hours => 348), v_ahora - make_interval(hours => 348), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0049', false),
  ('DEMO-0050', 50, 'Operación habitual · Reunión de trabajo', 22, 49, ((v_hoy - 16) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 16) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 4000.00, 4000.00, 293, 'Gabriela Romero - Grupo Centro', 'gromero@grupocentro.test', '3514624770', null, v_ahora - make_interval(hours => 1968), v_ahora - make_interval(hours => 492), v_ahora - make_interval(hours => 492), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0050', true),
  ('DEMO-0051', 51, 'Operación habitual · Capacitación interna', 18, 35, ((v_hoy - 14) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 14) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 6500.00, 15426.00, 454, 'Nicolás Cabrera - Estudio Paz & Roca', 'ncabrera@pazyroca.test', '3516173731', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 1032), v_ahora - make_interval(hours => 258), v_ahora - make_interval(hours => 258), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0051', true),
  ('DEMO-0052', 52, 'A8 · Pagado (estado final) con historial completo', 22, 49, ((v_hoy - 12) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 12) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 4000.00, 29510.00, 340, 'Andrés Cabrera - Andes Tecnología', 'acabrera@andestecnologia.test', '3514902256', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1968), v_ahora - make_interval(hours => 240), v_ahora - make_interval(hours => 240), 'Evento: Congreso corporativo.
[DEMO_LOTE:operacion-2m-v2] Caso: A8 · Pagado (estado final) con historial completo | Ref: DEMO-0052', true),
  ('DEMO-0053', 53, 'Operación habitual · Presentación de producto', 33, null, ((v_hoy - 12) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 12) + time '14:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 558.00, 1430.00, 11, 'Elena Suárez - Horizonte Salud', 'esuarez@horizontesalud.test', '3514712972', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1992), v_ahora - make_interval(hours => 664), v_ahora - make_interval(hours => 664), 'Evento: Presentación de producto.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Presentación de producto | Ref: DEMO-0053', true),
  ('DEMO-0054', 54, 'Operación habitual · Encuentro institucional', 31, null, ((v_hoy - 12) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 12) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 288.00, 702.00, 6, 'Emiliano Torres - Instituto Belgrano', 'etorres@institutobelgrano.test', '3516794385', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 816), v_ahora - make_interval(hours => 204), v_ahora - make_interval(hours => 204), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0054', true),
  ('DEMO-0055', 55, 'Operación habitual · Taller de capacitación', 12, 9, ((v_hoy - 11) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 11) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2887.00, 73, 'Diego Peralta - Logística Federal', 'dperalta@logisticafederal.test', '3515726376', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 2160), v_ahora - make_interval(hours => 540), v_ahora - make_interval(hours => 540), 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0055', true),
  ('DEMO-0056', 56, 'Operación habitual · Casamiento', 15, 22, ((v_hoy - 10) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 9) + time '04:30') at time zone 'America/Argentina/Cordoba', 'Cancelado', 1560.00, 5760.00, 40, 'Walter Ávalos', 'walter.avalos@correo-personal.test', '3515478922', null, v_ahora - make_interval(hours => 3624), v_ahora - make_interval(hours => 906), v_ahora - make_interval(hours => 906), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Casamiento | Ref: DEMO-0056', false),
  ('DEMO-0057', 57, 'Operación habitual · Cena de fin de año', 28, null, ((v_hoy - 9) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 8) + time '01:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 3510.00, 13575.00, 122, 'Tomás Maidana', 'tomas.maidana@correo-personal.test', '3515573184', null, v_ahora - make_interval(hours => 3240), v_ahora - make_interval(hours => 810), v_ahora - make_interval(hours => 810), 'Evento: Cena de fin de año.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cena de fin de año | Ref: DEMO-0057', true),
  ('DEMO-0058', 58, 'A10 · Cancelado desde Validado (el cliente eligió otro proveedor)', 12, 12, ((v_hoy - 8) + time '13:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 8) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 1200.00, 5492.00, 58, 'Marcos Villalba - Logística Federal', 'mvillalba@logisticafederal.test', '3514336602', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 912), v_ahora - make_interval(hours => 288), v_ahora - make_interval(hours => 288), 'Evento: Almuerzo institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: A10 · Cancelado desde Validado (el cliente eligió otro proveedor) | Ref: DEMO-0058', false),
  ('DEMO-0059', 59, 'Operación habitual · Reunión de directorio', 18, 35, ((v_hoy - 7) + time '09:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 7) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Confirmado', 6500.00, 9956.00, 432, 'Tomás Maidana - Constructora Sierras', 'tmaidana@constructorasierras.test', '3516645042', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1440), v_ahora - make_interval(hours => 480), v_ahora - make_interval(hours => 480), 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de directorio | Ref: DEMO-0059', true),
  ('DEMO-0060', 60, 'Operación habitual · Asamblea de socios', 28, null, ((v_hoy - 6) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 6) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 2700.00, 3796.00, 137, 'Camila Acosta - Andes Tecnología', 'cacosta@andestecnologia.test', '3517116979', null, v_ahora - make_interval(hours => 1800), v_ahora - make_interval(hours => 450), v_ahora - make_interval(hours => 450), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0060', true),
  ('DEMO-0061', 61, 'Operación habitual · Reunión de directorio', 27, 68, ((v_hoy - 4) + time '09:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 4) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Pagado', 2000.00, 3304.00, 163, 'Natalia Reinoso - Horizonte Salud', 'nreinoso@horizontesalud.test', '3514032679', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2568), v_ahora - make_interval(hours => 642), v_ahora - make_interval(hours => 642), 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de directorio | Ref: DEMO-0061', true),
  ('DEMO-0062', 62, 'Operación habitual · Encuentro institucional', 12, 9, ((v_hoy - 4) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 4) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2773.00, 67, 'Gustavo Nieva - Cooperativa El Progreso', 'gnieva@coopelprogreso.test', '3515240606', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 2016), v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 504), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0062', true),
  ('DEMO-0063', 63, 'A12 · Cancelado AUTOMÁTICAMENTE por vencimiento de la vigencia del presupuesto', 15, 22, ((v_hoy - 3) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 3) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 1200.00, 1618.00, 38, 'Nicolás Arrieta - Red Educativa', 'narrieta@rededucativa.test', '3515664183', null, v_ahora - make_interval(hours => 744), v_ahora - make_interval(hours => 216), v_ahora - make_interval(hours => 384), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: A12 · Cancelado AUTOMÁTICAMENTE por vencimiento de la vigencia del presupuesto | Ref: DEMO-0063', false),
  ('DEMO-0064', 64, 'Operación habitual · Cena de fin de año', 28, null, ((v_hoy - 3) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 2) + time '01:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 3510.00, 13484.00, 121, 'Laura Bergara', 'laura.bergara@correo-personal.test', '3516188002', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 3048), v_ahora - make_interval(hours => 762), v_ahora - make_interval(hours => 762), 'Evento: Cena de fin de año.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cena de fin de año | Ref: DEMO-0064', true),
  ('DEMO-0065', 65, 'Operación habitual · Fiesta de 15', 12, 12, ((v_hoy - 3) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy - 2) + time '04:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1560.00, 7547.00, 59, 'Florencia Ledesma', 'florencia.ledesma@correo-personal.test', '3516918947', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2568), v_ahora - make_interval(hours => 642), v_ahora - make_interval(hours => 642), 'Evento: Fiesta de 15.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Fiesta de 15 | Ref: DEMO-0065', true),
  ('DEMO-0066', 66, 'Operación habitual · Almuerzo familiar', 18, 35, ((v_hoy - 2) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy - 2) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 6500.00, 51640.00, 610, 'Kevin Miranda', 'kevin.miranda@correo-personal.test', '3515488372', null, v_ahora - make_interval(hours => 1776), v_ahora - make_interval(hours => 444), v_ahora - make_interval(hours => 444), 'Evento: Almuerzo familiar.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Almuerzo familiar | Ref: DEMO-0066', true),
  ('DEMO-0067', 67, 'E1 · Día de hoy con 5 salones en uso: congreso en el salón principal', 18, 33, ((v_hoy + 0) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 0) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 6500.00, 53650.00, 650, 'Marcela Ibarra - Colegio Médico de Córdoba', 'mibarra@colegiomedico-cba.test', '3514771120', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2160), v_ahora - make_interval(hours => 1008), v_ahora - make_interval(hours => 1008), 'Evento: Congreso médico.
[DEMO_LOTE:operacion-2m-v2] Caso: E1 · Día de hoy con 5 salones en uso: congreso en el salón principal | Ref: DEMO-0067', true),
  ('DEMO-0068', 68, 'E1 · Día de hoy con 5 salones en uso: capacitación', 12, 9, ((v_hoy + 0) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 0) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 2830.00, 70, 'Sergio Maidana - Banco del Centro', 'smaidana@bancodelcentro.test', '3515002288', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 960), v_ahora - make_interval(hours => 72), v_ahora - make_interval(hours => 72), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: E1 · Día de hoy con 5 salones en uso: capacitación | Ref: DEMO-0068', true),
  ('DEMO-0069', 69, 'E1 · Día de hoy con 5 salones en uso: reunión de directorio', 33, null, ((v_hoy + 0) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 0) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Pagado', 558.00, 936.00, 18, 'Alicia Bergara - Grupo Centro', 'abergara@grupocentro.test', '3514226607', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 24), v_ahora - make_interval(hours => 24), 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: E1 · Día de hoy con 5 salones en uso: reunión de directorio | Ref: DEMO-0069', true),
  ('DEMO-0070', 70, 'E1 · Día de hoy con 5 salones en uso: almuerzo de trabajo', 27, 70, ((v_hoy + 0) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 0) + time '16:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2000.00, 12140.00, 120, 'Verónica Ledesma - Bodega Alta Vista', 'vledesma@bodegaaltavista.test', '3516114490', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 840), v_ahora - make_interval(hours => 216), v_ahora - make_interval(hours => 216), 'Evento: Almuerzo de presentación.
[DEMO_LOTE:operacion-2m-v2] Caso: E1 · Día de hoy con 5 salones en uso: almuerzo de trabajo | Ref: DEMO-0070', true),
  ('DEMO-0071', 71, 'C6 · Pendiente validación cuyo evento es HOY (la fecha ya fue alcanzada)', 31, null, ((v_hoy + 0) + time '16:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 0) + time '19:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 288.00, 360.00, 9, 'Matías Godoy', 'matias.godoy@correo-personal.test', '3516009927', null, v_ahora - make_interval(hours => 120), v_ahora - make_interval(hours => 120), v_ahora - make_interval(hours => 48), 'Evento: Entrevistas de selección.
[DEMO_LOTE:operacion-2m-v2] Caso: C6 · Pendiente validación cuyo evento es HOY (la fecha ya fue alcanzada) | Ref: DEMO-0071', false),
  ('DEMO-0072', 72, 'E1 · Día de hoy con 5 salones en uso: cena de camaradería', 28, null, ((v_hoy + 0) + time '20:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 0) + time '23:59') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2700.00, 15075.00, 150, 'Pablo Giménez - Pampa Alimentos', 'pgimenez@pampaalimentos.test', '3515667712', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1320), v_ahora - make_interval(hours => 480), v_ahora - make_interval(hours => 480), 'Evento: Cena de camaradería.
[DEMO_LOTE:operacion-2m-v2] Caso: E1 · Día de hoy con 5 salones en uso: cena de camaradería | Ref: DEMO-0072', true),
  ('DEMO-0073', 73, 'C5 · Validado cuyo evento es MAÑANA (último día antes del inicio)', 33, null, ((v_hoy + 1) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 1) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Validado', 558.00, 1020.00, 22, 'Cecilia Nieva - Estudio Nieva & Asoc.', 'cnieva@estudionieva.test', '3515774412', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 264), v_ahora - make_interval(hours => 72), v_ahora - make_interval(hours => 72), 'Evento: Reunión de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: C5 · Validado cuyo evento es MAÑANA (último día antes del inicio) | Ref: DEMO-0073', false),
  ('DEMO-0074', 74, 'Operación habitual · Reunión de trabajo', 12, null, ((v_hoy + 2) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 2) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 1200.00, 44, 'Ulises Domínguez - Andes Tecnología', 'udominguez@andestecnologia.test', '3516969133', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 912), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0074', false),
  ('DEMO-0075', 75, 'C8 · Validado con el evento dentro de 3 días', 29, 76, ((v_hoy + 3) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 3) + time '12:00') at time zone 'America/Argentina/Cordoba', 'Validado', 800.00, 1444.00, 28, 'Leandro Ávila - Cooperativa El Progreso', 'lavila@coopelprogreso.test', '3515441176', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 408), v_ahora - make_interval(hours => 72), v_ahora - make_interval(hours => 72), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: C8 · Validado con el evento dentro de 3 días | Ref: DEMO-0075', false),
  ('DEMO-0076', 76, 'Operación habitual · Acto académico', 31, null, ((v_hoy + 3) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 3) + time '13:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 288.00, 721.00, 7, 'Gabriela Romero - Andes Tecnología', 'gromero@andestecnologia.test', '3515796193', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 2520), v_ahora - make_interval(hours => 2520), v_ahora - make_interval(hours => 72), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0076', false),
  ('DEMO-0077', 77, 'Operación habitual · Cumpleaños', 18, 35, ((v_hoy + 4) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 5) + time '03:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 8450.00, 59765.00, 622, 'Isabel Vega', 'isabel.vega@correo-personal.test', '3517272434', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 2448), v_ahora - make_interval(hours => 612), v_ahora - make_interval(hours => 612), 'Evento: Cumpleaños.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cumpleaños | Ref: DEMO-0077', true),
  ('DEMO-0078', 78, 'Operación habitual · Reunión de trabajo', 28, null, ((v_hoy + 5) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 5) + time '18:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 2700.00, 2700.00, 113, 'Gabriela Romero - Bodega Alta Vista', 'gromero@bodegaaltavista.test', '3515793270', null, v_ahora - make_interval(hours => 2448), v_ahora - make_interval(hours => 2448), v_ahora - make_interval(hours => 48), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0078', false),
  ('DEMO-0079', 79, 'Operación habitual · Cena de fin de año', 27, 70, ((v_hoy + 5) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 6) + time '01:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2600.00, 11675.00, 110, 'Zoe Maldonado', 'zoe.maldonado@correo-personal.test', '3514395697', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 3360), v_ahora - make_interval(hours => 1120), v_ahora - make_interval(hours => 1120), 'Evento: Cena de fin de año.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cena de fin de año | Ref: DEMO-0079', true),
  ('DEMO-0080', 80, 'Operación habitual · Asamblea de socios', 12, 9, ((v_hoy + 6) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 6) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 1200.00, 1488.00, 36, 'Mariana Luna - Bodega Alta Vista', 'mluna@bodegaaltavista.test', '3516959901', null, v_ahora - make_interval(hours => 936), v_ahora - make_interval(hours => 234), v_ahora - make_interval(hours => 234), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0080', true),
  ('DEMO-0081', 81, 'Operación habitual · Reunión de directorio', 33, null, ((v_hoy + 7) + time '09:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 7) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Cancelado', 558.00, 726.00, 21, 'Octavio Alcaraz - Red Educativa', 'oalcaraz@rededucativa.test', '3515390993', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1248), v_ahora - make_interval(hours => 312), v_ahora - make_interval(hours => 312), 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de directorio | Ref: DEMO-0081', false),
  ('DEMO-0082', 82, 'H3 · Reserva sin presupuesto emitido (solo alquiler de salón, sin servicios)', 31, null, ((v_hoy + 8) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 8) + time '12:00') at time zone 'America/Argentina/Cordoba', 'Validado', 288.00, null, 8, 'Franco Beltrán', 'franco.beltran@correo-personal.test', '3516778823', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 168), v_ahora - make_interval(hours => 72), null, 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: H3 · Reserva sin presupuesto emitido (solo alquiler de salón, sin servicios) | Ref: DEMO-0082', false),
  ('DEMO-0083', 83, 'Operación habitual · Desayuno de trabajo', 12, 9, ((v_hoy + 9) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 9) + time '11:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 1200.00, 2691.00, 71, 'Kevin Miranda - Grupo Centro', 'kmiranda@grupocentro.test', '3516315228', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 888), v_ahora - make_interval(hours => 888), v_ahora - make_interval(hours => 72), 'Evento: Desayuno de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Desayuno de trabajo | Ref: DEMO-0083', false),
  ('DEMO-0084', 84, 'Operación habitual · Capacitación interna', 22, 49, ((v_hoy + 10) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 10) + time '13:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 4000.00, 10171.00, 309, 'Federico Molina - Bodega Alta Vista', 'fmolina@bodegaaltavista.test', '3517469441', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1032), v_ahora - make_interval(hours => 1032), v_ahora - make_interval(hours => 24), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0084', false),
  ('DEMO-0085', 85, 'D2 · Supera la capacidad del SALÓN (sala chica sobrevendida)', 31, null, ((v_hoy + 11) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 11) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 288.00, 624.00, 16, 'Damián Rossi - Rossi Contadores', 'drossi@rossicontadores.test', '3516882204', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 336), v_ahora - make_interval(hours => 120), v_ahora - make_interval(hours => 120), 'Evento: Reunión de cierre de balance.
[DEMO_LOTE:operacion-2m-v2] Caso: D2 · Supera la capacidad del SALÓN (sala chica sobrevendida) | Ref: DEMO-0085', true),
  ('DEMO-0086', 86, 'Operación habitual · Asamblea de socios', 28, null, ((v_hoy + 11) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 11) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2700.00, null, 129, 'Hernán Castro - Pampa Alimentos', 'hcastro@pampaalimentos.test', '3516003329', null, v_ahora - make_interval(hours => 1368), v_ahora - make_interval(hours => 684), null, 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0086', false),
  ('DEMO-0087', 87, 'Operación habitual · Cumpleaños', 15, 21, ((v_hoy + 11) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 12) + time '03:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1560.00, 4530.00, 36, 'Emiliano Torres', 'emiliano.torres@correo-personal.test', '3514927042', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2904), v_ahora - make_interval(hours => 968), v_ahora - make_interval(hours => 968), 'Evento: Cumpleaños.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cumpleaños | Ref: DEMO-0087', true),
  ('DEMO-0088', 88, 'Operación habitual · Asamblea de socios', 28, null, ((v_hoy + 12) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 12) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2700.00, 3468.00, 96, 'Nicolás Cabrera - Grupo Centro', 'ncabrera@grupocentro.test', '3517543410', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1440), v_ahora - make_interval(hours => 480), v_ahora - make_interval(hours => 480), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0088', true),
  ('DEMO-0089', 89, 'I5 · Evento que cruza la medianoche (termina de madrugada)', 22, 52, ((v_hoy + 12) + time '21:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 13) + time '04:30') at time zone 'America/Argentina/Cordoba', 'Confirmado', 5200.00, 25946.00, 215, 'Bautista Correa y Malena Ruiz', 'bautista.correa@correo-personal.test', '3517332209', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 2232), v_ahora - make_interval(hours => 1320), v_ahora - make_interval(hours => 1320), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: I5 · Evento que cruza la medianoche (termina de madrugada) | Ref: DEMO-0089', true),
  ('DEMO-0090', 90, 'Operación habitual · Reunión de trabajo', 22, null, ((v_hoy + 14) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 14) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 4000.00, 4000.00, 251, 'Bruno Herrera - Logística Federal', 'bherrera@logisticafederal.test', '3516637049', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 1248), v_ahora - make_interval(hours => 312), v_ahora - make_interval(hours => 312), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0090', false),
  ('DEMO-0091', 91, 'Operación habitual · Jornada médica', 18, null, ((v_hoy + 15) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 15) + time '17:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 6500.00, 33892.00, 521, 'Octavio Alcaraz - Nova Energía SA', 'oalcaraz@novaenergia.test', '3516674619', null, v_ahora - make_interval(hours => 288), v_ahora - make_interval(hours => 288), v_ahora - make_interval(hours => 24), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0091', false),
  ('DEMO-0092', 92, 'D1 · Supera la capacidad de la DISTRIBUCIÓN pero no la del salón', 12, 10, ((v_hoy + 15) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 15) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 4848.00, 62, 'Griselda Ponce - Colegio de Escribanos', 'gponce@escribanos-cba.test', '3514550093', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 480), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Jornada notarial.
[DEMO_LOTE:operacion-2m-v2] Caso: D1 · Supera la capacidad de la DISTRIBUCIÓN pero no la del salón | Ref: DEMO-0092', false),
  ('DEMO-0093', 93, 'Operación habitual · Encuentro institucional', 15, 21, ((v_hoy + 15) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 15) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 1200.00, 2925.00, 75, 'Helena Bianchi - Cooperativa El Progreso', 'hbianchi@coopelprogreso.test', '3516410045', null, v_ahora - make_interval(hours => 1584), v_ahora - make_interval(hours => 396), v_ahora - make_interval(hours => 396), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0093', false),
  ('DEMO-0094', 94, 'Operación habitual · Encuentro institucional', 22, 49, ((v_hoy + 17) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 17) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 4000.00, 11045.00, 355, 'Leonardo Medina - Constructora Sierras', 'lmedina@constructorasierras.test', '3517617157', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1440), v_ahora - make_interval(hours => 360), v_ahora - make_interval(hours => 360), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0094', true),
  ('DEMO-0095', 95, 'Operación habitual · Reunión de trabajo', 33, null, ((v_hoy + 17) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 17) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 558.00, 558.00, 14, 'Camila Acosta - Estudio Paz & Roca', 'cacosta@pazyroca.test', '3517174727', null, v_ahora - make_interval(hours => 156), v_ahora - make_interval(hours => 36), v_ahora - make_interval(hours => 36), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0095', true),
  ('DEMO-0096', 96, 'G1 · Cliente recurrente del back office (3 de 3 reservas del mismo ciclo)', 12, 9, ((v_hoy + 18) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 18) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 2982.00, 78, 'Silvana Roldán - Consultora Sinergia', 'sroldan@consultorasinergia.test', '3515447790', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 408), v_ahora - make_interval(hours => 168), v_ahora - make_interval(hours => 168), 'Evento: Ciclo de capacitaciones.
[DEMO_LOTE:operacion-2m-v2] Caso: G1 · Cliente recurrente del back office (3 de 3 reservas del mismo ciclo) | Ref: DEMO-0096', true),
  ('DEMO-0097', 97, 'Operación habitual · Capacitación interna', 28, null, ((v_hoy + 18) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 18) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Pagado', 2700.00, 5850.00, 150, 'Gustavo Nieva - Nova Energía SA', 'gnieva@novaenergia.test', '3514582722', null, v_ahora - make_interval(hours => 336), v_ahora - make_interval(hours => 84), v_ahora - make_interval(hours => 84), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0097', true),
  ('DEMO-0098', 98, 'Operación habitual · Cena de fin de año', 22, 49, ((v_hoy + 18) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 19) + time '01:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 5200.00, 26724.00, 261, 'Iván Roldán', 'ivan.roldan@correo-personal.test', '3515780664', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 1056), v_ahora - make_interval(hours => 352), v_ahora - make_interval(hours => 352), 'Evento: Cena de fin de año.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cena de fin de año | Ref: DEMO-0098', true),
  ('DEMO-0099', 99, 'A4 · Pendiente validación con la vigencia YA VENCIDA (el cron la cancelará)', 29, 75, ((v_hoy + 19) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 19) + time '16:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 800.00, 1376.00, 48, 'Gonzalo Ferreyra', 'gonzalo.ferreyra@correo-personal.test', '3516640925', null, v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 173), 'Evento: Reunión de consorcio.
[DEMO_LOTE:operacion-2m-v2] Caso: A4 · Pendiente validación con la vigencia YA VENCIDA (el cron la cancelará) | Ref: DEMO-0099', false),
  ('DEMO-0100', 100, 'Operación habitual · Almuerzo familiar', 27, 68, ((v_hoy + 19) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 19) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2000.00, 12582.00, 143, 'Rocío Ferreyra', 'rocio.ferreyra@correo-personal.test', '3516440795', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 2760), v_ahora - make_interval(hours => 920), v_ahora - make_interval(hours => 920), 'Evento: Almuerzo familiar.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Almuerzo familiar | Ref: DEMO-0100', true),
  ('DEMO-0101', 101, 'Operación habitual · Aniversario de empresa', 28, null, ((v_hoy + 19) + time '20:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 20) + time '00:30') at time zone 'America/Argentina/Cordoba', 'Confirmado', 3510.00, 15629.00, 147, 'Kevin Miranda', 'kevin.miranda@correo-personal.test', '3515356825', null, v_ahora - make_interval(hours => 1512), v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 504), 'Evento: Aniversario de empresa.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Aniversario de empresa | Ref: DEMO-0101', true),
  ('DEMO-0102', 102, 'B5 · Doble turno confirmado en el mismo salón: turno mañana', 18, 34, ((v_hoy + 20) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 20) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 6500.00, 20290.00, 420, 'Silvina Ramos - Ministerio de Educación', 'sramos@educacion-cba.test', '3514440021', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1320), v_ahora - make_interval(hours => 672), v_ahora - make_interval(hours => 672), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: B5 · Doble turno confirmado en el mismo salón: turno mañana | Ref: DEMO-0102', true),
  ('DEMO-0103', 103, 'B5 · Doble turno confirmado en el mismo salón: turno noche (se advierte superposición de fecha)', 18, 35, ((v_hoy + 20) + time '19:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 20) + time '23:59') at time zone 'America/Argentina/Cordoba', 'Confirmado', 6500.00, 51320.00, 600, 'Gastón Ibarra - Cámara de Comercio', 'gibarra@camaracomercio.test', '3517220098', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1248), v_ahora - make_interval(hours => 648), v_ahora - make_interval(hours => 648), 'Evento: Cena de gala.
[DEMO_LOTE:operacion-2m-v2] Caso: B5 · Doble turno confirmado en el mismo salón: turno noche (se advierte superposición de fecha) | Ref: DEMO-0103', true),
  ('DEMO-0104', 104, 'Operación habitual · Congreso corporativo', 15, null, ((v_hoy + 21) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 21) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 6478.00, 56, 'Natalia Reinoso - Red Educativa', 'nreinoso@rededucativa.test', '3514527521', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 600), v_ahora - make_interval(hours => 200), v_ahora - make_interval(hours => 200), 'Evento: Congreso corporativo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Congreso corporativo | Ref: DEMO-0104', true),
  ('DEMO-0105', 105, 'D3 · Supera la capacidad del salón Y la de la distribución', 29, 76, ((v_hoy + 22) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 22) + time '19:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 800.00, 2502.00, 74, 'Noelia Ferreyra - Escuela Municipal N°4', 'nferreyra@escuela4.test', '3515336648', null, v_ahora - make_interval(hours => 192), v_ahora - make_interval(hours => 192), v_ahora - make_interval(hours => 48), 'Evento: Acto de fin de curso.
[DEMO_LOTE:operacion-2m-v2] Caso: D3 · Supera la capacidad del salón Y la de la distribución | Ref: DEMO-0105', false),
  ('DEMO-0106', 106, 'Operación habitual · Reunión de trabajo', 18, 35, ((v_hoy + 22) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 22) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 6500.00, 6500.00, 559, 'Emiliano Torres - Cooperativa El Progreso', 'etorres@coopelprogreso.test', '3515792050', null, v_ahora - make_interval(hours => 1680), v_ahora - make_interval(hours => 560), v_ahora - make_interval(hours => 560), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0106', true),
  ('DEMO-0107', 107, 'Operación habitual · Reunión de trabajo', 27, 68, ((v_hoy + 23) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 23) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2000.00, 2000.00, 130, 'Octavio Alcaraz - Mercado Norte', 'oalcaraz@mercadonorte.test', '3515795566', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 408), v_ahora - make_interval(hours => 136), v_ahora - make_interval(hours => 136), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0107', true),
  ('DEMO-0108', 108, 'Operación habitual · Congreso corporativo', 29, 75, ((v_hoy + 24) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 24) + time '18:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 800.00, null, 43, 'Laura Bergara - Horizonte Salud', 'lbergara@horizontesalud.test', '3515181673', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 1176), v_ahora - make_interval(hours => 1176), null, 'Evento: Congreso corporativo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Congreso corporativo | Ref: DEMO-0108', false),
  ('DEMO-0109', 109, 'Operación habitual · Jornada médica', 22, null, ((v_hoy + 25) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 25) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 4000.00, 13660.00, 180, 'Sabrina Ávila - Andes Tecnología', 'savila@andestecnologia.test', '3517834263', null, v_ahora - make_interval(hours => 696), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0109', false),
  ('DEMO-0110', 110, 'H1 · El monto actual cambió respecto del presupuesto original (se agregaron servicios después)', 15, 21, ((v_hoy + 25) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 25) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 3784.00, 76, 'Mauricio Alcaraz - Ingeniería Austral', 'malcaraz@ingenieriaaustral.test', '3514990066', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 840), v_ahora - make_interval(hours => 288), v_ahora - make_interval(hours => 288), 'Evento: Jornada técnica.
[DEMO_LOTE:operacion-2m-v2] Caso: H1 · El monto actual cambió respecto del presupuesto original (se agregaron servicios después) | Ref: DEMO-0110', true),
  ('DEMO-0111', 111, 'Operación habitual · Reunión de trabajo', 12, 12, ((v_hoy + 25) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 25) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 1200.00, 46, 'Kevin Miranda - Nova Energía SA', 'kmiranda@novaenergia.test', '3516240895', null, v_ahora - make_interval(hours => 912), v_ahora - make_interval(hours => 72), v_ahora - make_interval(hours => 72), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0111', false),
  ('DEMO-0112', 112, 'A3 · Pendiente validación en el ÚLTIMO día de vigencia del presupuesto', 15, 21, ((v_hoy + 26) + time '09:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 26) + time '17:30') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 1200.00, 2568.00, 72, 'Sofía Miranda - Colegio San Buenaventura', 'smiranda@sanbuenaventura.test', '3515501173', null, v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 144), 'Evento: Jornada docente.
[DEMO_LOTE:operacion-2m-v2] Caso: A3 · Pendiente validación en el ÚLTIMO día de vigencia del presupuesto | Ref: DEMO-0112', false),
  ('DEMO-0113', 113, 'Operación habitual · Asamblea de socios', 28, null, ((v_hoy + 26) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 26) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2700.00, 3924.00, 153, 'Agustina Ríos - Seguros Del Plata', 'arios@segurosdelplata.test', '3517295311', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 336), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0113', false),
  ('DEMO-0114', 114, 'A11 · Cancelado desde Confirmado, con nota previa en el historial', 18, 36, ((v_hoy + 26) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 27) + time '03:30') at time zone 'America/Argentina/Cordoba', 'Cancelado', 8450.00, 25210.00, 190, 'Familia Ocampo Bustamante', 'ocampo.eventos@correo-personal.test', '3516123877', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1296), v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 144), 'Evento: Fiesta de 15.
[DEMO_LOTE:operacion-2m-v2] Caso: A11 · Cancelado desde Confirmado, con nota previa en el historial | Ref: DEMO-0114', false),
  ('DEMO-0115', 115, 'Operación habitual · Acto académico', 22, 49, ((v_hoy + 28) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 28) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 4000.00, null, 262, 'Olivia Arias - Cooperativa El Progreso', 'oarias@coopelprogreso.test', '3517857476', null, v_ahora - make_interval(hours => 1008), v_ahora - make_interval(hours => 252), null, 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0115', false),
  ('DEMO-0116', 116, 'B4 · Reserva Confirmada del mismo día que deja al Validado en conflicto', 29, 75, ((v_hoy + 29) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 29) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Confirmado', 800.00, 2145.00, 55, 'Federico Luna - Consejo Profesional', 'fluna@consejoprofesional.test', '3515338874', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 768), v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 432), 'Evento: Asamblea anual.
[DEMO_LOTE:operacion-2m-v2] Caso: B4 · Reserva Confirmada del mismo día que deja al Validado en conflicto | Ref: DEMO-0116', true),
  ('DEMO-0117', 117, 'B4 · Validado que quedó rezagado frente a una reserva Confirmada del mismo día', 29, 77, ((v_hoy + 29) + time '13:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 29) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Validado', 800.00, 3612.00, 38, 'Rocío Maldonado', 'rocio.maldonado@correo-personal.test', '3514661192', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 384), v_ahora - make_interval(hours => 96), v_ahora - make_interval(hours => 96), 'Evento: Almuerzo familiar.
[DEMO_LOTE:operacion-2m-v2] Caso: B4 · Validado que quedó rezagado frente a una reserva Confirmada del mismo día | Ref: DEMO-0117', false),
  ('DEMO-0118', 118, 'Operación habitual · Desayuno de trabajo', 18, 35, ((v_hoy + 30) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 30) + time '11:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 6500.00, 16433.00, 473, 'Isabel Vega - Bodega Alta Vista', 'ivega@bodegaaltavista.test', '3514806047', null, v_ahora - make_interval(hours => 1152), v_ahora - make_interval(hours => 1152), v_ahora - make_interval(hours => 12), 'Evento: Desayuno de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Desayuno de trabajo | Ref: DEMO-0118', false),
  ('DEMO-0119', 119, 'A5 · Validado con 2 días de vigencia restantes', 12, 9, ((v_hoy + 30) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 30) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 3248.00, 76, 'Marina Quiroga - Horizonte Salud', 'mquiroga@horizontesalud.test', '3514478810', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 192), v_ahora - make_interval(hours => 120), v_ahora - make_interval(hours => 120), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: A5 · Validado con 2 días de vigencia restantes | Ref: DEMO-0119', false),
  ('DEMO-0120', 120, 'Operación habitual · Jornada médica', 27, 68, ((v_hoy + 31) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 31) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2000.00, 9112.00, 131, 'Octavio Alcaraz - Cooperativa El Progreso', 'oalcaraz@coopelprogreso.test', '3516262117', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 264), v_ahora - make_interval(hours => 24), v_ahora - make_interval(hours => 24), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0120', false),
  ('DEMO-0121', 121, 'Operación habitual · Reunión de directorio', 22, 49, ((v_hoy + 31) + time '09:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 31) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Cancelado', 4000.00, 6696.00, 337, 'Olivia Arias - Grupo Centro', 'oarias@grupocentro.test', '3515580760', null, v_ahora - make_interval(hours => 1680), v_ahora - make_interval(hours => 420), v_ahora - make_interval(hours => 420), 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de directorio | Ref: DEMO-0121', false),
  ('DEMO-0122', 122, 'H2 · Presupuesto emitido y monto sin cambios desde entonces', 15, 22, ((v_hoy + 32) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 32) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 1884.00, 36, 'Natalia Correa - Instituto Sierras', 'ncorrea@institutosierras.test', '3515006674', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 312), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Capacitación docente.
[DEMO_LOTE:operacion-2m-v2] Caso: H2 · Presupuesto emitido y monto sin cambios desde entonces | Ref: DEMO-0122', false),
  ('DEMO-0123', 123, 'Operación habitual · Aniversario de empresa', 12, 9, ((v_hoy + 33) + time '20:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 34) + time '00:30') at time zone 'America/Argentina/Cordoba', 'Pagado', 1560.00, 7170.00, 68, 'Gabriela Romero', 'gabriela.romero@correo-personal.test', '3515711369', null, v_ahora - make_interval(hours => 2760), v_ahora - make_interval(hours => 690), v_ahora - make_interval(hours => 690), 'Evento: Aniversario de empresa.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Aniversario de empresa | Ref: DEMO-0123', true),
  ('DEMO-0124', 124, 'A7 · Confirmado con seña registrada', 18, 35, ((v_hoy + 33) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 34) + time '04:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 8450.00, 58010.00, 520, 'Valentina Ríos Bustos', 'valentina.rios@correo-personal.test', '3517789004', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1488), v_ahora - make_interval(hours => 1080), v_ahora - make_interval(hours => 1080), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: A7 · Confirmado con seña registrada | Ref: DEMO-0124', true),
  ('DEMO-0125', 125, 'Operación habitual · Casamiento', 28, null, ((v_hoy + 33) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 34) + time '04:30') at time zone 'America/Argentina/Cordoba', 'Pagado', 3510.00, 11490.00, 80, 'Gustavo Nieva', 'gustavo.nieva@correo-personal.test', '3515191605', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 2016), v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 504), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Casamiento | Ref: DEMO-0125', true),
  ('DEMO-0126', 126, 'A2 · Pendiente validación con presupuesto enviado y 3 días de vigencia restantes', 27, 69, ((v_hoy + 34) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 34) + time '18:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 2000.00, 6890.00, 85, 'Ramiro Ledesma - Nova Energía SA', 'rledesma@novaenergia.test', '3514112298', null, v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 96), 'Evento: Convención comercial.
[DEMO_LOTE:operacion-2m-v2] Caso: A2 · Pendiente validación con presupuesto enviado y 3 días de vigencia restantes | Ref: DEMO-0126', false),
  ('DEMO-0127', 127, 'Operación habitual · Jornada médica', 15, 24, ((v_hoy + 35) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 35) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 3372.00, 36, 'Camila Acosta - Logística Federal', 'cacosta@logisticafederal.test', '3517515896', null, v_ahora - make_interval(hours => 1440), v_ahora - make_interval(hours => 24), v_ahora - make_interval(hours => 24), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0127', false),
  ('DEMO-0128', 128, 'Operación habitual · Almuerzo institucional', 22, 49, ((v_hoy + 35) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 35) + time '16:30') at time zone 'America/Argentina/Cordoba', 'Cancelado', 4000.00, null, 332, 'Federico Molina - Bodega Alta Vista', 'fmolina@bodegaaltavista.test', '3516504970', null, v_ahora - make_interval(hours => 1584), v_ahora - make_interval(hours => 396), null, 'Evento: Almuerzo institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Almuerzo institucional | Ref: DEMO-0128', false),
  ('DEMO-0129', 129, 'Operación habitual · Taller de capacitación', 28, null, ((v_hoy + 36) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 36) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2700.00, 6040.00, 160, 'Ramiro Zárate - Bodega Alta Vista', 'rzarate@bodegaaltavista.test', '3517923194', null, v_ahora - make_interval(hours => 1512), v_ahora - make_interval(hours => 12), v_ahora - make_interval(hours => 12), 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0129', false),
  ('DEMO-0130', 130, 'Operación habitual · Acto académico', 33, null, ((v_hoy + 36) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 36) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 558.00, 1067.00, 11, 'Walter Ávalos - Clínica del Valle', 'wavalos@clinicadelvalle.test', '3515575599', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 744), v_ahora - make_interval(hours => 248), v_ahora - make_interval(hours => 248), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0130', true),
  ('DEMO-0131', 131, 'Operación habitual · Taller de capacitación', 28, null, ((v_hoy + 37) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 37) + time '17:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 2700.00, null, 138, 'Gabriela Romero - Grupo Centro', 'gromero@grupocentro.test', '3514724364', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 168), v_ahora - make_interval(hours => 168), null, 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0131', false),
  ('DEMO-0132', 132, 'Operación habitual · Acto académico', 28, null, ((v_hoy + 38) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 38) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2700.00, 6021.00, 159, 'Kevin Miranda - Andes Tecnología', 'kmiranda@andestecnologia.test', '3516626200', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 96), v_ahora - make_interval(hours => 72), v_ahora - make_interval(hours => 72), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0132', false),
  ('DEMO-0133', 133, 'B2 · Solicitud web Pendiente sobre un salón YA confirmado (llega igual y se advierte)', 27, 68, ((v_hoy + 39) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 39) + time '17:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 2000.00, 10640.00, 160, 'Ignacio Bustos - Pampa Alimentos', 'ibustos@pampaalimentos.test', '3514007765', null, v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 72), 'Evento: Convención comercial.
[DEMO_LOTE:operacion-2m-v2] Caso: B2 · Solicitud web Pendiente sobre un salón YA confirmado (llega igual y se advierte) | Ref: DEMO-0133', false),
  ('DEMO-0134', 134, 'B2 · Reserva Confirmada que ocupa el salón (base del conflicto)', 27, 70, ((v_hoy + 39) + time '20:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 39) + time '23:59') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2000.00, 13020.00, 145, 'Delia Moyano - Fundación Raíces', 'dmoyano@fundacionraices.test', '3515882207', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1008), v_ahora - make_interval(hours => 600), v_ahora - make_interval(hours => 600), 'Evento: Cena solidaria.
[DEMO_LOTE:operacion-2m-v2] Caso: B2 · Reserva Confirmada que ocupa el salón (base del conflicto) | Ref: DEMO-0134', true),
  ('DEMO-0135', 135, 'E2 · Sábado pico (+40 d): brunch de egresados', 29, 77, ((v_hoy + 40) + time '11:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 40) + time '16:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 800.00, 2720.00, 40, 'Joaquín Navarro', 'joaquin.navarro@correo-personal.test', '3515993318', null, v_ahora - make_interval(hours => 120), v_ahora - make_interval(hours => 120), v_ahora - make_interval(hours => 48), 'Evento: Brunch de egresados.
[DEMO_LOTE:operacion-2m-v2] Caso: E2 · Sábado pico (+40 d): brunch de egresados | Ref: DEMO-0135', false),
  ('DEMO-0136', 136, 'E2 · Sábado pico (+40 d): almuerzo empresarial', 12, 12, ((v_hoy + 40) + time '12:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 40) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 5270.00, 55, 'Roberto Céspedes - Logística Federal', 'rcespedes@logisticafederal.test', '3516445523', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 888), v_ahora - make_interval(hours => 576), v_ahora - make_interval(hours => 576), 'Evento: Almuerzo empresarial.
[DEMO_LOTE:operacion-2m-v2] Caso: E2 · Sábado pico (+40 d): almuerzo empresarial | Ref: DEMO-0136', true),
  ('DEMO-0137', 137, 'E2 · Sábado pico (+40 d): agasajo institucional', 15, 24, ((v_hoy + 40) + time '13:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 40) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 5048.00, 52, 'Elena Suárez - Círculo de Ingenieros', 'esuarez@circuloingenieros.test', '3514112207', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 24), v_ahora - make_interval(hours => 24), 'Evento: Agasajo institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: E2 · Sábado pico (+40 d): agasajo institucional | Ref: DEMO-0137', false),
  ('DEMO-0138', 138, 'E2 · Sábado pico (+40 d): casamiento en el salón principal', 18, 36, ((v_hoy + 40) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 41) + time '05:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 8450.00, 27306.00, 195, 'Agustina Peralta y Nicolás Ferrero', 'agustina.peralta@correo-personal.test', '3517889912', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1968), v_ahora - make_interval(hours => 1488), v_ahora - make_interval(hours => 1488), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: E2 · Sábado pico (+40 d): casamiento en el salón principal | Ref: DEMO-0138', true),
  ('DEMO-0139', 139, 'E2 · Sábado pico (+40 d): fiesta de 15', 22, 52, ((v_hoy + 40) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 41) + time '05:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 5200.00, 25400.00, 230, 'Familia Zárate Molina', 'zarate.familia@correo-personal.test', '3514339981', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1848), v_ahora - make_interval(hours => 1392), v_ahora - make_interval(hours => 1392), 'Evento: Fiesta de 15.
[DEMO_LOTE:operacion-2m-v2] Caso: E2 · Sábado pico (+40 d): fiesta de 15 | Ref: DEMO-0139', true),
  ('DEMO-0140', 140, 'E2 · Sábado pico (+40 d): cumpleaños de 50', 27, 70, ((v_hoy + 40) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 41) + time '04:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2600.00, 12220.00, 130, 'Marisa Ovejero', 'marisa.ovejero@correo-personal.test', '3515220074', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 720), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Cumpleaños.
[DEMO_LOTE:operacion-2m-v2] Caso: E2 · Sábado pico (+40 d): cumpleaños de 50 | Ref: DEMO-0140', false),
  ('DEMO-0141', 141, 'Operación habitual · Congreso corporativo', 15, 21, ((v_hoy + 42) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 42) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 6126.00, 52, 'Leonardo Medina - Horizonte Salud', 'lmedina@horizontesalud.test', '3516090785', null, v_ahora - make_interval(hours => 1320), v_ahora - make_interval(hours => 440), v_ahora - make_interval(hours => 440), 'Evento: Congreso corporativo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Congreso corporativo | Ref: DEMO-0141', true),
  ('DEMO-0142', 142, 'Operación habitual · Acto académico', 18, 35, ((v_hoy + 42) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 42) + time '13:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 6500.00, 15369.00, 451, 'Patricia Beltrán - Bodega Alta Vista', 'pbeltran@bodegaaltavista.test', '3516421396', null, v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 24), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0142', false),
  ('DEMO-0143', 143, 'I4 · Reserva sin distribución asignada (el cliente define el armado más adelante)', 28, null, ((v_hoy + 43) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 43) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2700.00, 9980.00, 140, 'Melina Ostrowski - Fundación Cultural', 'mostrowski@fundacioncultural.test', '3515664402', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 408), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Encuentro cultural.
[DEMO_LOTE:operacion-2m-v2] Caso: I4 · Reserva sin distribución asignada (el cliente define el armado más adelante) | Ref: DEMO-0143', false),
  ('DEMO-0144', 144, 'Operación habitual · Acto académico', 27, 68, ((v_hoy + 43) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 43) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 2000.00, 4048.00, 92, 'Federico Molina - Logística Federal', 'fmolina@logisticafederal.test', '3516476135', null, v_ahora - make_interval(hours => 744), v_ahora - make_interval(hours => 186), v_ahora - make_interval(hours => 186), 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0144', false),
  ('DEMO-0145', 145, 'Operación habitual · Desayuno de trabajo', 15, 21, ((v_hoy + 44) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 44) + time '11:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 2775.00, 75, 'Kevin Miranda - Horizonte Salud', 'kmiranda@horizontesalud.test', '3517860546', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 672), v_ahora - make_interval(hours => 224), v_ahora - make_interval(hours => 224), 'Evento: Desayuno de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Desayuno de trabajo | Ref: DEMO-0145', true),
  ('DEMO-0146', 146, 'Operación habitual · Reunión de directorio', 22, 52, ((v_hoy + 44) + time '09:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 44) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Confirmado', 4000.00, 5648.00, 206, 'Helena Bianchi - Instituto Belgrano', 'hbianchi@institutobelgrano.test', '3516134776', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1248), v_ahora - make_interval(hours => 416), v_ahora - make_interval(hours => 416), 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de directorio | Ref: DEMO-0146', true),
  ('DEMO-0147', 147, 'Operación habitual · Taller de capacitación', 27, 70, ((v_hoy + 45) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 45) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2000.00, 4257.00, 103, 'Gustavo Nieva - Consultora Sinergia', 'gnieva@consultorasinergia.test', '3514914204', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1296), v_ahora - make_interval(hours => 432), v_ahora - make_interval(hours => 432), 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0147', true),
  ('DEMO-0148', 148, 'Operación habitual · Jornada médica', 27, 70, ((v_hoy + 46) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 46) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2000.00, 8748.00, 124, 'Ramiro Zárate - Andes Tecnología', 'rzarate@andestecnologia.test', '3514991277', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 624), v_ahora - make_interval(hours => 24), v_ahora - make_interval(hours => 24), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0148', false),
  ('DEMO-0149', 149, 'Operación habitual · Reunión de directorio', 22, 49, ((v_hoy + 46) + time '09:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 46) + time '12:30') at time zone 'America/Argentina/Cordoba', 'Cancelado', 4000.00, null, 272, 'Hernán Castro - Logística Federal', 'hcastro@logisticafederal.test', '3514108599', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 408), v_ahora - make_interval(hours => 102), null, 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de directorio | Ref: DEMO-0149', false),
  ('DEMO-0150', 150, 'A6 · Validado sin presupuesto emitido (no corre la vigencia de 7 días)', 28, null, ((v_hoy + 46) + time '19:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 46) + time '23:30') at time zone 'America/Argentina/Cordoba', 'Validado', 2700.00, null, 150, 'Esteban Peralta - Grupo Centro', 'eperalta@grupocentro.test', '3515123340', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 336), v_ahora - make_interval(hours => 336), null, 'Evento: Cena de fin de año.
[DEMO_LOTE:operacion-2m-v2] Caso: A6 · Validado sin presupuesto emitido (no corre la vigencia de 7 días) | Ref: DEMO-0150', false),
  ('DEMO-0151', 151, 'B3 · Dos presupuestos Validados vivos para el mismo salón y día (1 de 2)', 12, 10, ((v_hoy + 47) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 47) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 1922.00, 38, 'Paula Roldán - Instituto Belgrano', 'proldan@institutobelgrano.test', '3515229940', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 336), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: B3 · Dos presupuestos Validados vivos para el mismo salón y día (1 de 2) | Ref: DEMO-0151', false),
  ('DEMO-0152', 152, 'Operación habitual · Almuerzo familiar', 18, 35, ((v_hoy + 47) + time '12:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 47) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 6500.00, 56894.00, 681, 'Zoe Maldonado', 'zoe.maldonado@correo-personal.test', '3515288162', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1632), v_ahora - make_interval(hours => 544), v_ahora - make_interval(hours => 544), 'Evento: Almuerzo familiar.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Almuerzo familiar | Ref: DEMO-0152', true),
  ('DEMO-0153', 153, 'B3 · Dos presupuestos Validados vivos para el mismo salón y día (2 de 2)', 12, 11, ((v_hoy + 47) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 47) + time '19:30') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 1948.00, 32, 'Hernán Cáceres - Andes Tecnología', 'hcaceres@andestecnologia.test', '3516773301', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 288), v_ahora - make_interval(hours => 24), v_ahora - make_interval(hours => 24), 'Evento: Taller de producto.
[DEMO_LOTE:operacion-2m-v2] Caso: B3 · Dos presupuestos Validados vivos para el mismo salón y día (2 de 2) | Ref: DEMO-0153', false),
  ('DEMO-0154', 154, 'A1 · Pendiente validación recién ingresada por la web (sin presupuesto)', 22, 52, ((v_hoy + 47) + time '20:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 47) + time '23:59') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 4000.00, null, 180, 'Lucía Fernández Aguirre', 'lucia.fernandez@correo-personal.test', '3515284471', null, v_ahora - make_interval(hours => 7), v_ahora - make_interval(hours => 7), null, 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: A1 · Pendiente validación recién ingresada por la web (sin presupuesto) | Ref: DEMO-0154', false),
  ('DEMO-0155', 155, 'Operación habitual · Acto académico', 15, 24, ((v_hoy + 49) + time '10:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 49) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, null, 42, 'Joaquín Navarro - Estudio Paz & Roca', 'jnavarro@pazyroca.test', '3517709842', null, v_ahora - make_interval(hours => 84), v_ahora - make_interval(hours => 36), null, 'Evento: Acto académico.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Acto académico | Ref: DEMO-0155', false),
  ('DEMO-0156', 156, 'Operación habitual · Encuentro institucional', 28, null, ((v_hoy + 49) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 49) + time '19:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 2700.00, 5869.00, 151, 'Agustina Ríos - Andes Tecnología', 'arios@andestecnologia.test', '3516569838', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 1224), v_ahora - make_interval(hours => 408), v_ahora - make_interval(hours => 408), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0156', true),
  ('DEMO-0157', 157, 'Operación habitual · Capacitación interna', 22, 49, ((v_hoy + 50) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 50) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 4000.00, null, 312, 'Mariana Luna - Horizonte Salud', 'mluna@horizontesalud.test', '3517240406', null, v_ahora - make_interval(hours => 1296), v_ahora - make_interval(hours => 324), null, 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0157', false),
  ('DEMO-0158', 158, 'F3 · Evento de 4 días en estado Validado (aún sin seña)', 27, 68, ((v_hoy + 51) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 54) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Validado', 8000.00, 22120.00, 170, 'Ezequiel Maldonado - Expo Sierras', 'emaldonado@exposierras.test', '3516003321', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1056), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Exposición regional.
[DEMO_LOTE:operacion-2m-v2] Caso: F3 · Evento de 4 días en estado Validado (aún sin seña) | Ref: DEMO-0158', false),
  ('DEMO-0159', 159, 'Operación habitual · Taller de capacitación', 29, 75, ((v_hoy + 51) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 51) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 800.00, 2050.00, 50, 'Hernán Castro - Instituto Belgrano', 'hcastro@institutobelgrano.test', '3514282831', null, v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 48), v_ahora - make_interval(hours => 48), 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0159', true),
  ('DEMO-0160', 160, 'Operación habitual · Encuentro institucional', 15, 21, ((v_hoy + 51) + time '14:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 51) + time '19:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 1200.00, 2697.00, 63, 'Hernán Castro - Instituto Belgrano', 'hcastro@institutobelgrano.test', '3514822259', null, v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 504), v_ahora - make_interval(hours => 12), 'Evento: Encuentro institucional.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Encuentro institucional | Ref: DEMO-0160', false),
  ('DEMO-0161', 161, 'Operación habitual · Capacitación interna', 22, 49, ((v_hoy + 53) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 53) + time '13:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 4000.00, null, 306, 'Florencia Ledesma - Pampa Alimentos', 'fledesma@pampaalimentos.test', '3516504052', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 1320), v_ahora - make_interval(hours => 1320), null, 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0161', false),
  ('DEMO-0162', 162, 'Operación habitual · Cena de fin de año', 28, null, ((v_hoy + 53) + time '20:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 54) + time '01:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 3510.00, 16215.00, 154, 'Elena Suárez', 'elena.suarez@correo-personal.test', '3517952860', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 2256), v_ahora - make_interval(hours => 752), v_ahora - make_interval(hours => 752), 'Evento: Cena de fin de año.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cena de fin de año | Ref: DEMO-0162', true),
  ('DEMO-0163', 163, 'B1 · Dos solicitudes web Pendiente validación compiten por la misma fecha y salón', 22, 52, ((v_hoy + 54) + time '20:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 54) + time '23:59') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 4000.00, 22060.00, 210, 'Camila Ortiz Reynoso', 'camila.ortiz@correo-personal.test', '3517004411', null, v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 48), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: B1 · Dos solicitudes web Pendiente validación compiten por la misma fecha y salón | Ref: DEMO-0163', false),
  ('DEMO-0164', 164, 'B1 · Segunda solicitud web para la misma fecha y salón (se advierte superposición)', 22, 52, ((v_hoy + 54) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 55) + time '04:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 5200.00, 20995.00, 195, 'Tomás Aguirre Peña', 'tomas.aguirre@correo-personal.test', '3514558820', null, v_ahora - make_interval(hours => 96), v_ahora - make_interval(hours => 96), v_ahora - make_interval(hours => 24), 'Evento: Casamiento.
[DEMO_LOTE:operacion-2m-v2] Caso: B1 · Segunda solicitud web para la misma fecha y salón (se advierte superposición) | Ref: DEMO-0164', false),
  ('DEMO-0165', 165, 'Operación habitual · Jornada médica', 15, 21, ((v_hoy + 56) + time '08:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 56) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Cancelado', 1200.00, 5400.00, 75, 'Julia Cáceres - Logística Federal', 'jcaceres@logisticafederal.test', '3516873978', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 56), v_ahora - make_interval(hours => 5), v_ahora - make_interval(hours => 5), 'Evento: Jornada médica.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Jornada médica | Ref: DEMO-0165', false),
  ('DEMO-0166', 166, 'B6 · Congreso de 3 días Confirmado (base del conflicto multi-día)', 22, 50, ((v_hoy + 57) + time '08:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 59) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 12000.00, 27050.00, 175, 'Dr. Emiliano Vera - Sociedad de Cardiología', 'evera@cardiologia-cba.test', '3515119043', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1728), v_ahora - make_interval(hours => 1248), v_ahora - make_interval(hours => 1248), 'Evento: Congreso médico.
[DEMO_LOTE:operacion-2m-v2] Caso: B6 · Congreso de 3 días Confirmado (base del conflicto multi-día) | Ref: DEMO-0166', true),
  ('DEMO-0167', 167, 'Operación habitual · Taller de capacitación', 12, null, ((v_hoy + 57) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 57) + time '17:00') at time zone 'America/Argentina/Cordoba', 'Validado', 1200.00, 2184.00, 36, 'Natalia Reinoso - Bodega Alta Vista', 'nreinoso@bodegaaltavista.test', '3514026141', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 54), v_ahora - make_interval(hours => 12), v_ahora - make_interval(hours => 12), 'Evento: Taller de capacitación.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Taller de capacitación | Ref: DEMO-0167', false),
  ('DEMO-0168', 168, 'F2 · Convención de 2 días que arranca a la tarde (tarifa de día parcial)', 18, 34, ((v_hoy + 58) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 59) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 8450.00, 29550.00, 300, 'Lorena Bianchi - Cámara Hotelera', 'lbianchi@camarahotelera.test', '3514550088', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, v_ahora - make_interval(hours => 1368), v_ahora - make_interval(hours => 912), v_ahora - make_interval(hours => 912), 'Evento: Convención sectorial.
[DEMO_LOTE:operacion-2m-v2] Caso: F2 · Convención de 2 días que arranca a la tarde (tarifa de día parcial) | Ref: DEMO-0168', true),
  ('DEMO-0169', 169, 'Operación habitual · Reunión de trabajo', 28, null, ((v_hoy + 58) + time '15:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 58) + time '18:00') at time zone 'America/Argentina/Cordoba', 'Validado', 2700.00, 2700.00, 144, 'Tomás Maidana - Seguros Del Plata', 'tmaidana@segurosdelplata.test', '3515847910', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, v_ahora - make_interval(hours => 648), v_ahora - make_interval(hours => 72), v_ahora - make_interval(hours => 72), 'Evento: Reunión de trabajo.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Reunión de trabajo | Ref: DEMO-0169', false),
  ('DEMO-0170', 170, 'B6 · Solicitud web en el día 2 de un congreso ya confirmado (se advierte superposición)', 22, 73, ((v_hoy + 58) + time '18:30') at time zone 'America/Argentina/Cordoba', ((v_hoy + 58) + time '22:00') at time zone 'America/Argentina/Cordoba', U&'Pendiente validaci\00F3n', 4000.00, 4980.00, 70, 'Bruno Herrera Salvatierra', 'bruno.herrera@correo-personal.test', '3514228860', null, v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 144), v_ahora - make_interval(hours => 24), 'Evento: Reunión de directorio.
[DEMO_LOTE:operacion-2m-v2] Caso: B6 · Solicitud web en el día 2 de un congreso ya confirmado (se advierte superposición) | Ref: DEMO-0170', false),
  ('DEMO-0171', 171, 'Operación habitual · Asamblea de socios', 12, 12, ((v_hoy + 60) + time '18:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 60) + time '21:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 1200.00, 1616.00, 52, 'Zoe Maldonado - Clínica del Valle', 'zmaldonado@clinicadelvalle.test', '3516958966', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 56), v_ahora - make_interval(hours => 5), v_ahora - make_interval(hours => 5), 'Evento: Asamblea de socios.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Asamblea de socios | Ref: DEMO-0171', true),
  ('DEMO-0172', 172, 'Operación habitual · Cumpleaños', 22, 49, ((v_hoy + 60) + time '21:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 61) + time '03:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 5200.00, 29785.00, 298, 'Gustavo Nieva', 'gustavo.nieva@correo-personal.test', '3514834944', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, v_ahora - make_interval(hours => 1440), v_ahora - make_interval(hours => 480), v_ahora - make_interval(hours => 480), 'Evento: Cumpleaños.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Cumpleaños | Ref: DEMO-0172', true),
  ('DEMO-0173', 173, 'Operación habitual · Capacitación interna', 18, 33, ((v_hoy + 61) + time '09:00') at time zone 'America/Argentina/Cordoba', ((v_hoy + 61) + time '13:00') at time zone 'America/Argentina/Cordoba', 'Confirmado', 6500.00, 19245.00, 655, 'Martín Ocampo - Grupo Centro', 'mocampo@grupocentro.test', '3516891558', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, v_ahora - make_interval(hours => 552), v_ahora - make_interval(hours => 184), v_ahora - make_interval(hours => 184), 'Evento: Capacitación interna.
[DEMO_LOTE:operacion-2m-v2] Caso: Operación habitual · Capacitación interna | Ref: DEMO-0173', true);

insert into demo_carga_servicios (clave, id_servicio, cantidad)
values
  ('DEMO-0001', 19, 54),
  ('DEMO-0001', 24, 108),
  ('DEMO-0001', 26, 54),
  ('DEMO-0001', 35, 1),
  ('DEMO-0002', 21, 59),
  ('DEMO-0002', 25, 59),
  ('DEMO-0002', 34, 1),
  ('DEMO-0003', 21, 180),
  ('DEMO-0003', 26, 180),
  ('DEMO-0004', 21, 8),
  ('DEMO-0004', 25, 8),
  ('DEMO-0004', 34, 1),
  ('DEMO-0007', 21, 71),
  ('DEMO-0007', 25, 71),
  ('DEMO-0007', 34, 1),
  ('DEMO-0008', 21, 68),
  ('DEMO-0008', 25, 68),
  ('DEMO-0008', 34, 1),
  ('DEMO-0009', 30, 102),
  ('DEMO-0009', 32, 102),
  ('DEMO-0009', 33, 51),
  ('DEMO-0009', 36, 1),
  ('DEMO-0010', 22, 106),
  ('DEMO-0010', 26, 106),
  ('DEMO-0010', 34, 1),
  ('DEMO-0011', 21, 71),
  ('DEMO-0011', 25, 71),
  ('DEMO-0011', 34, 1),
  ('DEMO-0012', 21, 8),
  ('DEMO-0014', 21, 261),
  ('DEMO-0015', 16, 19),
  ('DEMO-0015', 21, 19),
  ('DEMO-0016', 21, 57),
  ('DEMO-0016', 25, 57),
  ('DEMO-0016', 34, 1),
  ('DEMO-0018', 19, 720),
  ('DEMO-0018', 22, 1440),
  ('DEMO-0018', 26, 720),
  ('DEMO-0018', 35, 3),
  ('DEMO-0019', 30, 72),
  ('DEMO-0019', 32, 72),
  ('DEMO-0019', 33, 36),
  ('DEMO-0019', 36, 1),
  ('DEMO-0020', 16, 239),
  ('DEMO-0020', 21, 239),
  ('DEMO-0021', 27, 109),
  ('DEMO-0021', 31, 109),
  ('DEMO-0022', 21, 63),
  ('DEMO-0022', 25, 63),
  ('DEMO-0022', 34, 1),
  ('DEMO-0023', 22, 162),
  ('DEMO-0023', 26, 162),
  ('DEMO-0023', 34, 1),
  ('DEMO-0024', 27, 14),
  ('DEMO-0024', 31, 14),
  ('DEMO-0025', 19, 7),
  ('DEMO-0025', 24, 14),
  ('DEMO-0025', 26, 7),
  ('DEMO-0025', 35, 1),
  ('DEMO-0026', 21, 125),
  ('DEMO-0027', 21, 60),
  ('DEMO-0028', 30, 154),
  ('DEMO-0028', 32, 154),
  ('DEMO-0028', 33, 77),
  ('DEMO-0028', 36, 1),
  ('DEMO-0030', 21, 432),
  ('DEMO-0030', 25, 432),
  ('DEMO-0030', 34, 1),
  ('DEMO-0031', 21, 7),
  ('DEMO-0031', 25, 7),
  ('DEMO-0031', 34, 1),
  ('DEMO-0032', 22, 47),
  ('DEMO-0032', 26, 47),
  ('DEMO-0032', 34, 1),
  ('DEMO-0033', 22, 48),
  ('DEMO-0033', 26, 48),
  ('DEMO-0033', 34, 1),
  ('DEMO-0034', 28, 260),
  ('DEMO-0034', 31, 260),
  ('DEMO-0034', 33, 130),
  ('DEMO-0035', 30, 70),
  ('DEMO-0035', 32, 70),
  ('DEMO-0035', 33, 35),
  ('DEMO-0035', 36, 1),
  ('DEMO-0036', 28, 161),
  ('DEMO-0036', 31, 161),
  ('DEMO-0036', 33, 80),
  ('DEMO-0038', 19, 430),
  ('DEMO-0038', 22, 430),
  ('DEMO-0038', 26, 430),
  ('DEMO-0038', 35, 1),
  ('DEMO-0039', 21, 85),
  ('DEMO-0039', 25, 85),
  ('DEMO-0039', 34, 1),
  ('DEMO-0040', 27, 58),
  ('DEMO-0040', 31, 58),
  ('DEMO-0041', 21, 20),
  ('DEMO-0042', 21, 19),
  ('DEMO-0042', 25, 19),
  ('DEMO-0042', 34, 1),
  ('DEMO-0044', 28, 83),
  ('DEMO-0044', 31, 83),
  ('DEMO-0044', 33, 41),
  ('DEMO-0045', 23, 140),
  ('DEMO-0047', 16, 20),
  ('DEMO-0048', 21, 74),
  ('DEMO-0048', 25, 74),
  ('DEMO-0048', 34, 1),
  ('DEMO-0049', 21, 118),
  ('DEMO-0049', 25, 118),
  ('DEMO-0049', 34, 1),
  ('DEMO-0051', 21, 454),
  ('DEMO-0051', 25, 454),
  ('DEMO-0051', 34, 1),
  ('DEMO-0052', 19, 340),
  ('DEMO-0052', 24, 340),
  ('DEMO-0052', 26, 340),
  ('DEMO-0052', 35, 1),
  ('DEMO-0053', 22, 11),
  ('DEMO-0053', 26, 11),
  ('DEMO-0053', 34, 1),
  ('DEMO-0054', 21, 6),
  ('DEMO-0054', 25, 6),
  ('DEMO-0054', 34, 1),
  ('DEMO-0055', 21, 73),
  ('DEMO-0055', 25, 73),
  ('DEMO-0055', 34, 1),
  ('DEMO-0056', 30, 40),
  ('DEMO-0056', 32, 40),
  ('DEMO-0056', 33, 20),
  ('DEMO-0056', 36, 1),
  ('DEMO-0057', 28, 122),
  ('DEMO-0057', 31, 122),
  ('DEMO-0057', 33, 61),
  ('DEMO-0058', 27, 58),
  ('DEMO-0058', 31, 58),
  ('DEMO-0059', 21, 432),
  ('DEMO-0060', 21, 137),
  ('DEMO-0061', 21, 163),
  ('DEMO-0062', 21, 67),
  ('DEMO-0062', 25, 67),
  ('DEMO-0062', 34, 1),
  ('DEMO-0063', 25, 38),
  ('DEMO-0064', 28, 121),
  ('DEMO-0064', 31, 121),
  ('DEMO-0064', 33, 60),
  ('DEMO-0065', 30, 59),
  ('DEMO-0065', 32, 59),
  ('DEMO-0065', 33, 29),
  ('DEMO-0065', 36, 1),
  ('DEMO-0066', 27, 610),
  ('DEMO-0066', 31, 610),
  ('DEMO-0067', 19, 650),
  ('DEMO-0067', 22, 650),
  ('DEMO-0067', 26, 650),
  ('DEMO-0067', 35, 1),
  ('DEMO-0068', 21, 70),
  ('DEMO-0068', 25, 70),
  ('DEMO-0068', 34, 1),
  ('DEMO-0069', 21, 18),
  ('DEMO-0069', 16, 18),
  ('DEMO-0070', 29, 120),
  ('DEMO-0070', 33, 60),
  ('DEMO-0070', 31, 120),
  ('DEMO-0071', 21, 9),
  ('DEMO-0072', 28, 150),
  ('DEMO-0072', 31, 150),
  ('DEMO-0072', 33, 75),
  ('DEMO-0073', 16, 22),
  ('DEMO-0073', 21, 22),
  ('DEMO-0075', 17, 28),
  ('DEMO-0075', 21, 28),
  ('DEMO-0076', 21, 7),
  ('DEMO-0076', 25, 7),
  ('DEMO-0076', 34, 1),
  ('DEMO-0077', 28, 622),
  ('DEMO-0077', 31, 622),
  ('DEMO-0077', 33, 311),
  ('DEMO-0079', 28, 110),
  ('DEMO-0079', 31, 110),
  ('DEMO-0079', 33, 55),
  ('DEMO-0080', 21, 36),
  ('DEMO-0081', 21, 21),
  ('DEMO-0083', 16, 71),
  ('DEMO-0083', 21, 71),
  ('DEMO-0084', 21, 309),
  ('DEMO-0084', 25, 309),
  ('DEMO-0084', 34, 1),
  ('DEMO-0085', 21, 16),
  ('DEMO-0085', 16, 16),
  ('DEMO-0086', 21, 129),
  ('DEMO-0087', 28, 36),
  ('DEMO-0087', 31, 36),
  ('DEMO-0087', 33, 18),
  ('DEMO-0088', 21, 96),
  ('DEMO-0089', 30, 215),
  ('DEMO-0089', 32, 215),
  ('DEMO-0089', 33, 108),
  ('DEMO-0089', 36, 1),
  ('DEMO-0091', 22, 521),
  ('DEMO-0091', 26, 521),
  ('DEMO-0091', 34, 1),
  ('DEMO-0092', 24, 62),
  ('DEMO-0092', 26, 62),
  ('DEMO-0092', 34, 1),
  ('DEMO-0093', 21, 75),
  ('DEMO-0093', 25, 75),
  ('DEMO-0093', 34, 1),
  ('DEMO-0094', 21, 355),
  ('DEMO-0094', 25, 355),
  ('DEMO-0094', 34, 1),
  ('DEMO-0096', 21, 78),
  ('DEMO-0096', 25, 78),
  ('DEMO-0096', 34, 1),
  ('DEMO-0097', 21, 150),
  ('DEMO-0097', 25, 150),
  ('DEMO-0097', 34, 1),
  ('DEMO-0098', 28, 261),
  ('DEMO-0098', 31, 261),
  ('DEMO-0098', 33, 130),
  ('DEMO-0099', 22, 48),
  ('DEMO-0100', 27, 143),
  ('DEMO-0100', 31, 143),
  ('DEMO-0101', 28, 147),
  ('DEMO-0101', 31, 147),
  ('DEMO-0101', 33, 73),
  ('DEMO-0102', 19, 420),
  ('DEMO-0102', 22, 420),
  ('DEMO-0102', 35, 1),
  ('DEMO-0103', 28, 600),
  ('DEMO-0103', 31, 600),
  ('DEMO-0103', 36, 1),
  ('DEMO-0104', 19, 56),
  ('DEMO-0104', 24, 112),
  ('DEMO-0104', 26, 56),
  ('DEMO-0104', 35, 1),
  ('DEMO-0105', 22, 74),
  ('DEMO-0105', 25, 74),
  ('DEMO-0108', 19, 43),
  ('DEMO-0108', 24, 86),
  ('DEMO-0108', 26, 43),
  ('DEMO-0108', 35, 1),
  ('DEMO-0109', 22, 180),
  ('DEMO-0109', 26, 180),
  ('DEMO-0109', 34, 1),
  ('DEMO-0110', 19, 76),
  ('DEMO-0110', 24, 76),
  ('DEMO-0110', 26, 76),
  ('DEMO-0110', 35, 1),
  ('DEMO-0112', 21, 72),
  ('DEMO-0112', 25, 72),
  ('DEMO-0113', 21, 153),
  ('DEMO-0114', 30, 190),
  ('DEMO-0114', 32, 190),
  ('DEMO-0114', 36, 1),
  ('DEMO-0115', 21, 262),
  ('DEMO-0115', 25, 262),
  ('DEMO-0115', 34, 1),
  ('DEMO-0116', 21, 55),
  ('DEMO-0116', 25, 55),
  ('DEMO-0116', 34, 1),
  ('DEMO-0117', 27, 38),
  ('DEMO-0117', 31, 38),
  ('DEMO-0118', 16, 473),
  ('DEMO-0118', 21, 473),
  ('DEMO-0119', 17, 76),
  ('DEMO-0119', 21, 76),
  ('DEMO-0119', 34, 1),
  ('DEMO-0120', 22, 131),
  ('DEMO-0120', 26, 131),
  ('DEMO-0120', 34, 1),
  ('DEMO-0121', 21, 337),
  ('DEMO-0122', 21, 36),
  ('DEMO-0122', 25, 36),
  ('DEMO-0123', 28, 68),
  ('DEMO-0123', 31, 68),
  ('DEMO-0123', 33, 34),
  ('DEMO-0124', 30, 520),
  ('DEMO-0124', 32, 520),
  ('DEMO-0124', 33, 260),
  ('DEMO-0124', 36, 1),
  ('DEMO-0125', 30, 80),
  ('DEMO-0125', 32, 80),
  ('DEMO-0125', 33, 40),
  ('DEMO-0125', 36, 1),
  ('DEMO-0126', 24, 85),
  ('DEMO-0126', 26, 85),
  ('DEMO-0126', 34, 1),
  ('DEMO-0127', 22, 36),
  ('DEMO-0127', 26, 36),
  ('DEMO-0127', 34, 1),
  ('DEMO-0128', 27, 332),
  ('DEMO-0128', 31, 332),
  ('DEMO-0129', 21, 160),
  ('DEMO-0129', 25, 160),
  ('DEMO-0129', 34, 1),
  ('DEMO-0130', 21, 11),
  ('DEMO-0130', 25, 11),
  ('DEMO-0130', 34, 1),
  ('DEMO-0131', 21, 138),
  ('DEMO-0131', 25, 138),
  ('DEMO-0131', 34, 1),
  ('DEMO-0132', 21, 159),
  ('DEMO-0132', 25, 159),
  ('DEMO-0132', 34, 1),
  ('DEMO-0133', 24, 160),
  ('DEMO-0133', 26, 160),
  ('DEMO-0134', 29, 145),
  ('DEMO-0134', 31, 145),
  ('DEMO-0135', 19, 40),
  ('DEMO-0135', 31, 40),
  ('DEMO-0136', 27, 55),
  ('DEMO-0136', 31, 55),
  ('DEMO-0137', 27, 52),
  ('DEMO-0137', 31, 52),
  ('DEMO-0138', 30, 195),
  ('DEMO-0138', 32, 195),
  ('DEMO-0138', 33, 98),
  ('DEMO-0138', 36, 1),
  ('DEMO-0139', 30, 230),
  ('DEMO-0139', 32, 230),
  ('DEMO-0139', 36, 1),
  ('DEMO-0140', 28, 130),
  ('DEMO-0140', 31, 130),
  ('DEMO-0141', 19, 52),
  ('DEMO-0141', 24, 104),
  ('DEMO-0141', 26, 52),
  ('DEMO-0141', 35, 1),
  ('DEMO-0142', 21, 451),
  ('DEMO-0142', 25, 451),
  ('DEMO-0142', 34, 1),
  ('DEMO-0143', 22, 140),
  ('DEMO-0143', 26, 140),
  ('DEMO-0144', 21, 92),
  ('DEMO-0144', 25, 92),
  ('DEMO-0144', 34, 1),
  ('DEMO-0145', 16, 75),
  ('DEMO-0145', 21, 75),
  ('DEMO-0146', 21, 206),
  ('DEMO-0147', 21, 103),
  ('DEMO-0147', 25, 103),
  ('DEMO-0147', 34, 1),
  ('DEMO-0148', 22, 124),
  ('DEMO-0148', 26, 124),
  ('DEMO-0148', 34, 1),
  ('DEMO-0149', 21, 272),
  ('DEMO-0150', 28, 150),
  ('DEMO-0150', 31, 150),
  ('DEMO-0151', 21, 38),
  ('DEMO-0151', 25, 38),
  ('DEMO-0152', 27, 681),
  ('DEMO-0152', 31, 681),
  ('DEMO-0153', 24, 32),
  ('DEMO-0153', 34, 1),
  ('DEMO-0154', 30, 180),
  ('DEMO-0154', 32, 180),
  ('DEMO-0154', 33, 90),
  ('DEMO-0155', 21, 42),
  ('DEMO-0155', 25, 42),
  ('DEMO-0155', 34, 1),
  ('DEMO-0156', 21, 151),
  ('DEMO-0156', 25, 151),
  ('DEMO-0156', 34, 1),
  ('DEMO-0157', 21, 312),
  ('DEMO-0157', 25, 312),
  ('DEMO-0157', 34, 1),
  ('DEMO-0158', 21, 680),
  ('DEMO-0158', 25, 680),
  ('DEMO-0158', 34, 4),
  ('DEMO-0159', 21, 50),
  ('DEMO-0159', 25, 50),
  ('DEMO-0159', 34, 1),
  ('DEMO-0160', 21, 63),
  ('DEMO-0160', 25, 63),
  ('DEMO-0160', 34, 1),
  ('DEMO-0161', 21, 306),
  ('DEMO-0161', 25, 306),
  ('DEMO-0161', 34, 1),
  ('DEMO-0162', 28, 154),
  ('DEMO-0162', 31, 154),
  ('DEMO-0162', 33, 77),
  ('DEMO-0163', 30, 210),
  ('DEMO-0163', 32, 210),
  ('DEMO-0164', 30, 195),
  ('DEMO-0164', 31, 195),
  ('DEMO-0165', 22, 75),
  ('DEMO-0165', 26, 75),
  ('DEMO-0165', 34, 1),
  ('DEMO-0166', 19, 175),
  ('DEMO-0166', 22, 350),
  ('DEMO-0166', 26, 175),
  ('DEMO-0166', 35, 1),
  ('DEMO-0167', 21, 36),
  ('DEMO-0167', 25, 36),
  ('DEMO-0167', 34, 1),
  ('DEMO-0168', 24, 600),
  ('DEMO-0168', 26, 300),
  ('DEMO-0168', 35, 2),
  ('DEMO-0170', 24, 70),
  ('DEMO-0171', 21, 52),
  ('DEMO-0172', 28, 298),
  ('DEMO-0172', 31, 298),
  ('DEMO-0172', 33, 149),
  ('DEMO-0173', 21, 655),
  ('DEMO-0173', 25, 655),
  ('DEMO-0173', 34, 1);

insert into demo_carga_historial (
  clave, orden, estado_anterior, estado_nuevo, detalle, usuario_id, accion, creado_en
)
values
  ('DEMO-0001', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2556)),
  ('DEMO-0001', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1704)),
  ('DEMO-0001', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 852)),
  ('DEMO-0002', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2340)),
  ('DEMO-0002', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1560)),
  ('DEMO-0002', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 780)),
  ('DEMO-0003', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1680)),
  ('DEMO-0003', 2, 'Validado', 'Confirmado', 'Seña acreditada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1584)),
  ('DEMO-0003', 3, 'Confirmado', 'Pagado', 'Saldo abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1368)),
  ('DEMO-0004', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1504)),
  ('DEMO-0004', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 752)),
  ('DEMO-0005', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2416)),
  ('DEMO-0005', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1208)),
  ('DEMO-0006', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1620)),
  ('DEMO-0006', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1080)),
  ('DEMO-0006', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 540)),
  ('DEMO-0007', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2808)),
  ('DEMO-0007', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1872)),
  ('DEMO-0007', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 936)),
  ('DEMO-0008', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente habitual.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1440)),
  ('DEMO-0008', 2, 'Validado', 'Confirmado', 'Orden de compra recibida.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1320)),
  ('DEMO-0008', 3, 'Confirmado', 'Pagado', 'Saldo abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1152)),
  ('DEMO-0009', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 3618)),
  ('DEMO-0009', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2412)),
  ('DEMO-0009', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1206)),
  ('DEMO-0010', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1674)),
  ('DEMO-0010', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1116)),
  ('DEMO-0010', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 558)),
  ('DEMO-0011', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2232)),
  ('DEMO-0011', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1488)),
  ('DEMO-0011', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 744)),
  ('DEMO-0012', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1494)),
  ('DEMO-0012', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 996)),
  ('DEMO-0012', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 498)),
  ('DEMO-0013', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2554)),
  ('DEMO-0013', 2, 'Validado', 'Cancelado', 'El cliente desistió antes de abonar la seña.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 912)),
  ('DEMO-0014', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1638)),
  ('DEMO-0014', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1092)),
  ('DEMO-0014', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 546)),
  ('DEMO-0015', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2520)),
  ('DEMO-0015', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1680)),
  ('DEMO-0015', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 840)),
  ('DEMO-0016', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2790)),
  ('DEMO-0016', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1860)),
  ('DEMO-0016', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 930)),
  ('DEMO-0017', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2520)),
  ('DEMO-0017', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1680)),
  ('DEMO-0017', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 840)),
  ('DEMO-0018', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con las tres jornadas.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2280)),
  ('DEMO-0018', 2, 'Validado', 'Confirmado', 'Seña del 30% acreditada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1920)),
  ('DEMO-0018', 3, 'Confirmado', 'Pagado', 'Saldo total abonado al finalizar el congreso.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1008)),
  ('DEMO-0019', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2466)),
  ('DEMO-0019', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1644)),
  ('DEMO-0019', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 822)),
  ('DEMO-0020', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1392)),
  ('DEMO-0020', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 696)),
  ('DEMO-0021', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1050)),
  ('DEMO-0022', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1188)),
  ('DEMO-0022', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 792)),
  ('DEMO-0022', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 396)),
  ('DEMO-0023', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2700)),
  ('DEMO-0023', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1800)),
  ('DEMO-0023', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 900)),
  ('DEMO-0024', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2288)),
  ('DEMO-0024', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1144)),
  ('DEMO-0025', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1638)),
  ('DEMO-0025', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1092)),
  ('DEMO-0025', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 546)),
  ('DEMO-0026', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1458)),
  ('DEMO-0026', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 972)),
  ('DEMO-0026', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 486)),
  ('DEMO-0027', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1746)),
  ('DEMO-0027', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1164)),
  ('DEMO-0027', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 582)),
  ('DEMO-0028', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2538)),
  ('DEMO-0028', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1692)),
  ('DEMO-0028', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 846)),
  ('DEMO-0029', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2358)),
  ('DEMO-0029', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1572)),
  ('DEMO-0029', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 786)),
  ('DEMO-0030', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2466)),
  ('DEMO-0030', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1644)),
  ('DEMO-0030', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 822)),
  ('DEMO-0031', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1458)),
  ('DEMO-0031', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 972)),
  ('DEMO-0031', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 486)),
  ('DEMO-0032', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1800)),
  ('DEMO-0032', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1200)),
  ('DEMO-0032', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 600)),
  ('DEMO-0033', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 678)),
  ('DEMO-0034', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1949)),
  ('DEMO-0034', 2, 'Validado', 'Cancelado', 'El cliente desistió antes de abonar la seña.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 696)),
  ('DEMO-0035', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 24)),
  ('DEMO-0036', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2880)),
  ('DEMO-0036', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1920)),
  ('DEMO-0036', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0037', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2484)),
  ('DEMO-0037', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1656)),
  ('DEMO-0037', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 828)),
  ('DEMO-0038', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado a la secretaría académica.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1800)),
  ('DEMO-0038', 2, 'Validado', 'Confirmado', 'Expediente aprobado. Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1440)),
  ('DEMO-0038', 3, 'Confirmado', 'Pagado', 'Saldo abonado tras el evento.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 600)),
  ('DEMO-0039', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0039', 2, 'Validado', 'Confirmado', 'Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 816)),
  ('DEMO-0039', 3, 'Confirmado', 'Pagado', 'Saldo abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 624)),
  ('DEMO-0040', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0040', 2, 'Validado', 'Confirmado', 'Seña abonada.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 792)),
  ('DEMO-0040', 3, 'Confirmado', 'Pagado', 'Saldo abonado en recepción.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 624)),
  ('DEMO-0041', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 720)),
  ('DEMO-0041', 2, 'Validado', 'Cancelado', 'La reunión se realizó en las oficinas del cliente. Se cancela.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 684)),
  ('DEMO-0042', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1764)),
  ('DEMO-0042', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1176)),
  ('DEMO-0042', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 588)),
  ('DEMO-0043', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 624)),
  ('DEMO-0044', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1746)),
  ('DEMO-0044', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1164)),
  ('DEMO-0044', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 582)),
  ('DEMO-0045', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado. Se da de baja la solicitud.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 624)),
  ('DEMO-0046', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1890)),
  ('DEMO-0046', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1260)),
  ('DEMO-0046', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 630)),
  ('DEMO-0048', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado (segunda edición del ciclo).', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 624)),
  ('DEMO-0048', 2, 'Validado', 'Confirmado', 'Confirmado por el cliente.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 528)),
  ('DEMO-0048', 3, 'Confirmado', 'Pagado', 'Saldo abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 336)),
  ('DEMO-0049', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 974)),
  ('DEMO-0049', 2, 'Validado', 'Confirmado', 'Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 696)),
  ('DEMO-0049', 3, 'Confirmado', 'Cancelado', 'Cancelación solicitada por el cliente. Se acordó la devolución de la seña.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 348)),
  ('DEMO-0050', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1476)),
  ('DEMO-0050', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 984)),
  ('DEMO-0050', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 492)),
  ('DEMO-0051', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 774)),
  ('DEMO-0051', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 516)),
  ('DEMO-0051', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 258)),
  ('DEMO-0052', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se envió el presupuesto al área de compras.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1320)),
  ('DEMO-0052', 2, 'Validado', 'Confirmado', 'Orden de compra recibida. Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0052', 3, 'Confirmado', 'Pagado', 'Saldo total abonado por transferencia bancaria.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 240)),
  ('DEMO-0053', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1328)),
  ('DEMO-0053', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 664)),
  ('DEMO-0054', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 612)),
  ('DEMO-0054', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 408)),
  ('DEMO-0054', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 204)),
  ('DEMO-0055', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1620)),
  ('DEMO-0055', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1080)),
  ('DEMO-0055', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 540)),
  ('DEMO-0056', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2537)),
  ('DEMO-0056', 2, 'Validado', 'Cancelado', 'El cliente desistió antes de abonar la seña.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 906)),
  ('DEMO-0057', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2430)),
  ('DEMO-0057', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1620)),
  ('DEMO-0057', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 810)),
  ('DEMO-0058', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con dos alternativas de menú.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 528)),
  ('DEMO-0058', 2, 'Validado', 'Cancelado', 'El cliente contrató otro salón. Se libera la fecha.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 288)),
  ('DEMO-0059', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0059', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 480)),
  ('DEMO-0060', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1350)),
  ('DEMO-0060', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 900)),
  ('DEMO-0060', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 450)),
  ('DEMO-0061', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1926)),
  ('DEMO-0061', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1284)),
  ('DEMO-0061', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 642)),
  ('DEMO-0062', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1512)),
  ('DEMO-0062', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1008)),
  ('DEMO-0062', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 504)),
  ('DEMO-0063', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'La reserva se dio de baja automáticamente ya que pasaron los 7 días de vigencia del presupuesto.', null, 'UPDATE', v_ahora - make_interval(hours => 216)),
  ('DEMO-0064', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2286)),
  ('DEMO-0064', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1524)),
  ('DEMO-0064', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 762)),
  ('DEMO-0065', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1926)),
  ('DEMO-0065', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1284)),
  ('DEMO-0065', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 642)),
  ('DEMO-0066', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1332)),
  ('DEMO-0066', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 888)),
  ('DEMO-0066', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 444)),
  ('DEMO-0067', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al colegio médico.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1440)),
  ('DEMO-0067', 2, 'Validado', 'Confirmado', 'Seña acreditada. Fecha bloqueada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1008)),
  ('DEMO-0068', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado a RRHH.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 528)),
  ('DEMO-0068', 2, 'Validado', 'Confirmado', 'Orden de compra recibida.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 360)),
  ('DEMO-0068', 3, 'Confirmado', 'Pagado', 'Pago total anticipado por transferencia.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0069', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 240)),
  ('DEMO-0069', 2, 'Validado', 'Confirmado', 'Confirmado por el cliente.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 144)),
  ('DEMO-0069', 3, 'Confirmado', 'Pagado', 'Abonado en recepción.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 24)),
  ('DEMO-0070', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con maridaje.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 432)),
  ('DEMO-0070', 2, 'Validado', 'Confirmado', 'Seña abonada.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 216)),
  ('DEMO-0072', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al área comercial.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 720)),
  ('DEMO-0072', 2, 'Validado', 'Confirmado', 'Seña acreditada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 480)),
  ('DEMO-0073', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado; el cliente confirma verbalmente.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0074', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0075', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado a la cooperativa.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0077', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1836)),
  ('DEMO-0077', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1224)),
  ('DEMO-0077', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 612)),
  ('DEMO-0079', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2240)),
  ('DEMO-0079', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1120)),
  ('DEMO-0080', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 702)),
  ('DEMO-0080', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 468)),
  ('DEMO-0080', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 234)),
  ('DEMO-0081', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 874)),
  ('DEMO-0081', 2, 'Validado', 'Confirmado', 'Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 624)),
  ('DEMO-0081', 3, 'Confirmado', 'Cancelado', 'Cancelación solicitada por el cliente. Se acordó la devolución de la seña.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 312)),
  ('DEMO-0082', 1, U&'Pendiente validaci\00F3n', 'Validado', 'El cliente solo necesita la sala. Se cotiza verbalmente.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0085', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 288)),
  ('DEMO-0085', 2, 'Validado', 'Confirmado', 'Seña abonada. Confirmar si entran todos o se cambia de sala.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 120)),
  ('DEMO-0086', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 684)),
  ('DEMO-0087', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1936)),
  ('DEMO-0087', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 968)),
  ('DEMO-0088', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0088', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 480)),
  ('DEMO-0089', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con la propuesta de fiesta.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1680)),
  ('DEMO-0089', 2, 'Validado', 'Confirmado', 'Seña acreditada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1320)),
  ('DEMO-0090', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 874)),
  ('DEMO-0090', 2, 'Validado', 'Confirmado', 'Seña acreditada.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 624)),
  ('DEMO-0090', 3, 'Confirmado', 'Cancelado', 'Cancelación solicitada por el cliente. Se acordó la devolución de la seña.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 312)),
  ('DEMO-0092', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado. Revisar el armado de sala por la cantidad de asistentes.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0093', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1109)),
  ('DEMO-0093', 2, 'Validado', 'Confirmado', 'Seña acreditada.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 792)),
  ('DEMO-0093', 3, 'Confirmado', 'Cancelado', 'Cancelación solicitada por el cliente. Se acordó la devolución de la seña.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 396)),
  ('DEMO-0094', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1080)),
  ('DEMO-0094', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 720)),
  ('DEMO-0094', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 360)),
  ('DEMO-0095', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 108)),
  ('DEMO-0095', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0095', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 36)),
  ('DEMO-0096', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado (tercera edición del ciclo).', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 288)),
  ('DEMO-0096', 2, 'Validado', 'Confirmado', 'Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 168)),
  ('DEMO-0097', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 252)),
  ('DEMO-0097', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 168)),
  ('DEMO-0097', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 84)),
  ('DEMO-0098', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 704)),
  ('DEMO-0098', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 352)),
  ('DEMO-0100', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1840)),
  ('DEMO-0100', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 920)),
  ('DEMO-0101', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1008)),
  ('DEMO-0101', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 504)),
  ('DEMO-0102', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al área de eventos.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1080)),
  ('DEMO-0102', 2, 'Validado', 'Confirmado', 'Expediente aprobado. Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 672)),
  ('DEMO-0103', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado a la cámara.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1056)),
  ('DEMO-0103', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se confirma el turno noche.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 648)),
  ('DEMO-0104', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 400)),
  ('DEMO-0104', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 200)),
  ('DEMO-0106', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1120)),
  ('DEMO-0106', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 560)),
  ('DEMO-0107', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 272)),
  ('DEMO-0107', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 136)),
  ('DEMO-0109', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0110', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado (solo alquiler + coffee).', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 720)),
  ('DEMO-0110', 2, 'Validado', 'Confirmado', 'Seña acreditada. El cliente sumó almuerzo y equipamiento.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 288)),
  ('DEMO-0111', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0113', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0114', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado junto con el listado de servicios.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1152)),
  ('DEMO-0114', 2, 'Validado', 'Confirmado', 'Seña abonada en efectivo en recepción.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 720)),
  ('DEMO-0114', 3, 'Confirmado', 'Confirmado', 'El cliente avisa que está evaluando reprogramar por un tema familiar.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'NOTE', v_ahora - make_interval(hours => 288)),
  ('DEMO-0114', 4, 'Confirmado', 'Cancelado', 'Cancelación solicitada por el cliente. Se acordó la devolución parcial de la seña.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 144)),
  ('DEMO-0115', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 252)),
  ('DEMO-0116', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto aprobado por el consejo.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 720)),
  ('DEMO-0116', 2, 'Validado', 'Confirmado', 'Seña abonada. Se bloquea el horario de la mañana.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 432)),
  ('DEMO-0117', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado; el cliente pidió unos días para decidir.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 96)),
  ('DEMO-0119', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó disponibilidad y se envió el presupuesto al cliente.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 120)),
  ('DEMO-0120', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 24)),
  ('DEMO-0121', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1176)),
  ('DEMO-0121', 2, 'Validado', 'Cancelado', 'El cliente desistió antes de abonar la seña.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 420)),
  ('DEMO-0122', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al instituto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0123', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 2070)),
  ('DEMO-0123', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1380)),
  ('DEMO-0123', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 690)),
  ('DEMO-0124', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se envió el presupuesto con la propuesta de menú.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1440)),
  ('DEMO-0124', 2, 'Validado', 'Confirmado', 'El cliente abonó la seña del 30% por transferencia.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1080)),
  ('DEMO-0125', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1512)),
  ('DEMO-0125', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1008)),
  ('DEMO-0125', 3, 'Confirmado', 'Pagado', 'Saldo total abonado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 504)),
  ('DEMO-0127', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 24)),
  ('DEMO-0128', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 396)),
  ('DEMO-0129', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 12)),
  ('DEMO-0130', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 496)),
  ('DEMO-0130', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 248)),
  ('DEMO-0132', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0134', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado a la fundación.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0134', 2, 'Validado', 'Confirmado', 'Seña acreditada. Fecha bloqueada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 600)),
  ('DEMO-0136', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 840)),
  ('DEMO-0136', 2, 'Validado', 'Confirmado', 'Seña acreditada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 576)),
  ('DEMO-0137', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al círculo.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 24)),
  ('DEMO-0138', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con la propuesta completa.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1920)),
  ('DEMO-0138', 2, 'Validado', 'Confirmado', 'Seña del 30% acreditada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1488)),
  ('DEMO-0139', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado a la familia.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1800)),
  ('DEMO-0139', 2, 'Validado', 'Confirmado', 'Seña abonada en efectivo.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1392)),
  ('DEMO-0140', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado; la clienta pidió una alternativa de menú.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0141', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 880)),
  ('DEMO-0141', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 440)),
  ('DEMO-0143', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado. Falta definir el armado de sala.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0144', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 521)),
  ('DEMO-0144', 2, 'Validado', 'Confirmado', 'Seña acreditada.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 372)),
  ('DEMO-0144', 3, 'Confirmado', 'Cancelado', 'Cancelación solicitada por el cliente. Se acordó la devolución de la seña.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 186)),
  ('DEMO-0145', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 448)),
  ('DEMO-0145', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 224)),
  ('DEMO-0146', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 832)),
  ('DEMO-0146', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 416)),
  ('DEMO-0147', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 864)),
  ('DEMO-0147', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 432)),
  ('DEMO-0148', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 24)),
  ('DEMO-0149', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 102)),
  ('DEMO-0151', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado. Aguardando confirmación.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0152', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1088)),
  ('DEMO-0152', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 544)),
  ('DEMO-0153', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Segundo interesado para la misma fecha. Presupuesto enviado.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 24)),
  ('DEMO-0155', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 36)),
  ('DEMO-0156', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 816)),
  ('DEMO-0156', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 408)),
  ('DEMO-0157', 1, U&'Pendiente validaci\00F3n', 'Cancelado', 'El cliente no respondió al presupuesto enviado.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 324)),
  ('DEMO-0158', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con las cuatro jornadas.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0159', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 96)),
  ('DEMO-0159', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 48)),
  ('DEMO-0162', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1504)),
  ('DEMO-0162', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 752)),
  ('DEMO-0165', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado al cliente.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 8)),
  ('DEMO-0165', 2, 'Validado', 'Confirmado', 'Seña acreditada.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 6)),
  ('DEMO-0165', 3, 'Confirmado', 'Cancelado', 'Cancelación solicitada por el cliente. Se acordó la devolución de la seña.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 5)),
  ('DEMO-0166', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con la grilla de tres jornadas.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1680)),
  ('DEMO-0166', 2, 'Validado', 'Confirmado', 'Seña acreditada por la sociedad científica.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1248)),
  ('DEMO-0167', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 12)),
  ('DEMO-0168', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Presupuesto enviado con la grilla de dos jornadas.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 1320)),
  ('DEMO-0168', 2, 'Validado', 'Confirmado', 'Seña acreditada por la cámara.', 'f8d6647d-f94b-4a3c-9234-3a69c4ecfd71'::uuid, 'UPDATE', v_ahora - make_interval(hours => 912)),
  ('DEMO-0169', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '417f6467-5652-4c3d-9d35-5891e11f11bc'::uuid, 'UPDATE', v_ahora - make_interval(hours => 72)),
  ('DEMO-0171', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 8)),
  ('DEMO-0171', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 5)),
  ('DEMO-0172', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 960)),
  ('DEMO-0172', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', '9a7e7888-d5ae-4bea-9211-d41919498c15'::uuid, 'UPDATE', v_ahora - make_interval(hours => 480)),
  ('DEMO-0173', 1, U&'Pendiente validaci\00F3n', 'Validado', 'Se verificó la disponibilidad y se envió el presupuesto.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 368)),
  ('DEMO-0173', 2, 'Validado', 'Confirmado', 'Seña acreditada. Se bloquea la fecha en la agenda.', 'b8a99003-705f-4fd0-86e1-14e5addef649'::uuid, 'UPDATE', v_ahora - make_interval(hours => 184));

end;
$carga$;

-- Alta de las reservas en dos pasadas: primero las que no bloquean el salon
-- (Pendiente validacion / Validado / Cancelado) y despues las Confirmado y
-- Pagado. Asi quedan registradas las superposiciones que el back office debe
-- advertir, sin chocar contra el trigger de bloqueo.
do $alta$
declare
  v_fila record;
  v_id   bigint;
  v_n    integer := 0;
begin
  for v_fila in
    select * from demo_carga_reservas order by bloqueante, orden
  loop
    insert into public.reservas (
      id_salon, id_distribucion, fecha_inicio, fecha_fin, estado, monto,
      monto_inicial, cantidad_personas, cliente_nombre, cliente_email,
      cliente_telefono, creado_por, creado_en, actualizado_en,
      presupuesto_emitido_en, presupuesto_url, observaciones
    )
    values (
      v_fila.id_salon, v_fila.id_distribucion, v_fila.fecha_inicio, v_fila.fecha_fin,
      v_fila.estado, v_fila.monto, v_fila.monto_inicial, v_fila.cantidad_personas,
      v_fila.cliente_nombre, v_fila.cliente_email, v_fila.cliente_telefono,
      v_fila.creado_por, v_fila.creado_en, v_fila.actualizado_en,
      v_fila.presupuesto_emitido_en, null, v_fila.observaciones
    )
    returning id into v_id;

    update demo_carga_reservas set reserva_id = v_id where clave = v_fila.clave;
    v_n := v_n + 1;
  end loop;

  raise notice 'Reservas insertadas: %', v_n;
end;
$alta$;

insert into public.reserva_servicios (id_reserva, id_servicio, cantidad)
select r.reserva_id, s.id_servicio, s.cantidad
from demo_carga_servicios s
join demo_carga_reservas r on r.clave = s.clave;

insert into public.auditoria_reservas (
  id_reserva, estado_anterior, estado_nuevo, usuario_id, accion, detalle, creado_en
)
select r.reserva_id, h.estado_anterior, h.estado_nuevo, h.usuario_id, h.accion,
       h.detalle, h.creado_en
from demo_carga_historial h
join demo_carga_reservas r on r.clave = h.clave
order by h.clave, h.orden;

-- El trigger de notificaciones marca las altas web con la hora actual; se las
-- reubica en la fecha real del alta para que la campana quede cronologica.
update public.notificaciones n
set creado_en = r.creado_en
from demo_carga_reservas r
where n.reserva_id = r.reserva_id
  and r.creado_por is null;

drop table demo_carga_historial;
drop table demo_carga_servicios;
drop table demo_carga_reservas;

commit;

-- ============================ verificacion ==================================
select estado,
       count(*) as reservas,
       round(sum(monto), 2) as monto_salones
from public.reservas
where observaciones like '%' || '[DEMO_LOTE:operacion-2m-v2]' || '%'
group by estado
order by 2 desc;

select date_trunc('month', fecha_inicio)::date as mes,
       count(*) as reservas
from public.reservas
where observaciones like '%' || '[DEMO_LOTE:operacion-2m-v2]' || '%'
group by 1
order by 1;

select s.nombre as salon,
       count(*) as reservas,
       count(*) filter (where r.estado in ('Confirmado', 'Pagado')) as bloqueantes
from public.reservas r
join public.salones s on s.id = r.id_salon
where r.observaciones like '%' || '[DEMO_LOTE:operacion-2m-v2]' || '%'
group by s.id, s.nombre
order by 2 desc;
