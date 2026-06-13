-- Previsualiza el catalogo y verifica si el lote demo ya existe.
-- No modifica datos.

set timezone = 'America/Argentina/Buenos_Aires';

select
  count(*) filter (where coalesce(activo, true)) as salones_activos,
  count(*) as salones_totales
from public.salones;

select
  count(*) filter (where coalesce(activo, true)) as servicios_activos,
  count(*) as servicios_totales
from public.servicios;

select
  count(*) as distribuciones_totales
from public.distribuciones;

select
  count(*) as reservas_existentes_del_lote
from public.reservas
where observaciones like '%[DEMO_LOTE:operacion-hotel-v1]%';

select
  min(fecha_inicio) as primera_reserva_real,
  max(fecha_fin) as ultima_reserva_real,
  count(*) as reservas_actuales
from public.reservas
where observaciones is null
   or observaciones not like '%[DEMO_LOTE:operacion-hotel-v1]%';
