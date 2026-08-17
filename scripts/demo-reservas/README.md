# Reservas de demostración para el back office

Carga un escenario completo de operación del Centro de Convenciones para poder
recorrer el back office como si el sistema ya estuviera en producción: los cinco
estados de reserva, superposiciones que disparan la advertencia de la lista,
presupuestos por vencer, reservas que exceden la capacidad, días con varios
salones ocupados, eventos de varios días, altas web vs. altas de back office e
historiales de cambio de estado.

| Archivo | Para qué sirve |
| --- | --- |
| [`11-cargar-demo-operacion.sql`](11-cargar-demo-operacion.sql) | Carga el lote `operacion-2m-v2`. |
| [`12-eliminar-demo-operacion.sql`](12-eliminar-demo-operacion.sql) | Lo revierte por completo. |

Los scripts `01`–`03` son un lote anterior, más simple y sin superposiciones; son
independientes de estos.

## Cómo se ejecuta

Pegar el archivo en el **SQL editor** de Supabase, o bien:

```bash
supabase db query --linked -f scripts/demo-reservas/11-cargar-demo-operacion.sql
```

El script corre dentro de una transacción y se niega a ejecutarse dos veces: si
el lote ya está cargado, aborta y pide correr primero el de borrado.

## Qué carga

- **173 reservas** entre **62 días antes** y **61 días después** del día en que
  se ejecuta (≈ 2 meses hacia atrás y 2 hacia adelante). Todas las fechas son
  relativas a `current_date` / `now()`, así que el lote queda bien ubicado sin
  importar cuándo se corra.
- **406 servicios contratados** y **326 movimientos de historial** de
  cambio de estado, con el usuario real del back office que los hizo.
- Reparto por estado: 56 Pagado, 44 Confirmado, 28 Validado, 23 Pendiente validación, 22 Cancelado.
- **56 altas de origen WEB** (`creado_por` en NULL → la lista las muestra como
  "Formulario WEB" y disparan el trigger de notificaciones) y **117 altas de back
  office**, repartidas entre los usuarios existentes. Las de back office alimentan
  además la tabla de clientes recurrentes.

### Lo que el script NO hace

- **No envía emails ni genera PDFs.** `presupuesto_url` queda en `NULL` a propósito,
  porque no hay archivos reales en Storage: el botón "ver presupuesto" no aparece
  en estas reservas. Lo que sí se completa es `presupuesto_emitido_en`, que es el
  campo que gobierna la vigencia de 7 días y la auto-cancelación.
- **No usa direcciones de correo reales.** Todas terminan en el TLD reservado
  `.test`, que no resuelve: aunque alguien use "enviar presupuesto por email", no
  le llega a ninguna persona.

## Advertencias que quedan visibles en la lista de reservas

| Advertencia | Reservas |
| --- | --- |
| Superposición de fechas en el mismo salón | 12 |
| Cantidad de personas por encima de la capacidad | 3 |
| Vigencia del presupuesto por vencer (≤ 3 días) | 5 |
| Fecha de inicio inminente (≤ 3 días) | 7 |

Los números de arriba son los del momento de la carga. **A los pocos minutos bajan
solos**, porque las dos rutinas de auto-cancelación del sistema empiezan a actuar
sobre el lote. Eso no es un defecto de los datos: es la demostración de que las
reglas funcionan.

| Rutina | Qué cancela | Casos del lote que se lleva |
| --- | --- | --- |
| `cancelar_reservas_presupuesto_vencido` (pg_cron, cada hora) | Pendiente / Validado con más de 7 días desde `presupuesto_emitido_en` | `A4` |
| `process-reserva-vencimiento` (Edge Function) | Pendiente / Validado cuya fecha de inicio ya se alcanzó | `C7` y alguna del relleno con fecha pasada |

Por eso `A4` está puesto con la vigencia ya vencida: al abrir la lista enseguida
después de la carga se lee el mensaje *"el presupuesto ya superó los 7 días y se
cancelará automáticamente"*, y en la pasada siguiente la reserva aparece como
**Cancelado**. El caso `A12` deja el estado final permanente de esa misma regla,
con el texto del sistema en el historial.

## Cómo encontrar cada caso

Cada reserva lleva en `observaciones` una línea con el marcador del lote, el caso
que demuestra y una referencia `DEMO-XXXX`. Para ubicar una en particular:

```sql
select id, cliente_nombre, estado, fecha_inicio, observaciones
from public.reservas
where observaciones like '%Ref: DEMO-0099%';
```

Las 115 reservas restantes son "operación habitual": relleno realista para que
el dashboard, el calendario y los filtros tengan volumen suficiente.

### Casos guiados

