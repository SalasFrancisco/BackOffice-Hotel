import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Perfil, Reserva, Salon, supabase } from '../utils/supabase/client';
import { ReservaModal } from './ReservaModal';
import {
  getReservaEstados,
  RESERVA_ESTADO_CANCELADO,
  RESERVA_ESTADO_COLORS,
} from '../utils/reservaEstadoTransitions';

const getEstadoColor = (estado: Reserva['estado']) =>
  RESERVA_ESTADO_COLORS[estado] || '#B0B7C3';

// Elige texto claro u oscuro según la luminancia del color del estado, para
// que la etiqueta de la barra sea legible tanto sobre el amarillo como sobre
// los tonos oscuros.
const getReadableTextColor = (hexColor: string) => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
};

// Cantidad máxima de reservas (carriles) que se dibujan como barra en cada
// celda del día; el resto se agrupa en un contador "+N" que abre el detalle.
const MAX_VISIBLE_LANES = 4;

type ReservaCalendarProps = {
  perfil: Perfil;
  refreshKey?: number;
};

type SalonDayGroup = {
  salonId: number;
  salonName: string;
  reservas: Reserva[];
};

type SelectedSalonDay = SalonDayGroup & {
  day: number;
};

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

const formatAgendaTime = (dateStr: string) =>
  new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Cordoba',
  }).format(new Date(dateStr));

