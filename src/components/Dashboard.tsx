import { useState, useEffect } from 'react';
import { supabase, Perfil, Reserva, Salon } from '../utils/supabase/client';
import { AlertCircle, ChevronLeft, ChevronRight, X, CheckCircle2, Wallet, ReceiptText, Building2, BarChart3 } from 'lucide-react';
import { ReservaModal } from './ReservaModal';
import {
  getReservaEstados,
  RESERVA_ESTADO_COLORS,
  RESERVA_ESTADOS_BLOQUEANTES,
} from '../utils/reservaEstadoTransitions';

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
  const [porcentajeOcupacionMensual, setPorcentajeOcupacionMensual] = useState(0);
  const [salonesOcupadosMensual, setSalonesOcupadosMensual] = useState(0);
  const [totalSalonesMensual, setTotalSalonesMensual] = useState(0);
  const [porcentajeFacturacionMensual, setPorcentajeFacturacionMensual] = useState(0);
  const [facturacionMensualActual, setFacturacionMensualActual] = useState(0);
  const [facturacionMensualPotencial, setFacturacionMensualPotencial] = useState(0);

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

      // KPIs mensuales (segun mes seleccionado)
      const { data: reservasMensualesData, error: reservasMensualesError } = await supabase
        .from('reservas')
        .select('id_salon, estado, monto, fecha_inicio, fecha_fin')
        .or(`and(fecha_inicio.lte.${endOfMonth},fecha_fin.gte.${startOfMonth})`);

      if (reservasMensualesError) throw reservasMensualesError;

      const reservasMensuales = reservasMensualesData || [];
      const estadosBloqueantes = new Set(RESERVA_ESTADOS_BLOQUEANTES);
      const reservasMensualesCerradas = reservasMensuales.filter(
        (reservaMensual) => estadosBloqueantes.has(reservaMensual.estado),
      );

      const totalSalonesCalc = (salonesData || []).length;
      const monthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const daysInCurrentMonth = monthEndDate.getDate();
      const buildDayKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const ocupacionPorSalon = new Map<number, Set<string>>();
      (salonesData || []).forEach((salon) => {
        ocupacionPorSalon.set(Number(salon.id), new Set<string>());
      });

      reservasMensualesCerradas.forEach((reservaMensual) => {
        const salonId = Number(reservaMensual.id_salon);
        if (!Number.isFinite(salonId) || !ocupacionPorSalon.has(salonId)) return;

        const inicioReserva = new Date(reservaMensual.fecha_inicio);
        const finReserva = new Date(reservaMensual.fecha_fin);
        if (Number.isNaN(inicioReserva.getTime()) || Number.isNaN(finReserva.getTime())) return;

        const inicioReservaDia = new Date(inicioReserva.getFullYear(), inicioReserva.getMonth(), inicioReserva.getDate());
        const finReservaDia = new Date(finReserva.getFullYear(), finReserva.getMonth(), finReserva.getDate());
        const inicioEfectivo = inicioReservaDia > monthStartDate ? inicioReservaDia : monthStartDate;
        const finEfectivo = finReservaDia < monthEndDate ? finReservaDia : monthEndDate;
        if (inicioEfectivo > finEfectivo) return;

        const diasOcupadosSalon = ocupacionPorSalon.get(salonId);
        if (!diasOcupadosSalon) return;
        const cursor = new Date(inicioEfectivo);

        while (cursor <= finEfectivo) {
          diasOcupadosSalon.add(buildDayKey(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
      });

      const salonFiltradoId = filterSalon ? Number(filterSalon) : null;
      const ocupacionFiltradaPorSalon = salonFiltradoId !== null && Number.isFinite(salonFiltradoId);
      const diasOcupadosCalc = ocupacionFiltradaPorSalon
        ? (ocupacionPorSalon.get(salonFiltradoId) || new Set<string>()).size
        : Array.from(ocupacionPorSalon.values()).reduce(
            (acc, diasOcupadosSalon) => acc + diasOcupadosSalon.size,
            0,
          );
      const baseTotalOcupacionCalc = ocupacionFiltradaPorSalon
        ? daysInCurrentMonth
        : totalSalonesCalc * daysInCurrentMonth;

      const porcentajeOcupacionCalc = baseTotalOcupacionCalc > 0
        ? (diasOcupadosCalc / baseTotalOcupacionCalc) * 100
        : 0;

      const facturacionMensualActualCalc = reservasMensualesCerradas.reduce(
        (acc, reservaMensual) => acc + Number(reservaMensual.monto || 0),
        0,
      );
      const precioDiarioTotalSalonesCalc = (salonesData || []).reduce(
        (acc, salon) => acc + Number(salon.precio_base || 0),
        0,
      );
      const facturacionMensualPotencialCalc = precioDiarioTotalSalonesCalc * daysInCurrentMonth;
      const porcentajeFacturacionMensualCalc = facturacionMensualPotencialCalc > 0
        ? (facturacionMensualActualCalc / facturacionMensualPotencialCalc) * 100
        : 0;

      // KPIs de negocio mensuales (segun mes seleccionado)
      const totalSolicitudesCalc = reservasMensuales.length;
      const totalConfirmadasCalc = reservasMensuales.filter(
        (reservaMetrica) => estadosBloqueantes.has(reservaMetrica.estado),
      ).length;
      const porcentajeConfirmacionCalc = totalSolicitudesCalc > 0
        ? (totalConfirmadasCalc / totalSolicitudesCalc) * 100
        : 0;

      const reservasConCapital = reservasMensuales.filter((reservaMetrica) =>
        estadosBloqueantes.has(reservaMetrica.estado),
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
      setPorcentajeOcupacionMensual(porcentajeOcupacionCalc);
      setSalonesOcupadosMensual(diasOcupadosCalc);
      setTotalSalonesMensual(baseTotalOcupacionCalc);
      setPorcentajeFacturacionMensual(porcentajeFacturacionMensualCalc);
      setFacturacionMensualActual(facturacionMensualActualCalc);
      setFacturacionMensualPotencial(facturacionMensualPotencialCalc);

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
  const calendarDays = getDaysInMonth();
  const agendaDays = calendarDays
    .filter((day): day is number => day !== null)
    .map((day) => ({
      day,
      reservas: getReservasForDay(day),
    }))
    .filter((item) => item.reservas.length > 0);

  const formatAgendaDate = (day: number) =>
    new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    }).format(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));

  const formatAgendaTime = (dateStr: string) =>
    new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Cordoba',
    }).format(new Date(dateStr));

  if (loading) {
    return (
      <div className="bo-page">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="bo-kpi-grid gap-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bo-page">
      <h2 className="text-gray-900 mb-6">Dashboard</h2>

      {/* KPI Cards */}
      <div className="bo-kpi-grid gap-6 mb-8">
        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Reservas Confirmadas / Solicitadas (Mes)</p>
          <p className="text-3xl text-gray-900">{totalConfirmadas} / {totalSolicitudes}</p>
          <p className="text-sm text-blue-700 mt-1">{porcentajeConfirmacion.toFixed(1)}% de conversion</p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Capital Obtenido (Mes)</p>
          <p className="text-3xl text-gray-900">{formatCurrency(capitalObtenido)}</p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ReceiptText className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Ticket Promedio (Mes)</p>
          <p className="text-3xl text-gray-900">{formatCurrency(ticketPromedioPagado)}</p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Ocupación Mensual de Salones</p>
          <p className="text-3xl text-gray-900">{porcentajeOcupacionMensual.toFixed(1)}%</p>
          <p className="text-sm text-amber-700 mt-1">
            {salonesOcupadosMensual} / {totalSalonesMensual} {filterSalon ? 'días del salón' : 'días de todos los salones'} ocupados
          </p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-cyan-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Facturacion Mensual vs Potencial</p>
          <p className="text-3xl text-gray-900">{porcentajeFacturacionMensual.toFixed(1)}%</p>
          <p className="text-sm text-cyan-700 mt-1">
            {formatCurrency(facturacionMensualActual)} / {formatCurrency(facturacionMensualPotencial)}
          </p>
        </div>
      </div>

      {/* Calendar Section */}
      <div className="bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="bo-section-header mb-6">
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
        <div className="bo-filter-bar mb-6">
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
            {getReservaEstados().map((estado) => (
              <option key={estado} value={estado}>{estado}</option>
            ))}
          </select>

          {(filterSalon || filterEstado) && (
            <button
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

        {/* Calendar Grid */}
        <div className="bo-calendar-desktop border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {dayNames.map(day => (
              <div key={day} className="p-3 text-center text-gray-700 bg-gray-50">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 relative">
            {calendarDays.map((day, idx) => {
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
                                style={{ backgroundColor: RESERVA_ESTADO_COLORS[reserva.estado], width: '0.65rem', height: '0.65rem' }}
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
              No hay reservas para los filtros seleccionados.
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
                        onClick={() => handleReservaClick(reserva)}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-gray-900">
                              #{reserva.id} - {reserva.cliente_nombre || 'Sin nombre'}
                            </p>
                            <p className="mt-1 text-xs text-gray-600">
                              {reserva.salon?.nombre || 'Sin salón'} · {formatAgendaTime(reserva.fecha_inicio)} a {formatAgendaTime(reserva.fecha_fin)}
                            </p>
                          </div>
                          <span
                            className="mt-1 flex-shrink-0 rounded-full border border-white"
                            style={{ backgroundColor: RESERVA_ESTADO_COLORS[reserva.estado], width: '0.75rem', height: '0.75rem' }}
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

        {/* Legend */}
        <div className="mt-6 flex gap-4 flex-wrap">
          {Object.entries(RESERVA_ESTADO_COLORS).map(([estado, color]) => (
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
