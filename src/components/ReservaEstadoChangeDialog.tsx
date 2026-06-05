import { Loader2 } from 'lucide-react';
import type { Reserva } from '../utils/supabase/client';
import { RESERVA_ESTADO_COLORS } from '../utils/reservaEstadoTransitions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

type ReservaEstadoChangeDialogProps = {
  open: boolean;
  reserva: Reserva | null;
  nuevoEstado: Reserva['estado'] | null;
  detalle: string;
  loading: boolean;
  onDetalleChange: (detalle: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function ReservaEstadoChangeDialog({
  open,
  reserva,
  nuevoEstado,
  detalle,
  loading,
  onDetalleChange,
  onConfirm,
  onOpenChange,
}: ReservaEstadoChangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Cambiar estado de la reserva</DialogTitle>
          <DialogDescription>
            Reserva #{reserva?.id}. La justificación es opcional y quedará guardada en el historial.
          </DialogDescription>
        </DialogHeader>

        {reserva && nuevoEstado && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <span
              className="rounded-full px-3 py-1 text-xs text-white"
              style={{ backgroundColor: RESERVA_ESTADO_COLORS[reserva.estado] }}
            >
              {reserva.estado}
            </span>
            <span className="text-sm text-gray-500" aria-hidden="true">→</span>
            <span
              className="rounded-full px-3 py-1 text-xs text-white"
              style={{ backgroundColor: RESERVA_ESTADO_COLORS[nuevoEstado] }}
            >
              {nuevoEstado}
            </span>
          </div>
        )}

        <div>
          <label htmlFor="reserva-estado-detalle" className="mb-2 block text-sm text-gray-700">
            Justificación
          </label>
          <textarea
            id="reserva-estado-detalle"
            value={detalle}
            onChange={(event) => onDetalleChange(event.target.value)}
            maxLength={1000}
            rows={5}
            disabled={loading}
            placeholder="Agregar un detalle sobre el cambio de estado..."
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-wait disabled:bg-gray-100"
          />
          <p className="mt-1 text-right text-xs text-gray-500">{detalle.length}/1000</p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !reserva || !nuevoEstado}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar cambio
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
