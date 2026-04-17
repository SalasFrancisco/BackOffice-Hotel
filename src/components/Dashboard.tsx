import { useState, useEffect } from 'react';
import { supabase, Perfil, Reserva, Salon } from '../utils/supabase/client';
import { AlertCircle, ChevronLeft, ChevronRight, X, CheckCircle2, Wallet, ReceiptText } from 'lucide-react';
import { ReservaModal } from './ReservaModal';

const ESTADO_COLORS = {
  Pendiente: '#F7C948',
  Confirmado: '#4C7AF2',
  Pagado: '#35B679',
  Cancelado: '#B0B7C3',
};

type DashboardProps = {
  perfil: Perfil;
};

export function Dashboard({ perfil }: DashboardProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReserva, setSelectedReserva] = useState<Reserva | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Filters
  const [filterSalon, setFilterSalon] = useState<number | null>(null);
  const [filterEstado, setFilterEstado] = useState<string | null>(null);

  // KPIs
  const [totalSolicitudes, setTotalSolicitudes] = useState(0);
  const [totalConfirmadas, setTotalConfirmadas] = useState(0);
  const [porcentajeConfirmacion, setPorcentajeConfirmacion] = useState(0);
  const [capitalObtenido, setCapitalObtenido] = useState(0);
  const [ticketPromedioPagado, setTicketPromedioPagado] = useState(0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
    }).format(value);

  useEffect(() => {
    loadData();
  }, [currentDate, filterSalon, filterEstado]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // Load salones
      const { data: salonesData, error: salonesError } = await supabase
        .from('salones')
        .select('*')
        .order('nombre');

      if (salonesError) throw salonesError;
      setSalones(salonesData || []);

      // Load reservas for current month (for calendar)
      let query = supabase
        .from('reservas')
        .select(`
          *,
          salon:salones(*)
        `)
        .or(`and(fecha_inicio.lte.${endOfMonth},fecha_fin.gte.${startOfMonth})`)
        .order('fecha_inicio', { ascending: true });

      if (filterSalon) {
        query = query.eq('id_salon', filterSalon);
      }

      if (filterEstado) {
        query = query.eq('estado', filterEstado);
      }

      const { data: reservasData, error: reservasError } = await query;

      if (reservasError) throw reservasError;
      setReservas(reservasData || []);

      // KPIs de negocio (globales)
      const { data: reservasMetricasData, error: reservasMetricasError } = await supabase
        .from('reservas')
        .select('id, estado, monto');

      if (reservasMetricasError) throw reservasMetricasError;

      const reservasMetricas = reservasMetricasData || [];
      const totalSolicitudesCalc = reservasMetricas.length;
      const totalConfirmadasCalc = reservasMetricas.filter(
        (reservaMetrica) => reservaMetrica.estado === 'Confirmado' || reservaMetrica.estado === 'Pagado',
      ).length;
      const porcentajeConfirmacionCalc = totalSolicitudesCalc > 0
        ? (totalConfirmadasCalc / totalSolicitudesCalc) * 100
        : 0;

      const estadosConCapital = new Set(['Confirmado', 'Pagado']);
      const reservasConCapital = reservasMetricas.filter((reservaMetrica) =>
        estadosConCapital.has(reservaMetrica.estado),
      );
      const capitalObtenidoCalc = reservasConCapital.reduce(
        (acc, reservaMetrica) => acc + Number(reservaMetrica.monto || 0),
        0,
      );
      const ticketPromedioCalc = reservasConCapital.length > 0
        ? capitalObtenidoCalc / reservasConCapital.length
        : 0;

      setTotalSolicitudes(totalSolicitudesCalc);
      setTotalConfirmadas(totalConfirmadasCalc);
      setPorcentajeConfirmacion(porcentajeConfirmacionCalc);
      setCapitalObtenido(capitalObtenidoCalc);
      setTicketPromedioPagado(ticketPromedioCalc);

    } catch (err: any) {
      console.error('Error loading dashboard:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getReservasForDay = (day: number) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dayStart = new Date(year, month, day, 0, 0, 0);
    const dayEnd = new Date(year, month, day, 23, 59, 59);

    return reservas.filter(r => {
      const inicio = new Date(r.fecha_inicio);
      const fin = new Date(r.fecha_fin);
      
      // La reserva se muestra si el día está entre inicio y fin (inclusivo)
      return (inicio <= dayEnd && fin >= dayStart);
    });
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleReservaClick = (reserva: Reserva) => {
    setSelectedReserva(reserva);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedReserva(null);
    loadData();
  };

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-gray-900 mb-6">Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Reservas Confirmadas / Solicitadas</p>
          <p className="text-3xl text-gray-900">{totalConfirmadas} / {totalSolicitudes}</p>
          <p className="text-sm text-blue-700 mt-1">{porcentajeConfirmacion.toFixed(1)}% de conversion</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Capital Obtenido</p>
          <p className="text-3xl text-gray-900">{formatCurrency(capitalObtenido)}</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ReceiptText className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Ticket Promedio</p>
          <p className="text-3xl text-gray-900">{formatCurrency(ticketPromedioPagado)}</p>
        </div>
      </div>

      {/* Calendar Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-gray-900">Calendario de Reservas</h3>
          <div className="flex gap-2">
            <button onClick={previousMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <span>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <select
            value={filterSalon || ''}
            onChange={(e) => setFilterSalon(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
          >
            <option value="">Todos los salones</option>
            {salones.map(s => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>

          <select
            value={filterEstado || ''}
            onChange={(e) => setFilterEstado(e.target.value || null)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Pagado">Pagado</option>
            <option value="Cancelado">Cancelado</option>
          </select>

          {(filterSalon || filterEstado) && (
            <button
              onClick={() => {
                setFilterSalon(null);
                setFilterEstado(null);
              }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2"
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

        {/* Calendar Grid */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {dayNames.map(day => (
              <div key={day} className="p-3 text-center text-gray-700 bg-gray-50">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 relative">
            {getDaysInMonth().map((day, idx) => {
              const dayReservas = day ? getReservasForDay(day) : [];
              return (
                <div
                  key={idx}
                  className={`min-h-[120px] p-2 border-b border-r border-gray-200 ${
                    !day ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  {day && (
                    <>
                      <div className="text-sm text-gray-900 mb-2">{day}</div>
                      <div className="space-y-1">
                        {dayReservas.map(reserva => (
                          <button
                            key={`${reserva.id}-${day}`}
                            onClick={() => handleReservaClick(reserva)}
                            className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-gray-100 hover:bg-gray-200 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-700 font-medium truncate">
                                #{reserva.id} - {reserva.cliente_nombre || 'Sin nombre'}
                              </span>
                              <span
                                className="flex-shrink-0 rounded-full border border-white"
                                style={{ backgroundColor: ESTADO_COLORS[reserva.estado], width: '0.65rem', height: '0.65rem' }}
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

        {/* Legend */}
        <div className="mt-6 flex gap-4 flex-wrap">
          {Object.entries(ESTADO_COLORS).map(([estado, color]) => (
            <div key={estado} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: color }}></div>
              <span className="text-sm text-gray-700">{estado}</span>
            </div>
          ))}
        </div>
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
