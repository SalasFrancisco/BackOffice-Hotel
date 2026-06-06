import { FormEvent, MouseEvent } from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import type { Salon } from '../utils/supabase/client';
import {
  getReservaEstados,
  type ReservaEstado,
} from '../utils/reservaEstadoTransitions';

export type DashboardPeriod = 'currentMonth' | 'last6Months' | 'currentYear' | 'custom';

export type DashboardFilterValues = {
  period: DashboardPeriod;
  from: string;
  to: string;
  salonId: string;
  estado: 'all' | ReservaEstado;
};

type DashboardFiltersProps = {
  filters: DashboardFilterValues;
  salones: Salon[];
  loading: boolean;
  onChange: (filters: DashboardFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
};

export const toDashboardDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDashboardPresetRange = (
  period: Exclude<DashboardPeriod, 'custom'>,
) => {
  const now = new Date();

  if (period === 'currentMonth') {
    return {
      from: toDashboardDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toDashboardDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  if (period === 'last6Months') {
    return {
      from: toDashboardDateInputValue(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
      to: toDashboardDateInputValue(now),
    };
  }

  return {
    from: toDashboardDateInputValue(new Date(now.getFullYear(), 0, 1)),
    to: toDashboardDateInputValue(new Date(now.getFullYear(), 11, 31)),
  };
};

export const createDefaultDashboardFilters = (): DashboardFilterValues => ({
  period: 'currentMonth',
  ...getDashboardPresetRange('currentMonth'),
  salonId: 'all',
  estado: 'all',
});

export const parseDashboardInputDate = (value: string, endOfDay = false) => {
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
};

export const formatDashboardShortDate = (value: string) =>
  parseDashboardInputDate(value).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const openNativeDatePicker = (event: MouseEvent<HTMLInputElement>) => {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    input.showPicker?.();
  } catch {
    input.focus();
  }
};

export function DashboardFilters({
  filters,
  salones,
  loading,
  onChange,
  onApply,
  onReset,
}: DashboardFiltersProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply();
  };

  const handlePeriodChange = (period: DashboardPeriod) => {
    if (period === 'custom') {
      onChange({ ...filters, period });
      return;
    }

    onChange({
      ...filters,
      period,
      ...getDashboardPresetRange(period),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="bo-dashboard-analytics-filters">
        <div>
          <label className="mb-2 block text-sm text-gray-700">Período</label>
          <select
            aria-label="Período del dashboard"
            value={filters.period}
            onChange={(event) => handlePeriodChange(event.target.value as DashboardPeriod)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          >
            <option value="currentMonth">Mes actual</option>
            <option value="last6Months">Últimos 6 meses</option>
            <option value="currentYear">Año actual</option>
            <option value="custom">Rango personalizado</option>
          </select>
        </div>

        {filters.period === 'custom' && (
          <>
            <div>
              <label className="mb-2 block text-sm text-gray-700">Desde</label>
              <input
                aria-label="Fecha desde"
                type="date"
                value={filters.from}
                onClick={openNativeDatePicker}
                onChange={(event) => onChange({ ...filters, from: event.target.value })}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-gray-700">Hasta</label>
              <input
                aria-label="Fecha hasta"
                type="date"
                value={filters.to}
                onClick={openNativeDatePicker}
                onChange={(event) => onChange({ ...filters, to: event.target.value })}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="mb-2 block text-sm text-gray-700">Salón</label>
          <select
            aria-label="Filtrar dashboard por salón"
            value={filters.salonId}
            onChange={(event) => onChange({ ...filters, salonId: event.target.value })}
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
            aria-label="Filtrar dashboard por estado"
            value={filters.estado}
            onChange={(event) => {
              onChange({
                ...filters,
                estado: event.target.value as DashboardFilterValues['estado'],
              });
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
          onClick={onReset}
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
  );
}