export function ReservaCalendar({ perfil, refreshKey = 0 }: ReservaCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterSalon, setFilterSalon] = useState<number | null>(null);
  const [filterEstado, setFilterEstado] = useState<string | null>(null);
  const [selectedReserva, setSelectedReserva] = useState<Reserva | null>(null);
  const [selectedSalonDay, setSelectedSalonDay] = useState<SelectedSalonDay | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: Array<number | null> = [];

    for (let i = 0; i < startingDayOfWeek; i += 1) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push(day);
    }

    return days;
  }, [currentDate]);

  const getReservasForDay = (day: number) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dayStart = new Date(year, month, day, 0, 0, 0);
    const dayEnd = new Date(year, month, day + 1, 0, 0, 0);

    return reservas.filter((reserva) => {
      const inicio = new Date(reserva.fecha_inicio);
      const fin = new Date(reserva.fecha_fin);
      return inicio < dayEnd && fin > dayStart;
    });
  };

  const getSalonGroupsForDay = (day: number): SalonDayGroup[] => {
    const dayReservas = getReservasForDay(day);
    const groups = new Map<number, SalonDayGroup>();

    dayReservas.forEach((reserva) => {
      const salonId = Number(reserva.id_salon);
      const salonName = reserva.salon?.nombre
        || salones.find((salon) => Number(salon.id) === salonId)?.nombre
        || 'Sin salon';
      const group = groups.get(salonId);

      if (group) {
        group.reservas.push(reserva);
      } else {
        groups.set(salonId, {
          salonId,
          salonName,
          reservas: [reserva],
        });
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        reservas: [...group.reservas].sort(
          (a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime(),
        ),
      }))
      .sort((a, b) => a.salonName.localeCompare(b.salonName, 'es'));
  };

  const agendaDays = useMemo(() => (
    calendarDays
      .filter((day): day is number => day !== null)
      .map((day) => ({
        day,
        salonGroups: getSalonGroupsForDay(day),
      }))
      .filter((item) => item.salonGroups.length > 0)
  ), [calendarDays, reservas, salones, currentDate]);

  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    const years: number[] = [];
    for (let year = base - 5; year <= base + 5; year += 1) {
      years.push(year);
    }
    // Aseguramos que el año navegado siempre esté disponible como opción.
    const selected = currentDate.getFullYear();
    if (!years.includes(selected)) {
      years.push(selected);
      years.sort((a, b) => a - b);
    }
    return years;
  }, [currentDate]);

  const resolveSalonName = (reserva: Reserva) =>
    reserva.salon?.nombre
    || salones.find((salon) => Number(salon.id) === Number(reserva.id_salon))?.nombre
    || 'Sin salón';

  // Semanas del mes (filas de 7 días, con relleno al inicio/fin).
  const weeks = useMemo(() => {
    const chunks: Array<Array<number | null>> = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      chunks.push(calendarDays.slice(i, i + 7));
    }
    const last = chunks[chunks.length - 1];
    if (last) {
      while (last.length < 7) last.push(null);
    }
    return chunks;
  }, [calendarDays]);

  // Posición (semana/columna) de cada día del mes para ubicar las barras.
  const dayPositions = useMemo(() => {
    const map = new Map<number, { week: number; col: number }>();
    calendarDays.forEach((day, index) => {
      if (day !== null) {
        map.set(day, { week: Math.floor(index / 7), col: index % 7 });
      }
    });
    return map;
  }, [calendarDays]);

  // Convierte cada reserva del mes en una "barra" continua con su carril
  // (lane) para que las reservas superpuestas se apilen sin pisarse.
  const monthBars = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = new Date(year, month, 1, 0, 0, 0).getTime();
    const monthEndExclusive = new Date(year, month + 1, 1, 0, 0, 0).getTime();

    const ranges = reservas
      .map((reserva) => {
        const inicio = new Date(reserva.fecha_inicio).getTime();
        const fin = new Date(reserva.fecha_fin).getTime();
        if (Number.isNaN(inicio) || Number.isNaN(fin)) return null;
        if (!(inicio < monthEndExclusive && fin > monthStart)) return null;

        const continuesLeft = inicio < monthStart;
        const continuesRight = fin > monthEndExclusive;
        const startDay = continuesLeft ? 1 : new Date(inicio).getDate();
        const endDay = fin >= monthEndExclusive
          ? daysInMonth
          : Math.max(startDay, new Date(fin - 1).getDate());

        return { reserva, startDay, endDay, continuesLeft, continuesRight };
      })
      .filter((range): range is NonNullable<typeof range> => range !== null)
      .sort(
        (a, b) =>
          a.startDay - b.startDay
          || b.endDay - a.endDay
          || Number(a.reserva.id) - Number(b.reserva.id),
      );

    const laneEnds: number[] = [];
    return ranges.map((range) => {
      let lane = laneEnds.findIndex((end) => end < range.startDay);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(range.endDay);
      } else {
        laneEnds[lane] = range.endDay;
      }
      const color = getEstadoColor(range.reserva.estado);
      return {
        ...range,
        lane,
        // Texto blanco uniforme en todas las barras (antes variaba entre blanco y
        // negro según el color): la legibilidad se asegura con un leve oscurecido
        // del fondo y una sombra de texto, definidos en CSS (.bo-cal-bar).
        color,
        textColor: '#ffffff',
        salonName: resolveSalonName(range.reserva),
      };
    });
  }, [reservas, salones, currentDate]);

  // Reservas que quedan fuera de los carriles visibles, por día, para el "+N".
  const hiddenCountByDay = useMemo(() => {
    const map = new Map<number, number>();
    monthBars.forEach((bar) => {
      if (bar.lane < MAX_VISIBLE_LANES) return;
      for (let day = bar.startDay; day <= bar.endDay; day += 1) {
        map.set(day, (map.get(day) || 0) + 1);
      }
    });
    return map;
  }, [monthBars]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      setError('');

      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const salonesQuery = supabase
        .from('salones')
        .select('*')
        .order('nombre');

      let reservasQuery = supabase
        .from('reservas')
        .select(`
          *,
          salon:salones(*)
        `)
        .lte('fecha_inicio', endOfMonth)
        .gte('fecha_fin', startOfMonth)
        .neq('estado', 'Cancelado')
        .order('fecha_inicio', { ascending: true });

      if (filterSalon) {
        reservasQuery = reservasQuery.eq('id_salon', filterSalon);
      }

      if (filterEstado) {
        reservasQuery = reservasQuery.eq('estado', filterEstado);
      }

      const [
        { data: salonesData, error: salonesError },
        { data: reservasData, error: reservasError },
      ] = await Promise.all([salonesQuery, reservasQuery]);

      if (salonesError) throw salonesError;
      if (reservasError) throw reservasError;

      setSalones(salonesData || []);
      setReservas((reservasData || []).filter((reserva) => reserva.estado !== 'Cancelado'));
    } catch (err: any) {
      console.error('Error loading calendar:', err);
      setError(err?.message || 'No se pudo cargar el calendario.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCalendarData();
  }, [currentDate, filterSalon, filterEstado, refreshKey]);

  useEffect(() => {
    if (!selectedSalonDay && !selectedReserva && selectedDay === null) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedSalonDay, selectedReserva, selectedDay]);

  const previousMonth = () => {
    setCurrentDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1));
  };

  const handleReservaClick = (reserva: Reserva) => {
    setSelectedReserva(reserva);
    setShowModal(true);
  };

  const handleSalonDayClick = (day: number, group: SalonDayGroup) => {
    setSelectedSalonDay({
      ...group,
      day,
    });
  };

  const handleDayClick = (day: number) => {
    setSelectedDay(day);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedReserva(null);
    setSelectedSalonDay(null);
    setSelectedDay(null);
    void loadCalendarData();
  };

  const handleSalonDayModalClose = () => {
    setSelectedSalonDay(null);
  };

  const handleDayModalClose = () => {
    setSelectedDay(null);
  };

  const formatAgendaDate = (day: number) =>
    new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    }).format(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));

  const formatSalonDayModalDate = (day: number) =>
    new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));

  const todayRef = new Date();
  const isCurrentMonth =
    todayRef.getFullYear() === currentDate.getFullYear() &&
    todayRef.getMonth() === currentDate.getMonth();
  const todayDayNumber = todayRef.getDate();
  const startOfToday = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate());
  const isPastDay = (day: number) =>
    new Date(currentDate.getFullYear(), currentDate.getMonth(), day) < startOfToday;

  return (
    <div className="bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="bo-section-header mb-6">
        <h3 className="text-gray-900">Calendario de Reservas</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={previousMonth} className="bo-cal-nav-btn p-2 rounded-lg" aria-label="Mes anterior">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <select
            value={currentDate.getMonth()}
            onChange={(event) =>
              setCurrentDate((date) => new Date(date.getFullYear(), Number(event.target.value), 1))
            }
            className="bo-select px-3 py-2 border border-gray-300 rounded-lg bg-white"
            aria-label="Mes"
          >
            {monthNames.map((name, index) => (
              <option key={name} value={index}>{name}</option>
            ))}
          </select>
          <select
            value={currentDate.getFullYear()}
            onChange={(event) =>
              setCurrentDate((date) => new Date(Number(event.target.value), date.getMonth(), 1))
            }
            className="bo-select px-3 py-2 border border-gray-300 rounded-lg bg-white"
            aria-label="Año"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button type="button" onClick={nextMonth} className="bo-cal-nav-btn p-2 rounded-lg" aria-label="Mes siguiente">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bo-filter-bar mb-6">
        <select
          value={filterSalon || ''}
          onChange={(event) => setFilterSalon(event.target.value ? Number(event.target.value) : null)}
          className="bo-select px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">Todos los salones</option>
          {salones.map((salon) => (
            <option key={salon.id} value={salon.id}>
              {salon.nombre}{salon.activo === false ? ' (Inactivo)' : ''}
            </option>
          ))}
        </select>

        <select
          value={filterEstado || ''}
          onChange={(event) => setFilterEstado(event.target.value || null)}
          className="bo-select px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">Todos los estados</option>
          {getReservaEstados()
            .filter((estado) => estado !== RESERVA_ESTADO_CANCELADO)
            .map((estado) => (
              <option key={estado} value={estado}>{estado}</option>
            ))}
        </select>

        {(filterSalon || filterEstado) && (
          <button
            type="button"
            onClick={() => {
              setFilterSalon(null);
              setFilterEstado(null);
            }}
            className="bo-mobile-full px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Limpiar filtros
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bo-cal">
        <div className="bo-cal-head">
          {dayNames.map((day) => (
            <div key={day} className="bo-cal-head-cell">
              {day}
            </div>
          ))}
        </div>

        {weeks.map((week, weekIndex) => {
          const weekDayNumbers = week.filter((day): day is number => day !== null);
          const firstDay = weekDayNumbers[0];
          const lastDay = weekDayNumbers[weekDayNumbers.length - 1];
          const weekBars = (firstDay === undefined || lastDay === undefined)
            ? []
            : monthBars.filter(
                (bar) =>
                  bar.lane < MAX_VISIBLE_LANES
                  && bar.startDay <= lastDay
                  && bar.endDay >= firstDay,
              );

          return (
            <div key={`week-${weekIndex}`} className="bo-cal-week">
              {week.map((day, colIndex) => {
                const hidden = day ? hiddenCountByDay.get(day) || 0 : 0;
                return (
                  <div
                    key={`${day || 'empty'}-${weekIndex}-${colIndex}`}
                    className={`bo-cal-day${day ? '' : ' bo-cal-day--empty'}${day && isPastDay(day) ? ' is-past' : ''}${day && isCurrentMonth && day === todayDayNumber ? ' is-today' : ''}`}
                  >
                    {day && <span className="bo-cal-day-num">{day}</span>}
                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDayClick(day as number)}
                        className="bo-cal-more"
                      >
                        +{hidden} más
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="bo-cal-bars">
                {weekBars.map((bar) => {
                  const segStartDay = Math.max(bar.startDay, firstDay as number);
                  const segEndDay = Math.min(bar.endDay, lastDay as number);
                  const startCol = dayPositions.get(segStartDay)?.col ?? 0;
                  const endCol = dayPositions.get(segEndDay)?.col ?? startCol;
                  const span = Math.max(1, endCol - startCol + 1);
                  const roundLeft = segStartDay === bar.startDay && !bar.continuesLeft;
                  const roundRight = segEndDay === bar.endDay && !bar.continuesRight;

                  return (
                    <button
                      key={`bar-${bar.reserva.id}-w${weekIndex}`}
                      type="button"
                      onClick={() => handleReservaClick(bar.reserva)}
                      title={`#${bar.reserva.id} · ${bar.reserva.cliente_nombre || 'Sin nombre'} · ${bar.reserva.estado}`}
                      className={`bo-cal-bar${roundLeft ? ' is-start' : ''}${roundRight ? ' is-end' : ''}`}
                      style={{
                        left: `calc(${startCol} / 7 * 100% + 4px)`,
                        width: `calc(${span} / 7 * 100% - 8px)`,
                        top: `calc(var(--bo-cal-head-h) + ${bar.lane} * var(--bo-cal-lane-h))`,
                        backgroundColor: bar.color,
                        color: bar.textColor,
                      }}
                    >
                      <span className="bo-cal-bar-label">{bar.salonName}</span>
                      {bar.reserva.cliente_nombre && (
                        <span className="bo-cal-bar-sub">· {bar.reserva.cliente_nombre}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex gap-4 flex-wrap">
        {Object.entries(RESERVA_ESTADO_COLORS)
          .filter(([estado]) => estado !== RESERVA_ESTADO_CANCELADO)
          .map(([estado, color]) => (
          <div key={estado} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
            <span className="text-sm text-gray-700">{estado}</span>
          </div>
        ))}
      </div>

      {selectedSalonDay && createPortal(
        <div
          className={`bo-calendar-reservas-overlay${showModal ? ' is-backgrounded' : ''}`}
        >
          <div className="bo-calendar-reservas-modal bo-dialog-content w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
              <div className="min-w-0">
                <h3 className="text-gray-900">{selectedSalonDay.salonName}</h3>
                <p className="mt-1 text-sm text-gray-600" style={{ textTransform: 'capitalize' }}>
                  {formatSalonDayModalDate(selectedSalonDay.day)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSalonDayModalClose}
                className="rounded-lg p-2 transition-colors hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-5">
              {selectedSalonDay.reservas.map((reserva) => (
                <button
                  key={`${selectedSalonDay.day}-modal-${reserva.id}`}
                  type="button"
                  onClick={() => handleReservaClick(reserva)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 p-4 text-left transition-colors hover:bg-gray-100"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-900">
                        #{reserva.id} - {reserva.cliente_nombre || 'Sin nombre'}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        {formatAgendaTime(reserva.fecha_inicio)} a {formatAgendaTime(reserva.fecha_fin)}
                      </p>
                    </div>
                    <span
                      className="flex-shrink-0 rounded-full px-3 py-1 text-xs text-white"
                      style={{ backgroundColor: getEstadoColor(reserva.estado) }}
                    >
                      {reserva.estado}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end border-t border-gray-200 bg-gray-50 p-5">
              <button
                type="button"
                onClick={handleSalonDayModalClose}
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition-colors hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {selectedDay !== null && createPortal(
        <div className={`bo-calendar-reservas-overlay${showModal ? ' is-backgrounded' : ''}`}>
          <div className="bo-calendar-reservas-modal bo-dialog-content w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
              <div className="min-w-0">
                <h3 className="text-gray-900">Reservas del día</h3>
                <p className="mt-1 text-sm text-gray-600" style={{ textTransform: 'capitalize' }}>
                  {formatSalonDayModalDate(selectedDay)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDayModalClose}
                className="rounded-lg p-2 transition-colors hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-5">
              {getReservasForDay(selectedDay).map((reserva) => (
                <button
                  key={`day-modal-${reserva.id}`}
                  type="button"
                  onClick={() => handleReservaClick(reserva)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 p-4 text-left transition-colors hover:bg-gray-100"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-900">
                        #{reserva.id} - {reserva.cliente_nombre || 'Sin nombre'}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        {resolveSalonName(reserva)} · {formatAgendaTime(reserva.fecha_inicio)} a {formatAgendaTime(reserva.fecha_fin)}
                      </p>
                    </div>
                    <span
                      className="flex-shrink-0 rounded-full px-3 py-1 text-xs"
                      style={{ backgroundColor: getEstadoColor(reserva.estado), color: getReadableTextColor(getEstadoColor(reserva.estado)) }}
                    >
                      {reserva.estado}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end border-t border-gray-200 bg-gray-50 p-5">
              <button
                type="button"
                onClick={handleDayModalClose}
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition-colors hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showModal && selectedReserva && (
        <ReservaModal
          reserva={selectedReserva}
          canDelete={perfil.rol === 'ADMIN'}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
