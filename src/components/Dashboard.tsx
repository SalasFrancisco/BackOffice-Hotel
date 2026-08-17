import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Building2, CheckCircle2, ReceiptText, Wallet } from 'lucide-react';
import type { Perfil, Reserva, Salon } from '../utils/supabase/client';
import { supabase } from '../utils/supabase/client';
import { formatUSD } from '../utils/currency';
import { getReservaServicioUnitPrice } from '../utils/reservaServicios';
import { WelcomeBanner } from './WelcomeBanner';
import { ModuleInfoBanner } from './ModuleInfoBanner';
import type {
  DashboardAnalyticsReserva,
  DashboardMonthlyReserva,
} from './DashboardAnalytics';
import {
  createDefaultDashboardFilters,
  DashboardFilters,
  formatDashboardShortDate,
  getDashboardMonthlyChartRange,
  parseDashboardInputDate,
  type DashboardFilterValues,
} from './DashboardFilters';
import {
  normalizeServiceIncomeCategory,
  SERVICE_INCOME_CATEGORY,
  SERVICE_INCOME_CATEGORY_OPTIONS,
  type ServiceIncomeCategory,
} from '../utils/serviceIncomeCategories';

const DashboardAnalytics = lazy(() =>
  import('./DashboardAnalytics').then((module) => ({
    default: module.DashboardAnalytics,
  })),
);

type DashboardProps = {
  perfil: Perfil;
};

const formatCurrency = (value: number) => formatUSD(value);

const buildDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toCalendarDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const countCalendarDaysInclusive = (from: Date, to: Date) => {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.floor((toUtc - fromUtc) / (24 * 60 * 60 * 1000)) + 1);
};

const isReservaConfirmadaOPagada = (estado: Reserva['estado']) =>
  estado === 'Confirmado' || estado === 'Pagado';