| Ref | Caso | Estado | Salón / distribución | Fecha | Origen |
| --- | --- | --- | --- | --- | --- |
| `DEMO-0154` | A1 · Pendiente validación recién ingresada por la web (sin presupuesto) | Pendiente validación | Champaqui / Banquete | +47 d | WEB |
| `DEMO-0058` | A10 · Cancelado desde Validado (el cliente eligió otro proveedor) | Cancelado | Uritorco / Banquete | -8 d | back office |
| `DEMO-0114` | A11 · Cancelado desde Confirmado, con nota previa en el historial | Cancelado | Leopoldo Lugones / Banquete | +26 d a +27 d | back office |
| `DEMO-0063` | A12 · Cancelado AUTOMÁTICAMENTE por vencimiento de la vigencia del presupuesto | Cancelado | Suquia / Escuela | -3 d | WEB |
| `DEMO-0126` | A2 · Pendiente validación con presupuesto enviado y 3 días de vigencia restantes | Pendiente validación | Las Sierras / Escuela | +34 d | WEB |
| `DEMO-0112` | A3 · Pendiente validación en el ÚLTIMO día de vigencia del presupuesto | Pendiente validación | Suquia / Auditorio | +26 d | WEB |
| `DEMO-0099` | A4 · Pendiente validación con la vigencia YA VENCIDA (el cron la cancelará) | Pendiente validación | San Javier / Auditorio | +19 d | WEB |
| `DEMO-0119` | A5 · Validado con 2 días de vigencia restantes | Validado | Uritorco / Auditorio | +30 d | back office |
| `DEMO-0150` | A6 · Validado sin presupuesto emitido (no corre la vigencia de 7 días) | Validado | Yacanto / sin distribución | +46 d | back office |
| `DEMO-0124` | A7 · Confirmado con seña registrada | Confirmado | Leopoldo Lugones / Cocktail | +33 d a +34 d | back office |
| `DEMO-0052` | A8 · Pagado (estado final) con historial completo | Pagado | Champaqui / Auditorio | -12 d | back office |
| `DEMO-0045` | A9 · Cancelado desde Pendiente validación (no llegó respuesta del cliente) | Cancelado | Las Sierras / Auditorio | -22 d | WEB |
| `DEMO-0163` | B1 · Dos solicitudes web Pendiente validación compiten por la misma fecha y salón | Pendiente validación | Champaqui / Banquete | +54 d | WEB |
| `DEMO-0164` | B1 · Segunda solicitud web para la misma fecha y salón (se advierte superposición) | Pendiente validación | Champaqui / Banquete | +54 d a +55 d | WEB |
| `DEMO-0134` | B2 · Reserva Confirmada que ocupa el salón (base del conflicto) | Confirmado | Las Sierras / Banquete | +39 d | back office |
| `DEMO-0133` | B2 · Solicitud web Pendiente sobre un salón YA confirmado (llega igual y se advierte) | Pendiente validación | Las Sierras / Auditorio | +39 d | WEB |
| `DEMO-0151` | B3 · Dos presupuestos Validados vivos para el mismo salón y día (1 de 2) | Validado | Uritorco / Escuela | +47 d | back office |
| `DEMO-0153` | B3 · Dos presupuestos Validados vivos para el mismo salón y día (2 de 2) | Validado | Uritorco / Formato U | +47 d | back office |
| `DEMO-0116` | B4 · Reserva Confirmada del mismo día que deja al Validado en conflicto | Confirmado | San Javier / Auditorio | +29 d | back office |
| `DEMO-0117` | B4 · Validado que quedó rezagado frente a una reserva Confirmada del mismo día | Validado | San Javier / Banquete | +29 d | back office |
| `DEMO-0102` | B5 · Doble turno confirmado en el mismo salón: turno mañana | Confirmado | Leopoldo Lugones / Escuela | +20 d | back office |
| `DEMO-0103` | B5 · Doble turno confirmado en el mismo salón: turno noche (se advierte superposición de fecha) | Confirmado | Leopoldo Lugones / Cocktail | +20 d | back office |
| `DEMO-0166` | B6 · Congreso de 3 días Confirmado (base del conflicto multi-día) | Confirmado | Champaqui / Escuela | +57 d a +59 d | back office |
| `DEMO-0170` | B6 · Solicitud web en el día 2 de un congreso ya confirmado (se advierte superposición) | Pendiente validación | Champaqui / Formato U | +58 d | WEB |
| `DEMO-0073` | C5 · Validado cuyo evento es MAÑANA (último día antes del inicio) | Validado | Sala A / sin distribución | +1 d | back office |
| `DEMO-0071` | C6 · Pendiente validación cuyo evento es HOY (la fecha ya fue alcanzada) | Pendiente validación | Sala B / sin distribución | hoy | WEB |
| `DEMO-0047` | C7 · Pendiente validación del pasado que nunca se gestionó (backlog vencido) | Pendiente validación | Sala A / sin distribución | -18 d | WEB |
| `DEMO-0075` | C8 · Validado con el evento dentro de 3 días | Validado | San Javier / Escuela | +3 d | back office |
| `DEMO-0092` | D1 · Supera la capacidad de la DISTRIBUCIÓN pero no la del salón | Validado | Uritorco / Escuela | +15 d | back office |
| `DEMO-0085` | D2 · Supera la capacidad del SALÓN (sala chica sobrevendida) | Confirmado | Sala B / sin distribución | +11 d | back office |
| `DEMO-0105` | D3 · Supera la capacidad del salón Y la de la distribución | Pendiente validación | San Javier / Escuela | +22 d | WEB |
| `DEMO-0070` | E1 · Día de hoy con 5 salones en uso: almuerzo de trabajo | Confirmado | Las Sierras / Banquete | hoy | back office |
| `DEMO-0068` | E1 · Día de hoy con 5 salones en uso: capacitación | Pagado | Uritorco / Auditorio | hoy | back office |
| `DEMO-0072` | E1 · Día de hoy con 5 salones en uso: cena de camaradería | Confirmado | Yacanto / sin distribución | hoy | back office |
| `DEMO-0067` | E1 · Día de hoy con 5 salones en uso: congreso en el salón principal | Confirmado | Leopoldo Lugones / Auditorio | hoy | back office |
| `DEMO-0069` | E1 · Día de hoy con 5 salones en uso: reunión de directorio | Pagado | Sala A / sin distribución | hoy | back office |
| `DEMO-0137` | E2 · Sábado pico (+40 d): agasajo institucional | Validado | Suquia / Banquete | +40 d | back office |
| `DEMO-0136` | E2 · Sábado pico (+40 d): almuerzo empresarial | Confirmado | Uritorco / Banquete | +40 d | back office |
| `DEMO-0135` | E2 · Sábado pico (+40 d): brunch de egresados | Pendiente validación | San Javier / Banquete | +40 d | WEB |
| `DEMO-0138` | E2 · Sábado pico (+40 d): casamiento en el salón principal | Confirmado | Leopoldo Lugones / Banquete | +40 d a +41 d | back office |
| `DEMO-0140` | E2 · Sábado pico (+40 d): cumpleaños de 50 | Validado | Las Sierras / Banquete | +40 d a +41 d | back office |
| `DEMO-0139` | E2 · Sábado pico (+40 d): fiesta de 15 | Confirmado | Champaqui / Banquete | +40 d a +41 d | back office |
| `DEMO-0040` | E3 · Día pico pasado (-27 d): almuerzo de cierre | Pagado | Uritorco / Banquete | -27 d | back office |
| `DEMO-0038` | E3 · Día pico pasado (-27 d): jornada institucional | Pagado | Leopoldo Lugones / Escuela | -27 d | back office |
| `DEMO-0041` | E3 · Día pico pasado (-27 d): reunión de trabajo | Cancelado | Sala A / sin distribución | -27 d | back office |
| `DEMO-0039` | E3 · Día pico pasado (-27 d): taller simultáneo | Pagado | Las Sierras / Escuela | -27 d | back office |
| `DEMO-0018` | F1 · Congreso de 3 días completo, ya Pagado (evento pasado) | Pagado | Leopoldo Lugones / Auditorio | -45 d a -43 d | back office |
| `DEMO-0168` | F2 · Convención de 2 días que arranca a la tarde (tarifa de día parcial) | Confirmado | Leopoldo Lugones / Escuela | +58 d a +59 d | back office |
| `DEMO-0158` | F3 · Evento de 4 días en estado Validado (aún sin seña) | Validado | Las Sierras / Auditorio | +51 d a +54 d | back office |
| `DEMO-0008` | G1 · Cliente recurrente del back office (1 de 3 reservas del mismo ciclo) | Pagado | Uritorco / Auditorio | -52 d | back office |
| `DEMO-0048` | G1 · Cliente recurrente del back office (2 de 3 reservas del mismo ciclo) | Pagado | Uritorco / Auditorio | -16 d | back office |
| `DEMO-0096` | G1 · Cliente recurrente del back office (3 de 3 reservas del mismo ciclo) | Confirmado | Uritorco / Auditorio | +18 d | back office |
| `DEMO-0110` | H1 · El monto actual cambió respecto del presupuesto original (se agregaron servicios después) | Confirmado | Suquia / Auditorio | +25 d | back office |
| `DEMO-0122` | H2 · Presupuesto emitido y monto sin cambios desde entonces | Validado | Suquia / Escuela | +32 d | back office |
| `DEMO-0082` | H3 · Reserva sin presupuesto emitido (solo alquiler de salón, sin servicios) | Validado | Sala B / sin distribución | +8 d | back office |
| `DEMO-0003` | I1 · Reserva histórica en un salón que luego se dio de baja | Pagado | Prueba 1 (inactivo) / sin distribución | -58 d | back office |
| `DEMO-0143` | I4 · Reserva sin distribución asignada (el cliente define el armado más adelante) | Validado | Yacanto / sin distribución | +43 d | back office |
| `DEMO-0089` | I5 · Evento que cruza la medianoche (termina de madrugada) | Confirmado | Champaqui / Banquete | +12 d a +13 d | back office |

## Reversión

```bash
supabase db query --linked -f scripts/demo-reservas/12-eliminar-demo-operacion.sql
```

Borra las reservas del lote, sus servicios, su historial, sus notificaciones (y
las marcas de leído/oculto asociadas) y los clientes recurrentes que se hayan
generado a partir del lote. No toca nada que no pertenezca al lote.
