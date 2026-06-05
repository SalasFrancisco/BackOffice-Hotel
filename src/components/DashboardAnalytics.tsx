import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { BarChart3, Filter, PieChart as PieChartIcon, RotateCcw, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Reserva, Salon, supabase } from '../utils/supabase/client';
import {
  getReservaEstados,
  RESERVA_ESTADO_COLORS,
  type ReservaEstado,
} from '../utils/reservaEstadoTransitions';

type DashboardAnalyticsProps = {
  salones: Salon[];
};

type AnalyticsPeriod = 'currentMonth' | 'last6Months' | 'currentYear' | 'custom';

type AnalyticsFilters = {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  salonId: string;
  estado: 'all' | ReservaEstado;
};

type AnalyticsReserva = Pick<Reserva, 'id' | 'id_salon' | 'estado' | 'fecha_inicio'>;

const BAR_COLOR = '#2563EB';
const SALON_BAR_COLOR = '#0F766E';

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPresetRange = (period: Exclude<AnalyticsPeriod, 'custom'>) => {
  const now = new Date();

  if (period === 'currentMonth') {
    return {
      from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  if (period === 'last6Months') {
    return {
      from: toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
      to: toDateInputValue(now),
    };
  }

  return {
    from: toDateInputValue(new Date(now.getFullYear(), 0, 1)),
    to: toDateInputValue(new Date(now.getFullYear(), 11, 31)),
  };
};

const createDefaultFilters = (): AnalyticsFilters => ({
  period: 'currentYear',
  ...getPresetRange('currentYear'),
  salonId: 'all',
  estado: 'all',
});

const parseInputDate = (value: string, endOfDay = false) => {
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
};

const formatShortDate = (value: string) =>
  parseInputDate(value).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const formatMonthLabel = (date: Date) => {
  const label = date.toLocaleDateString('es-AR', {
    month: 'short',
    year: '2-digit',
  });
  return label.replace('.', '');
};

const openNativeDatePicker = (event: MouseEvent<HTMLInputElement>) => {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    input.showPicker?.();
  } catch {
    input.focus();
  }
};

function ChartEmptyState() {
  return (
    <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-gray-500">
      No hay reservas para los filtros seleccionados.
    </div>
  );
}

export function DashboardAnalytics({ salones }: DashboardAnalyticsProps) {
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilters>(createDefaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilters>(createDefaultFilters);
  const [reservas, setReservas] = useState<AnalyticsReserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadAnalytics = async () => {
      try {
        setLoading(true);
        setError('');

        const fromDate = parseInputDate(appliedFilters.from);
        const toDate = parseInputDate(appliedFilters.to, true);

        let query = supabase
          .from('reservas')
          .select('id, id_salon, estado, fecha_inicio')
          .gte('fecha_inicio', fromDate.toISOString())
          .lte('fecha_inicio', toDate.toISOString())
          .order('fecha_inicio', { ascending: true });

        if (appliedFilters.salonId !== 'all') {
          query = query.eq('id_salon', Number(appliedFilters.salonId));
        }

        if (appliedFilters.estado !== 'all') {
          query = query.eq('estado', appliedFilters.estado);
        }

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;

        if (isActive) {
          setReservas((data || []) as AnalyticsReserva[]);
        }
      } catch (err: any) {
        console.error('Error loading dashboard analytics:', err);
        if (isActive) {
          setReservas([]);
          setError(err?.message || 'No se pudieron cargar los gráficos.');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadAnalytics();

    return () => {
      isActive = false;
    };
  }, [appliedFilters]);

  const salonNameById = useMemo(
    () => new Map(salones.map((salon) => [Number(salon.id), salon.nombre])),
    [salones],
  );

  const reservasPorSalon = useMemo(() => {
    const counts = new Map<number, number>();
    reservas.forEach((reserva) => {
      const salonId = Number(reserva.id_salon);
      counts.set(salonId, (counts.get(salonId) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([salonId, cantidad]) => ({
        salon: salonNameById.get(salonId) || `Salón #${salonId}`,
        cantidad,
      }))
      .sort((a, b) => b.cantidad - a.cantidad || a.salon.localeCompare(b.salon));
  }, [reservas, salonNameById]);

  const reservasPorMes = useMemo(() => {
    const fromDate = parseInputDate(appliedFilters.from);
    const toDate = parseInputDate(appliedFilters.to);
    const counts = new Map<string, number>();

    reservas.forEach((reserva) => {
      const date = new Date(reserva.fecha_inicio);
      if (!Number.isNaN(date.getTime())) {
        const key = getMonthKey(date);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });

    const result: Array<{ mes: string; cantidad: number }> = [];
    const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    const endMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);

    while (cursor <= endMonth) {
      result.push({
        mes: formatMonthLabel(cursor),
        cantidad: counts.get(getMonthKey(cursor)) || 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return result;
  }, [reservas, appliedFilters.from, appliedFilters.to]);

  const reservasPorEstado = useMemo(() => {
    const counts = new Map<ReservaEstado, number>();
    reservas.forEach((reserva) => {
      counts.set(reserva.estado, (counts.get(reserva.estado) || 0) + 1);
    });

    return getReservaEstados()
      .map((estado) => ({
        estado,
        cantidad: counts.get(estado) || 0,
        color: RESERVA_ESTADO_COLORS[estado],
      }))
      .filter((item) => item.cantidad > 0);
  }, [reservas]);

  const handlePeriodChange = (period: AnalyticsPeriod) => {
    setDraftFilters((current) => {
      if (period === 'custom') {
        return { ...current, period };
      }

      return {
        ...current,
        period,
        ...getPresetRange(period),
      };
    });
  };

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draftFilters.from || !draftFilters.to) {
      setError('Seleccione las fechas desde y hasta.');
      return;
    }

    if (parseInputDate(draftFilters.from) > parseInputDate(draftFilters.to)) {
      setError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    setError('');
    setAppliedFilters({ ...draftFilters });
  };

  const handleResetFilters = () => {
    const defaultFilters = createDefaultFilters();
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setError('');
  };

  const salonChartHeight = Math.max(260, reservasPorSalon.length * 48);
  const monthChartMinWidth = Math.max(520, reservasPorMes.length * 64);
  const periodSummary = `${formatShortDate(appliedFilters.from)} al ${formatShortDate(appliedFilters.to)}`;

  return (
    <section className="mt-8" aria-labelledby="dashboard-analytics-title">
      <div className="bo-section-header mb-4">
        <div>
          <h3 id="dashboard-analytics-title" className="text-lg font-medium text-gray-900">
            Análisis de reservas
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {reservas.length} reservas · {periodSummary}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleApplyFilters}
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="bo-dashboard-analytics-filters">
          <div>
            <label className="mb-2 block text-sm text-gray-700">Período</label>
            <select
              aria-label="Período de análisis"
              value={draftFilters.period}
              onChange={(event) => handlePeriodChange(event.target.value as AnalyticsPeriod)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="currentMonth">Mes actual</option>
              <option value="last6Months">Últimos 6 meses</option>
              <option value="currentYear">Año actual</option>
              <option value="custom">Rango personalizado</option>
            </select>
          </div>

          {draftFilters.period === 'custom' && (
            <>
              <div>
                <label className="mb-2 block text-sm text-gray-700">Desde</label>
                <input
                  aria-label="Fecha desde"
                  type="date"
                  value={draftFilters.from}
                  onClick={openNativeDatePicker}
                  onChange={(event) => {
                    setDraftFilters((current) => ({ ...current, from: event.target.value }));
                  }}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-700">Hasta</label>
                <input
                  aria-label="Fecha hasta"
                  type="date"
                  value={draftFilters.to}
                  onClick={openNativeDatePicker}
                  onChange={(event) => {
                    setDraftFilters((current) => ({ ...current, to: event.target.value }));
                  }}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-2 block text-sm text-gray-700">Salón</label>
            <select
              aria-label="Filtrar por salón"
              value={draftFilters.salonId}
              onChange={(event) => {
                setDraftFilters((current) => ({ ...current, salonId: event.target.value }));
              }}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los salones</option>
              {salones.map((salon) => (
                <option key={salon.id} value={salon.id}>
                  {salon.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-700">Estado</label>
            <select
              aria-label="Filtrar por estado"
              value={draftFilters.estado}
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  estado: event.target.value as AnalyticsFilters['estado'],
                }));
              }}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los estados</option>
              {getReservaEstados().map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            Restablecer
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            <Filter className="h-4 w-4" />
            {loading ? 'Cargando...' : 'Aplicar filtros'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bo-dashboard-analytics-grid">
        <article className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Cantidad de reservas por salón</h4>
              <p className="mt-1 text-sm text-gray-500">Distribución del período seleccionado</p>
            </div>
            <BarChart3 className="h-5 w-5 flex-shrink-0 text-teal-700" />
          </div>

          {loading ? (
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          ) : reservasPorSalon.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div style={{ height: salonChartHeight }} role="img" aria-label="Cantidad de reservas por salón">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={reservasPorSalon}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="salon"
                    width={105}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: string) =>
                      value.length > 16 ? `${value.slice(0, 15)}…` : value
                    }
                  />
                  <Tooltip
                    cursor={{ fill: '#F3F4F6' }}
                    contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
                  />
                  <Bar
                    dataKey="cantidad"
                    name="Reservas"
                    fill={SALON_BAR_COLOR}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Reservas por estado</h4>
              <p className="mt-1 text-sm text-gray-500">Composición del período seleccionado</p>
            </div>
            <PieChartIcon className="h-5 w-5 flex-shrink-0 text-violet-600" />
          </div>

          {loading ? (
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          ) : reservasPorEstado.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <>
              <div className="h-64" role="img" aria-label="Distribución de reservas por estado">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart accessibilityLayer>
                    <Pie
                      data={reservasPorEstado}
                      dataKey="cantidad"
                      nameKey="estado"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {reservasPorEstado.map((item) => (
                        <Cell key={item.estado} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {reservasPorEstado.map((item) => (
                  <div key={item.estado} className="flex min-w-0 items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-gray-600">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate">{item.estado}</span>
                    </span>
                    <span className="font-medium tabular-nums text-gray-900">{item.cantidad}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="bo-dashboard-chart-wide min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Cantidad de reservas por mes</h4>
              <p className="mt-1 text-sm text-gray-500">Evolución según la fecha de inicio</p>
            </div>
            <TrendingUp className="h-5 w-5 flex-shrink-0 text-blue-600" />
          </div>

          {loading ? (
            <div className="h-72 animate-pulse rounded-lg bg-gray-100" />
          ) : reservas.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="overflow-x-auto pb-2">
              <div style={{ minWidth: monthChartMinWidth, height: 288 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={reservasPorMes}
                    margin={{ top: 8, right: 12, bottom: 4, left: -12 }}
                    accessibilityLayer
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      cursor={{ fill: '#F3F4F6' }}
                      contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
                    />
                    <Bar
                      dataKey="cantidad"
                      name="Reservas"
                      fill={BAR_COLOR}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={38}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
