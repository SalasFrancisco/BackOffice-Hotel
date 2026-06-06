import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Building2, CheckCircle2, ReceiptText, Wallet } from 'lucide-react';
import type { Perfil, Reserva, Salon } from '../utils/supabase/client';
import { supabase } from '../utils/supabase/client';
import type { DashboardAnalyticsReserva } from './DashboardAnalytics';
import {
  createDefaultDashboardFilters,
  DashboardFilters,
  formatDashboardShortDate,
  parseDashboardInputDate,
  type DashboardFilterValues,
} from './DashboardFilters';

const DashboardAnalytics = lazy(() =>
  import('./DashboardAnalytics').then((module) => ({
    default: module.DashboardAnalytics,
  })),
);

type DashboardProps = {
  perfil: Perfil;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value);

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
          .or('activo.is.null,activo.eq.true')
          .order('nombre');

        if (salonesError) throw salonesError;

        if (isActive) {
          setSalones((data || []).filter((salon) => salon.activo !== false));
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

  useEffect(() => {
    let isActive = true;

    const loadReservas = async () => {
      try {
        setLoadingReservas(true);
        setError('');

        const fromDate = parseDashboardInputDate(appliedFilters.from);
        const toDate = parseDashboardInputDate(appliedFilters.to, true);

        let query = supabase
          .from('reservas')
          .select('id, id_salon, estado, monto, fecha_inicio, fecha_fin')
          .gte('fecha_inicio', fromDate.toISOString())
          .lte('fecha_inicio', toDate.toISOString())
          .order('fecha_inicio', { ascending: true });

        if (appliedFilters.salonId !== 'all') {
          query = query.eq('id_salon', Number(appliedFilters.salonId));
        }

        if (appliedFilters.estado !== 'all') {
          query = query.eq('estado', appliedFilters.estado);
        }

        const { data, error: reservasError } = await query;
        if (reservasError) throw reservasError;

        if (isActive) {
          setReservas((data || []) as DashboardAnalyticsReserva[]);
        }
      } catch (err: any) {
        console.error('Error loading dashboard reservations:', err);
        if (isActive) {
          setReservas([]);
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
  }, [appliedFilters]);

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
    const capitalObtenido = reservasConfirmadasOPagadas.reduce(
      (acc, reserva) => acc + Number(reserva.monto || 0),
      0,
    );
    const ticketPromedio = totalConfirmadasOPagadas > 0
      ? capitalObtenido / totalConfirmadasOPagadas
      : 0;

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
      ? (capitalObtenido / facturacionPotencial) * 100
      : 0;

    return {
      totalSolicitudes,
      totalConfirmadasOPagadas,
      porcentajeConfirmacion,
      capitalObtenido,
      ticketPromedio,
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
          <p className="mb-1 text-sm text-gray-600">Capital obtenido</p>
          <p className="text-3xl text-gray-900">{formatCurrency(metrics.capitalObtenido)}</p>
        </div>

        <div className="bo-dashboard-animated-card bo-kpi-card bo-card-compact rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="bo-dashboard-card-icon flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <ReceiptText className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-600">Ticket promedio</p>
          <p className="text-3xl text-gray-900">{formatCurrency(metrics.ticketPromedio)}</p>
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
            {formatCurrency(metrics.capitalObtenido)} / {formatCurrency(metrics.facturacionPotencial)}
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
          salones={salones}
          from={appliedFilters.from}
          to={appliedFilters.to}
          loading={loadingReservas}
        />
      </Suspense>
    </div>
  );
}
