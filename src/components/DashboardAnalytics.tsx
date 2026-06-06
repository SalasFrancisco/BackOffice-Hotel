import { useEffect, useMemo, useState } from 'react';
import { BarChart3, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
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
import type { Reserva, Salon } from '../utils/supabase/client';
import {
  getReservaEstados,
  RESERVA_ESTADO_COLORS,
  type ReservaEstado,
} from '../utils/reservaEstadoTransitions';
import { parseDashboardInputDate } from './DashboardFilters';

export type DashboardAnalyticsReserva = Pick<
  Reserva,
  'id' | 'id_salon' | 'estado' | 'fecha_inicio' | 'fecha_fin' | 'monto'
>;

type DashboardAnalyticsProps = {
  reservas: DashboardAnalyticsReserva[];
  salones: Salon[];
  from: string;
  to: string;
  loading: boolean;
};

const BAR_COLOR = '#2563EB';
const BAR_ACTIVE_COLOR = '#60A5FA';
const SALON_BAR_COLOR = '#0F766E';
const SALON_BAR_ACTIVE_COLOR = '#14B8A6';

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
};

const isReservaConfirmadaOPagada = (estado: ReservaEstado) =>
  estado === 'Confirmado' || estado === 'Pagado';

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const formatMonthLabel = (date: Date) => {
  const label = date.toLocaleDateString('es-AR', {
    month: 'short',
    year: '2-digit',
  });
  return label.replace('.', '');
};

function ChartEmptyState({ message }: { message?: string }) {
  return (
    <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-gray-500">
      {message || 'No hay reservas para los filtros seleccionados.'}
    </div>
  );
}

export function DashboardAnalytics({
  reservas,
  salones,
  from,
  to,
  loading,
}: DashboardAnalyticsProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const salonNameById = useMemo(
    () => new Map(salones.map((salon) => [Number(salon.id), salon.nombre])),
    [salones],
  );

  const reservasPorSalon = useMemo(() => {
    const counts = new Map<number, number>();

    reservas
      .filter((reserva) => isReservaConfirmadaOPagada(reserva.estado))
      .forEach((reserva) => {
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
    const fromDate = parseDashboardInputDate(from);
    const toDate = parseDashboardInputDate(to);
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
  }, [reservas, from, to]);

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

  const salonChartHeight = Math.max(260, reservasPorSalon.length * 48);
  const monthChartMinWidth = Math.max(520, reservasPorMes.length * 64);

  return (
    <section className="mt-8" aria-labelledby="dashboard-analytics-title">
      <div className="bo-section-header mb-4">
        <div>
          <h3 id="dashboard-analytics-title" className="text-lg font-medium text-gray-900">
            Análisis de reservas
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Visualización de las {reservas.length} reservas del período filtrado
          </p>
        </div>
      </div>

      <div className="bo-dashboard-analytics-grid">
        <article className="bo-dashboard-animated-card min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Cantidad de reservas por salón</h4>
              <p className="mt-1 text-sm text-gray-500">Solo reservas confirmadas o pagadas</p>
            </div>
            <BarChart3 className="bo-dashboard-card-icon h-5 w-5 flex-shrink-0 text-teal-700" />
          </div>

          {loading ? (
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          ) : reservasPorSalon.length === 0 ? (
            <ChartEmptyState message="No hay reservas confirmadas o pagadas para los filtros seleccionados." />
          ) : (
            <div
              className="bo-animated-chart bo-bar-chart"
              style={{ height: salonChartHeight }}
              role="img"
              aria-label="Cantidad de reservas confirmadas o pagadas por salón"
            >
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
                    animationDuration={180}
                  />
                  <Bar
                    dataKey="cantidad"
                    name="Confirmadas o pagadas"
                    fill={SALON_BAR_COLOR}
                    activeBar={{
                      fill: SALON_BAR_ACTIVE_COLOR,
                      stroke: SALON_BAR_COLOR,
                      strokeWidth: 1,
                    }}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                    isAnimationActive={!prefersReducedMotion}
                    animationBegin={100}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="bo-dashboard-animated-card min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Reservas por estado</h4>
              <p className="mt-1 text-sm text-gray-500">Composición del período seleccionado</p>
            </div>
            <PieChartIcon className="bo-dashboard-card-icon h-5 w-5 flex-shrink-0 text-violet-600" />
          </div>

          {loading ? (
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          ) : reservasPorEstado.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <>
              <div className="bo-animated-chart bo-pie-chart h-64" role="img" aria-label="Distribución de reservas por estado">
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
                      isAnimationActive={!prefersReducedMotion}
                      animationBegin={160}
                      animationDuration={900}
                      animationEasing="ease-out"
                    >
                      {reservasPorEstado.map((item) => (
                        <Cell key={item.estado} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, borderColor: '#E5E7EB' }}
                      animationDuration={180}
                    />
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

        <article className="bo-dashboard-animated-card bo-dashboard-chart-wide min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Cantidad de reservas por mes</h4>
              <p className="mt-1 text-sm text-gray-500">Evolución según la fecha de inicio</p>
            </div>
            <TrendingUp className="bo-dashboard-card-icon h-5 w-5 flex-shrink-0 text-blue-600" />
          </div>

          {loading ? (
            <div className="h-72 animate-pulse rounded-lg bg-gray-100" />
          ) : reservas.length === 0 ? (
            <ChartEmptyState />
          ) : (
            <div className="overflow-x-auto pb-2">
              <div
                className="bo-animated-chart bo-bar-chart"
                style={{ minWidth: monthChartMinWidth, height: 288 }}
              >
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
                      animationDuration={180}
                    />
                    <Bar
                      dataKey="cantidad"
                      name="Reservas"
                      fill={BAR_COLOR}
                      activeBar={{
                        fill: BAR_ACTIVE_COLOR,
                        stroke: BAR_COLOR,
                        strokeWidth: 1,
                      }}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={38}
                      isAnimationActive={!prefersReducedMotion}
                      animationBegin={220}
                      animationDuration={950}
                      animationEasing="ease-out"
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
