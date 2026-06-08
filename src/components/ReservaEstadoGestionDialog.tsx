import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, History, Loader2, MessageSquareText } from 'lucide-react';
import { Reserva, supabase } from '../utils/supabase/client';
import {
  getAllowedReservaEstadoTransitions,
  RESERVA_ESTADO_COLORS,
  type ReservaEstado,
} from '../utils/reservaEstadoTransitions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

type ReservaEstadoHistorialItem = {
  id: number;
  estado_anterior: ReservaEstado;
  estado_nuevo: ReservaEstado;
  detalle: string | null;
  usuario_id: string | null;
  usuario_nombre: string;
  creado_en: string;
};

type ReservaEstadoGestionDialogProps = {
  open: boolean;
  reserva: Reserva | null;
  estadoSeleccionado: Reserva['estado'] | null;
  detalle: string;
  feedback: {
    type: 'success' | 'error';
    text: string;
  } | null;
  loading: boolean;
  historyRefreshKey: number;
  onEstadoChange: (estado: Reserva['estado']) => void;
  onDetalleChange: (detalle: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

const formatHistoryDate = (value: string) =>
  new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Cordoba',
  });

export function ReservaEstadoGestionDialog({
  open,
  reserva,
  estadoSeleccionado,
  detalle,
  feedback,
  loading,
  historyRefreshKey,
  onEstadoChange,
  onDetalleChange,
  onConfirm,
  onOpenChange,
}: ReservaEstadoGestionDialogProps) {
  const [items, setItems] = useState<ReservaEstadoHistorialItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    if (!open || !reserva) {
      setItems([]);
      setHistoryError('');
      return;
    }

    let isActive = true;

    const loadHistory = async () => {
      try {
        setLoadingHistory(true);
        setHistoryError('');

        const { data, error } = await supabase.rpc(
          'obtener_historial_estado_reserva',
          { p_reserva_id: reserva.id },
        );

        if (error) throw error;
        if (isActive) {
          setItems((data || []) as ReservaEstadoHistorialItem[]);
        }
      } catch (error: any) {
        console.error('Error loading reserva state history:', error);
        if (isActive) {
          setHistoryError(error?.message || 'No se pudo cargar el historial de estados.');
        }
      } finally {
        if (isActive) {
          setLoadingHistory(false);
        }
      }
    };

    void loadHistory();

    return () => {
      isActive = false;
    };
  }, [open, reserva?.id, historyRefreshKey]);

  const estadosDisponibles = reserva
    ? getAllowedReservaEstadoTransitions(reserva.estado)
    : [];
  const hayCambioEstado = Boolean(
    reserva && estadoSeleccionado && estadoSeleccionado !== reserva.estado,
  );
  const canConfirm = Boolean(
    reserva
    && estadoSeleccionado
    && (hayCambioEstado || detalle.trim()),
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent className="bo-reserva-state-dialog max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Estado e historial</DialogTitle>
          <DialogDescription>
            Reserva #{reserva?.id} · {reserva?.cliente_nombre || 'Sin nombre'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section className="space-y-4">
              {feedback && (
                <div
                  role={feedback.type === 'error' ? 'alert' : 'status'}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    feedback.type === 'error'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div>
                <label htmlFor="reserva-estado-seleccion" className="mb-2 block text-sm font-medium text-gray-700">
                  Estado
                </label>
                <select
                  id="reserva-estado-seleccion"
                  value={estadoSeleccionado || ''}
                  onChange={(event) => onEstadoChange(event.target.value as Reserva['estado'])}
                  disabled={loading || !reserva}
                  className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-wait disabled:bg-gray-100"
                >
                  {estadosDisponibles.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado === reserva?.estado ? `${estado} (actual)` : estado}
                    </option>
                  ))}
                </select>
              </div>

              {reserva && estadoSeleccionado && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <span
                    className="rounded-full px-3 py-1 text-xs text-white"
                    style={{ backgroundColor: RESERVA_ESTADO_COLORS[reserva.estado] }}
                  >
                    {reserva.estado}
                  </span>
                  {hayCambioEstado && (
                    <>
                      <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                      <span
                        className="rounded-full px-3 py-1 text-xs text-white"
                        style={{ backgroundColor: RESERVA_ESTADO_COLORS[estadoSeleccionado] }}
                      >
                        {estadoSeleccionado}
                      </span>
                    </>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="reserva-estado-detalle" className="mb-2 block text-sm font-medium text-gray-700">
                  {hayCambioEstado ? 'Nota del cambio' : 'Nota sobre el estado actual'}
                </label>
                <textarea
                  id="reserva-estado-detalle"
                  value={detalle}
                  onChange={(event) => onDetalleChange(event.target.value)}
                  maxLength={1000}
                  rows={6}
                  disabled={loading}
                  placeholder={
                    hayCambioEstado
                      ? 'Agregar una observación sobre el cambio de estado...'
                      : 'Agregar una observación sin cambiar el estado...'
                  }
                  className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-wait disabled:bg-gray-100"
                />
                <div className="mt-1 flex items-start justify-between gap-3 text-xs text-gray-500">
                  <span>
                    {hayCambioEstado
                      ? 'La nota es opcional.'
                      : 'Escriba una nota para registrarla en el estado actual.'}
                  </span>
                  <span className="shrink-0">{detalle.length}/1000</span>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={loading || !canConfirm}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {hayCambioEstado ? 'Guardar cambio' : 'Guardar anotación'}
                </button>
              </div>
            </section>

            <section className="min-w-0 border-t border-gray-200 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="mb-3 flex items-center gap-2">
                <History className="h-5 w-5 text-gray-500" />
                <h3 className="font-medium text-gray-900">Historial de estados</h3>
              </div>

              {loadingHistory ? (
                <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Cargando historial...
                </div>
              ) : historyError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {historyError}
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
                  Esta reserva todavía no tiene cambios ni anotaciones de estado.
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => {
                    const isNote = item.estado_anterior === item.estado_nuevo;

                    return (
                      <article key={item.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {isNote ? (
                            <>
                              <MessageSquareText className="h-4 w-4 text-gray-500" aria-hidden="true" />
                              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                Anotación
                              </span>
                              <span
                                className="rounded-full px-3 py-1 text-xs text-white"
                                style={{ backgroundColor: RESERVA_ESTADO_COLORS[item.estado_nuevo] }}
                              >
                                {item.estado_nuevo}
                              </span>
                            </>
                          ) : (
                            <>
                              <span
                                className="rounded-full px-3 py-1 text-xs text-white"
                                style={{ backgroundColor: RESERVA_ESTADO_COLORS[item.estado_anterior] }}
                              >
                                {item.estado_anterior}
                              </span>
                              <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                              <span
                                className="rounded-full px-3 py-1 text-xs text-white"
                                style={{ backgroundColor: RESERVA_ESTADO_COLORS[item.estado_nuevo] }}
                              >
                                {item.estado_nuevo}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatHistoryDate(item.creado_en)}
                          </span>
                          <span>{item.usuario_nombre || 'Sistema'}</span>
                        </div>

                        <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                          <p className="text-sm text-gray-700">
                            {item.detalle?.trim() || 'Sin observaciones.'}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
