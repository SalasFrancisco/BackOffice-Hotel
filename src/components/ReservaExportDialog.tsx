import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { Reserva } from '../utils/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export type ReservaExportPeriod =
  | 'last30'
  | 'currentMonth'
  | 'specificMonth'
  | 'dateRange'
  | 'last12Months'
  | 'all';

export type ReservaExportFilters = {
  period: ReservaExportPeriod;
  month: string;
  dateFrom: string;
  dateTo: string;
  estado: Reserva['estado'] | '';
  origen: 'all' | 'web' | 'backoffice';
};

type ReservaExportDialogProps = {
  open: boolean;
  loading: boolean;
  error: string;
  initialEstado: Reserva['estado'] | '';
  estados: Reserva['estado'][];
  onConfirm: (filters: ReservaExportFilters) => void;
  onOpenChange: (open: boolean) => void;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentMonthValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

const openNativePicker = (input: HTMLInputElement) => {
  try {
    input.showPicker?.();
  } catch {
    // El navegador mantiene disponible la escritura manual si no soporta showPicker.
  }
};

export function ReservaExportDialog({
  open,
  loading,
  error,
  initialEstado,
  estados,
  onConfirm,
  onOpenChange,
}: ReservaExportDialogProps) {
  const [filters, setFilters] = useState<ReservaExportFilters>(() => ({
    period: 'last30',
    month: getCurrentMonthValue(),
    dateFrom: toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    dateTo: toDateInputValue(new Date()),
    estado: initialEstado,
    origen: 'all',
  }));

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    setFilters({
      period: 'last30',
      month: getCurrentMonthValue(),
      dateFrom: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      dateTo: toDateInputValue(today),
      estado: initialEstado,
      origen: 'all',
    });
  }, [open, initialEstado]);

  const rangeIsInvalid = (
    filters.period === 'dateRange'
    && (!filters.dateFrom || !filters.dateTo || filters.dateFrom > filters.dateTo)
  );
  const monthIsInvalid = filters.period === 'specificMonth' && !filters.month;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent className="bo-reserva-export-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar reservas</DialogTitle>
          <DialogDescription>
            Los períodos se aplican sobre la fecha de inicio de la reserva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 block text-sm text-gray-700">
              Período
            </p>
            <select
              id="export-period"
              value={filters.period}
              onChange={(event) => setFilters((current) => ({
                ...current,
                period: event.target.value as ReservaExportPeriod,
              }))}
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="last30">Últimos 30 días</option>
              <option value="currentMonth">Mes actual</option>
              <option value="specificMonth">Mes específico</option>
              <option value="dateRange">Rango de fechas</option>
              <option value="last12Months">Últimos 12 meses</option>
              <option value="all">Todas las reservas</option>
            </select>
          </div>

          {filters.period === 'specificMonth' && (
            <div>
              <p className="mb-2 block text-sm text-gray-700">
                Mes
              </p>
              <input
                id="export-month"
                type="month"
                value={filters.month}
                onClick={(event) => openNativePicker(event.currentTarget)}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  month: event.target.value,
                }))}
                disabled={loading}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {filters.period === 'dateRange' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 block text-sm text-gray-700">
                  Desde
                </p>
                <input
                  id="export-date-from"
                  type="date"
                  value={filters.dateFrom}
                  onClick={(event) => openNativePicker(event.currentTarget)}
                  onChange={(event) => setFilters((current) => ({
                    ...current,
                    dateFrom: event.target.value,
                  }))}
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <p className="mb-2 block text-sm text-gray-700">
                  Hasta
                </p>
                <input
                  id="export-date-to"
                  type="date"
                  value={filters.dateTo}
                  onClick={(event) => openNativePicker(event.currentTarget)}
                  onChange={(event) => setFilters((current) => ({
                    ...current,
                    dateTo: event.target.value,
                  }))}
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {rangeIsInvalid && (
                <p className="text-sm text-red-600 sm:col-span-2">
                  La fecha desde debe ser anterior o igual a la fecha hasta.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 block text-sm text-gray-700">
                Estado
              </p>
              <select
                id="export-estado"
                value={filters.estado}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  estado: event.target.value as ReservaExportFilters['estado'],
                }))}
                disabled={loading}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos los estados</option>
                {estados.map((estado) => (
                  <option key={estado} value={estado}>{estado}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-2 block text-sm text-gray-700">
                Origen
              </p>
              <select
                id="export-origin"
                value={filters.origen}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  origen: event.target.value as ReservaExportFilters['origen'],
                }))}
                disabled={loading}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                <option value="web">Formulario web</option>
                <option value="backoffice">Back office</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full rounded-lg border px-4 py-2 text-sm transition-colors bo-btn-cancel disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(filters)}
            disabled={loading || rangeIsInvalid || monthIsInvalid}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {loading ? 'Preparando archivo...' : 'Descargar CSV'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
