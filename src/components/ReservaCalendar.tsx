import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Perfil, Reserva, Salon, supabase } from '../utils/supabase/client';
import { ReservaModal } from './ReservaModal';

const ESTADO_COLORS = {
  Pendiente: '#F7C948',
  Confirmado: '#4C7AF2',
  Pagado: '#35B679',
};

const getEstadoColor = (estado: Reserva['estado']) =>
  ESTADO_COLORS[estado as keyof typeof ESTADO_COLORS] || '#B0B7C3';

type ReservaCalendarProps = {
  perfil: Perfil;
  refreshKey?: number;
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
    const dayEnd = new Date(year, month, day, 23, 59, 59);

    return reservas.filter((reserva) => {
      const inicio = new Date(reserva.fecha_inicio);
      const fin = new Date(reserva.fecha_fin);
      return inicio <= dayEnd && fin >= dayStart;
    });
  };

  const agendaDays = useMemo(() => (
    calendarDays
      .filter((day): day is number => day !== null)
      .map((day) => ({
        day,
        reservas: getReservasForDay(day),
      }))
      .filter((item) => item.reservas.length > 0)
  ), [calendarDays, reservas, currentDate]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      setError('');

      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const salonesQuery = supabase
        .from('salones')
        .select('*')
        .or('activo.is.null,activo.eq.true')
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

      setSalones((salonesData || []).filter((salon) => salon.activo !== false));
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

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedReserva(null);
    void loadCalendarData();
  };

  const formatAgendaDate = (day: number) =>
    new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    }).format(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));

  return (
    <div className="bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="bo-section-header mb-6">
        <h3 className="text-gray-900">Calendario de Reservas</h3>
        <div className="flex gap-2">
          <button type="button" onClick={previousMonth} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Mes anterior">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <span>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
          </div>
          <button type="button" onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Mes siguiente">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bo-filter-bar mb-6">
        <select
          value={filterSalon || ''}
          onChange={(event) => setFilterSalon(event.target.value ? Number(event.target.value) : null)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">Todos los salones</option>
          {salones.map((salon) => (
            <option key={salon.id} value={salon.id}>{salon.nombre}</option>
          ))}
        </select>

        <select
          value={filterEstado || ''}
          onChange={(event) => setFilterEstado(event.target.value || null)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Pagado">Pagado</option>
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

      <div className="bo-calendar-desktop border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {dayNames.map((day) => (
            <div key={day} className="p-3 text-center text-gray-700 bg-gray-50">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 relative">
          {calendarDays.map((day, index) => {
            const dayReservas = day ? getReservasForDay(day) : [];
            return (
              <div
                key={`${day || 'empty'}-${index}`}
                className={`min-h-[120px] p-2 border-b border-r border-gray-200 ${
                  !day ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {day && (
                  <>
                    <div className="text-sm text-gray-900 mb-2">{day}</div>
                    <div className="space-y-1">
                      {dayReservas.map((reserva) => (
                        <button
                          key={`${reserva.id}-${day}`}
                          type="button"
                          onClick={() => handleReservaClick(reserva)}
                          className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-700 font-medium truncate">
                              #{reserva.id} - {reserva.cliente_nombre || 'Sin nombre'}
                            </span>
                            <span
                              className="flex-shrink-0 rounded-full border border-white"
                              style={{ backgroundColor: getEstadoColor(reserva.estado), width: '0.65rem', height: '0.65rem' }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bo-calendar-mobile">
        {agendaDays.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-600">
            {loading ? 'Cargando reservas...' : 'No hay reservas para los filtros seleccionados.'}
          </div>
        ) : (
          <div className="bo-stack">
            {agendaDays.map(({ day, reservas: reservasDelDia }) => (
              <div key={day} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm text-gray-900" style={{ textTransform: 'capitalize' }}>
                    {formatAgendaDate(day)}
                  </h4>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                    {reservasDelDia.length} reserva(s)
                  </span>
                </div>
                <div className="space-y-2">
                  {reservasDelDia.map((reserva) => (
                    <button
                      key={`${reserva.id}-agenda-${day}`}
                      type="button"
                      onClick={() => handleReservaClick(reserva)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-gray-900">
                            #{reserva.id} - {reserva.cliente_nombre || 'Sin nombre'}
                          </p>
                          <p className="mt-1 text-xs text-gray-600">
                            {reserva.salon?.nombre || 'Sin salon'} - {formatAgendaTime(reserva.fecha_inicio)} a {formatAgendaTime(reserva.fecha_fin)}
                          </p>
                        </div>
                        <span
                          className="mt-1 flex-shrink-0 rounded-full border border-white"
                          style={{ backgroundColor: getEstadoColor(reserva.estado), width: '0.75rem', height: '0.75rem' }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-4 flex-wrap">
        {Object.entries(ESTADO_COLORS).map(([estado, color]) => (
          <div key={estado} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
            <span className="text-sm text-gray-700">{estado}</span>
          </div>
        ))}
      </div>

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
