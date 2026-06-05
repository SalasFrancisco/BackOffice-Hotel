import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, Loader2 } from 'lucide-react';
import { Reserva, supabase } from '../utils/supabase/client';
import { RESERVA_ESTADO_COLORS, type ReservaEstado } from '../utils/reservaEstadoTransitions';
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

type ReservaEstadoHistorialModalProps = {
  open: boolean;
  reserva: Reserva | null;
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

export function ReservaEstadoHistorialModal({
  open,
  reserva,
  onOpenChange,
}: ReservaEstadoHistorialModalProps) {
  const [items, setItems] = useState<ReservaEstadoHistorialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !reserva) {
      setItems([]);
      setError('');
      return;
    }

    let isActive = true;

    const loadHistory = async () => {
      try {
        setLoading(true);
        setError('');

        const { data, error: queryError } = await supabase.rpc(
          'obtener_historial_estado_reserva',
          { p_reserva_id: reserva.id },
        );

        if (queryError) throw queryError;
        if (isActive) {
          setItems((data || []) as ReservaEstadoHistorialItem[]);
        }
      } catch (err: any) {
        console.error('Error loading reserva state history:', err);
        if (isActive) {
          setError(err?.message || 'No se pudo cargar el historial de estados.');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      isActive = false;
    };
  }, [open, reserva]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bo-reserva-compact-dialog max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Historial de estados</DialogTitle>
          <DialogDescription>
            Reserva #{reserva?.id} · {reserva?.cliente_nombre || 'Sin nombre'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-24 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando historial...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
              Esta reserva todavía no tiene cambios de estado registrados.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <article key={item.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
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
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatHistoryDate(item.creado_en)}
                    </span>
                    <span>{item.usuario_nombre || 'Sistema'}</span>
                  </div>

                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-500">
                      Detalle registrado el {formatHistoryDate(item.creado_en)}
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      {item.detalle?.trim() || 'Sin justificación.'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