export function Dashboard({ perfil: _perfil }: DashboardProps) {
  const [salones, setSalones] = useState<Salon[]>([]);
  const [reservas, setReservas] = useState<DashboardAnalyticsReserva[]>([]);
  // Conjunto propio del gráfico mensual: cubre más meses que el filtro aplicado.
  const [monthlyReservas, setMonthlyReservas] = useState<DashboardMonthlyReserva[]>([]);
  const [draftFilters, setDraftFilters] = useState<DashboardFilterValues>(
    createDefaultDashboardFilters,
  );
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilterValues>(
    createDefaultDashboardFilters,
  );
  const [loadingSalones, setLoadingSalones] = useState(true);
  const [loadingReservas, setLoadingReservas] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadSalones = async () => {
      try {
        setLoadingSalones(true);
        const { data, error: salonesError } = await supabase
          .from('salones')
          .select('*')
          .order('nombre');

        if (salonesError) throw salonesError;

        if (isActive) {
          setSalones(data || []);
        }
      } catch (err: any) {
        console.error('Error loading dashboard salons:', err);
        if (isActive) {
          setError(err?.message || 'No se pudieron cargar los salones.');
        }
      } finally {
        if (isActive) {
          setLoadingSalones(false);
        }
      }
    };

    void loadSalones();

    return () => {
      isActive = false;
    };
  }, []);

  const monthlyChartRange = useMemo(
    () => getDashboardMonthlyChartRange(appliedFilters),
    [appliedFilters],
  );

  useEffect(() => {
    let isActive = true;

    const loadReservas = async () => {
      try {
        setLoadingReservas(true);
        setError('');

        // Mismo recorte de salón y estado para las dos consultas: lo único que
        // cambia entre ellas es el rango de fechas.
        const buildQuery = (columns: string, rangeFrom: string, rangeTo: string) => {
          let query = supabase
            .from('reservas')
            .select(columns)
            .gte('fecha_inicio', parseDashboardInputDate(rangeFrom).toISOString())
            .lte('fecha_inicio', parseDashboardInputDate(rangeTo, true).toISOString())
            .order('fecha_inicio', { ascending: true });

          if (appliedFilters.salonId !== 'all') {
            query = query.eq('id_salon', Number(appliedFilters.salonId));
          }

          if (appliedFilters.estado !== 'all') {
            query = query.eq('estado', appliedFilters.estado);
          }

          return query;
        };

        // El gráfico mensual abarca una ventana más ancha que el resto del
        // dashboard, así que necesita su propio conjunto de datos. Cuando la
        // ventana coincide con la del filtro (rango personalizado) se reutiliza
        // el principal y se evita la consulta de más.
        const needsMonthlyQuery =
          monthlyChartRange.from !== appliedFilters.from ||
          monthlyChartRange.to !== appliedFilters.to;

        const [mainResult, monthlyResult] = await Promise.all([
          buildQuery(
            `
            id,
            id_salon,
            estado,
            monto,
            fecha_inicio,
            fecha_fin,
            reserva_servicios(
              cantidad,
              precio_unitario,
              servicio:servicios(
                precio,
                categoria:categorias_servicios(categoria_superior)
              )
            )
          `,
            appliedFilters.from,
            appliedFilters.to,
          ),
          needsMonthlyQuery
            ? buildQuery('id, fecha_inicio', monthlyChartRange.from, monthlyChartRange.to)
            : Promise.resolve(null),
        ]);

        if (mainResult.error) throw mainResult.error;
        if (monthlyResult?.error) throw monthlyResult.error;

        if (isActive) {
          const reservasFiltradas = (mainResult.data || []) as DashboardAnalyticsReserva[];
          setReservas(reservasFiltradas);
          setMonthlyReservas(
            monthlyResult
              ? ((monthlyResult.data || []) as DashboardMonthlyReserva[])
              : reservasFiltradas,
          );
        }
      } catch (err: any) {
        console.error('Error loading dashboard reservations:', err);
        if (isActive) {
          setReservas([]);
          setMonthlyReservas([]);
          setError(err?.message || 'No se pudieron cargar las reservas del dashboard.');
        }
      } finally {
        if (isActive) {
          setLoadingReservas(false);
        }
      }
    };

    void loadReservas();

    return () => {
      isActive = false;
    };
  }, [appliedFilters, monthlyChartRange]);

  const selectedSalones = useMemo(() => {
    if (appliedFilters.salonId === 'all') {
      return salones;
    }

    return salones.filter((salon) => Number(salon.id) === Number(appliedFilters.salonId));
  }, [salones, appliedFilters.salonId]);

  const metrics = useMemo(() => {
    const reservasConfirmadasOPagadas = reservas.filter((reserva) =>
      isReservaConfirmadaOPagada(reserva.estado),
    );
    const totalSolicitudes = reservas.length;
    const totalConfirmadasOPagadas = reservasConfirmadasOPagadas.length;
    const porcentajeConfirmacion = totalSolicitudes > 0
      ? (totalConfirmadasOPagadas / totalSolicitudes) * 100
      : 0;
    const ingresosSalones = reservasConfirmadasOPagadas.reduce(
      (acc, reserva) => acc + Number(reserva.monto || 0),
      0,
    );
    const ingresosServicios = reservasConfirmadasOPagadas.reduce(
      (totals, reserva) => {
        (reserva.reserva_servicios || []).forEach((reservaServicio) => {
          const cantidad = Number(reservaServicio.cantidad) || 0;
          const precio = getReservaServicioUnitPrice(reservaServicio);
          const ingreso = cantidad * precio;
          const category = normalizeServiceIncomeCategory(
            reservaServicio.servicio?.categoria?.categoria_superior,
          );

          totals[category] += ingreso;
        });

        return totals;
      },
      {
        [SERVICE_INCOME_CATEGORY.ALIMENTOS_BEBIDAS]: 0,
        [SERVICE_INCOME_CATEGORY.EQUIPAMIENTO_TECNICO]: 0,
        [SERVICE_INCOME_CATEGORY.DECORACION]: 0,
        [SERVICE_INCOME_CATEGORY.OTROS_SERVICIOS]: 0,
      } satisfies Record<ServiceIncomeCategory, number>,
    );
    const ingresosObtenidos = ingresosSalones
      + Object.values(ingresosServicios).reduce((acc, ingreso) => acc + ingreso, 0);
    const ticketPromedio = totalConfirmadasOPagadas > 0
      ? ingresosObtenidos / totalConfirmadasOPagadas
      : 0;
    const ticketPromedioSalones = totalConfirmadasOPagadas > 0
      ? ingresosSalones / totalConfirmadasOPagadas
      : 0;
    const ticketPromedioServicios = Object.fromEntries(
      SERVICE_INCOME_CATEGORY_OPTIONS.map((option) => [
        option.value,
        totalConfirmadasOPagadas > 0
          ? ingresosServicios[option.value] / totalConfirmadasOPagadas
          : 0,
      ]),
    ) as Record<ServiceIncomeCategory, number>;

    const rangeStart = toCalendarDay(parseDashboardInputDate(appliedFilters.from));
    const rangeEnd = toCalendarDay(parseDashboardInputDate(appliedFilters.to));
    const daysInRange = countCalendarDaysInclusive(rangeStart, rangeEnd);
    const ocupacionPorSalon = new Map<number, Set<string>>();

    selectedSalones.forEach((salon) => {
      ocupacionPorSalon.set(Number(salon.id), new Set<string>());
    });

    reservasConfirmadasOPagadas.forEach((reserva) => {
      const salonId = Number(reserva.id_salon);
      const diasOcupadosSalon = ocupacionPorSalon.get(salonId);
      if (!diasOcupadosSalon) return;

      const inicioReserva = new Date(reserva.fecha_inicio);
      const finReserva = new Date(reserva.fecha_fin);
      if (Number.isNaN(inicioReserva.getTime()) || Number.isNaN(finReserva.getTime())) return;

      const inicioReservaDia = toCalendarDay(inicioReserva);
      const finReservaDia = toCalendarDay(finReserva);
      const inicioEfectivo = inicioReservaDia > rangeStart ? inicioReservaDia : rangeStart;
      const finEfectivo = finReservaDia < rangeEnd ? finReservaDia : rangeEnd;
      if (inicioEfectivo > finEfectivo) return;

      const cursor = new Date(inicioEfectivo);
      while (cursor <= finEfectivo) {
        diasOcupadosSalon.add(buildDayKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const diasOcupados = Array.from(ocupacionPorSalon.values()).reduce(
      (acc, diasSalon) => acc + diasSalon.size,
      0,
    );
    const totalDiasDisponibles = selectedSalones.length * daysInRange;
    const porcentajeOcupacion = totalDiasDisponibles > 0
      ? (diasOcupados / totalDiasDisponibles) * 100
      : 0;
    const facturacionPotencial = selectedSalones.reduce(
      (acc, salon) => acc + Number(salon.precio_base || 0),
      0,
    ) * daysInRange;
    const porcentajeFacturacion = facturacionPotencial > 0
      ? (ingresosSalones / facturacionPotencial) * 100
      : 0;

    return {
      totalSolicitudes,
      totalConfirmadasOPagadas,
      porcentajeConfirmacion,
      ingresosObtenidos,
      ingresosSalones,
      ingresosServicios,
      ticketPromedio,
      ticketPromedioSalones,
      ticketPromedioServicios,
      diasOcupados,
      totalDiasDisponibles,
      porcentajeOcupacion,
      facturacionPotencial,
      porcentajeFacturacion,
    };
  }, [reservas, selectedSalones, appliedFilters.from, appliedFilters.to]);

  const handleApplyFilters = () => {
    if (!draftFilters.from || !draftFilters.to) {
      setFilterError('Seleccione las fechas desde y hasta.');
      return;
    }

    if (
      parseDashboardInputDate(draftFilters.from)
      > parseDashboardInputDate(draftFilters.to)
    ) {
      setFilterError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    setFilterError('');
    setAppliedFilters({ ...draftFilters });
  };

  const handleResetFilters = () => {
    const defaultFilters = createDefaultDashboardFilters();
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setFilterError('');
  };

  const loading = loadingSalones || loadingReservas;
  const periodSummary =
    `${formatDashboardShortDate(appliedFilters.from)} al ${formatDashboardShortDate(appliedFilters.to)}`;

  return (
    <div className="bo-page">
      <WelcomeBanner nombre={_perfil?.nombre} />

      <div className="mb-6">
        <ModuleInfoBanner>
          Panel de indicadores de las reservas: ingresos, ocupación por salón y distribución por
          estado. Ajuste el período y los filtros para analizar distintos rangos de tiempo.
        </ModuleInfoBanner>
      </div>

      <DashboardFilters
        filters={draftFilters}
        salones={salones}
        loading={loading}
        onChange={setDraftFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      {(error || filterError) && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{filterError || error}</p>
        </div>
      )}

      <div className="bo-kpi-grid gap-6" aria-busy={loading}>
        <div className="bo-dashboard-animated-card bo-kpi-card bo-card-compact rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="bo-dashboard-card-icon flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <CheckCircle2 className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-600">Confirmadas o pagadas / Solicitadas</p>
          <p className="text-3xl text-gray-900">
            {metrics.totalConfirmadasOPagadas} / {metrics.totalSolicitudes}
          </p>
          <p className="mt-1 text-sm text-blue-700">
            {metrics.porcentajeConfirmacion.toFixed(1)}% de conversión
          </p>
        </div>

        <div className="bo-dashboard-animated-card bo-kpi-card bo-card-compact rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="bo-dashboard-card-icon flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Wallet className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-600">Ingresos obtenidos</p>
          <p className="text-3xl text-gray-900">{formatCurrency(metrics.ingresosObtenidos)}</p>
          <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-600">Salones</dt>
              <dd className="font-medium tabular-nums text-gray-900">
                {formatCurrency(metrics.ingresosSalones)}
              </dd>
            </div>
            {SERVICE_INCOME_CATEGORY_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center justify-between gap-3">
                <dt className="text-gray-600">{option.label}</dt>
                <dd className="font-medium tabular-nums text-gray-900">
                  {formatCurrency(metrics.ingresosServicios[option.value])}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bo-dashboard-animated-card bo-kpi-card bo-card-compact rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="bo-dashboard-card-icon flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <ReceiptText className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-600">Ticket promedio</p>
          <p className="text-3xl text-gray-900">{formatCurrency(metrics.ticketPromedio)}</p>
          <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-600">Salones</dt>
              <dd className="font-medium tabular-nums text-gray-900">
                {formatCurrency(metrics.ticketPromedioSalones)}
              </dd>
            </div>
            {SERVICE_INCOME_CATEGORY_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center justify-between gap-3">
                <dt className="text-gray-600">{option.label}</dt>
                <dd className="font-medium tabular-nums text-gray-900">
                  {formatCurrency(metrics.ticketPromedioServicios[option.value])}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bo-dashboard-animated-card bo-kpi-card bo-card-compact rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="bo-dashboard-card-icon flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100">
              <Building2 className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-600">Ocupación de salones</p>
          <p className="text-3xl text-gray-900">{metrics.porcentajeOcupacion.toFixed(1)}%</p>
          <p className="mt-1 text-sm text-amber-700">
            {metrics.diasOcupados} / {metrics.totalDiasDisponibles} días disponibles ocupados
          </p>
        </div>

        <div className="bo-dashboard-animated-card bo-kpi-card bo-card-compact rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="bo-dashboard-card-icon flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-100">
              <BarChart3 className="h-6 w-6 text-cyan-600" />
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-600">Facturación vs potencial</p>
          <p className="text-3xl text-gray-900">{metrics.porcentajeFacturacion.toFixed(1)}%</p>
          <p className="mt-1 text-sm text-cyan-700">
            Salones: {formatCurrency(metrics.ingresosSalones)} / {formatCurrency(metrics.facturacionPotencial)}
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="mt-8 space-y-4">
            <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
            <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
          </div>
        }
      >
        <DashboardAnalytics
          reservas={reservas}
          monthlyReservas={monthlyReservas}
          salones={salones}
          from={appliedFilters.from}
          to={appliedFilters.to}
          monthlyFrom={monthlyChartRange.from}
          monthlyTo={monthlyChartRange.to}
          loading={loadingReservas}
        />
      </Suspense>
    </div>
  );
}
