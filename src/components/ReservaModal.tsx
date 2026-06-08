import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase, Reserva, ReservaServicio } from '../utils/supabase/client';
import { X, Trash2, CheckCircle, AlertCircle, Package } from 'lucide-react';
import { deleteReservaWithPresupuesto } from '../utils/reservaDeletion';
import { ConfirmDialog } from './ConfirmDialog';
import { RichTextDescription } from './RichTextDescription';
import { RESERVA_ESTADO_COLORS } from '../utils/reservaEstadoTransitions';

type ReservaModalProps = {
  reserva: Reserva;
  canDelete: boolean;
  onClose: () => void;
};

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const hasStoredMontoInicial = (value: Reserva['monto_inicial']) =>
  value !== null && value !== undefined && Number.isFinite(Number(value));

export function ReservaModal({ reserva, canDelete, onClose }: ReservaModalProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [reservaServicios, setReservaServicios] = useState<ReservaServicio[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(true);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [registradaPor, setRegistradaPor] = useState('Formulario WEB');
  const totalServicios = reservaServicios.reduce(
    (sum, rs) => sum + ((Number(rs.servicio?.precio) || 0) * (Number(rs.cantidad) || 0)),
    0,
  );
  const montoActual = (Number(reserva.monto) || 0) + totalServicios;
  const montoInicial = hasStoredMontoInicial(reserva.monto_inicial)
    ? Number(reserva.monto_inicial)
    : null;

  useEffect(() => {
    loadServicios();
  }, [reserva.id]);

  useEffect(() => {
    let isActive = true;

    const loadCreador = async () => {
      const creadorId = reserva.creado_por?.trim();
      if (!creadorId) {
        setRegistradaPor('Formulario WEB');
        return;
      }

      setRegistradaPor('Usuario back office');

      const { data, error } = await supabase
        .from('perfiles')
        .select('nombre')
        .eq('user_id', creadorId)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        console.warn('Error loading reserva creator:', error);
        setRegistradaPor('Usuario back office');
        return;
      }

      setRegistradaPor(data?.nombre || 'Usuario back office');
    };

    void loadCreador();

    return () => {
      isActive = false;
    };
  }, [reserva.creado_por]);

  const loadServicios = async () => {
    try {
      setLoadingServicios(true);
      const { data, error } = await supabase
        .from('reserva_servicios')
        .select('*, servicio:servicios(*, categoria:categorias_servicios(*))')
        .eq('id_reserva', reserva.id);

      if (error) throw error;
      setReservaServicios(data || []);
    } catch (err: any) {
      console.error('Error loading servicios:', err);
    } finally {
      setLoadingServicios(false);
    }
  };

  const handleDelete = () => {
    if (!canDelete) return;
    setShowDeleteConfirmDialog(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirmDialog(false);

    try {
      setLoading(true);
      setMessage(null);

      await deleteReservaWithPresupuesto(reserva);

      setMessage({ type: 'success', text: 'Reserva eliminada correctamente' });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error deleting reserva:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Cordoba',
    });
  };

  return createPortal(
    <div
      className="bo-reserva-detail-overlay fixed inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(1px)' }}
    >
      <div className="bo-reserva-detail-modal bo-reserva-modal bg-white rounded-lg shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="bo-reserva-modal-header flex justify-between items-start p-6 border-b border-gray-200">
          <div>
            <h3 className="text-gray-900 mb-1">Detalle de Reserva</h3>
            <div
              className="inline-block px-3 py-1 rounded-full text-sm text-white"
              style={{ backgroundColor: RESERVA_ESTADO_COLORS[reserva.estado] }}
            >
              {reserva.estado}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="bo-reserva-modal-content p-6 space-y-4">
          {message && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}
              <p className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                {message.text}
              </p>
            </div>
          )}

          <div className="bo-form-grid-2">

            <div>
              <p className="text-sm text-gray-600 mb-1">Cliente</p>
              <p className="text-gray-900">{reserva.cliente_nombre || 'Sin nombre'}</p>
              <p className="text-sm text-gray-600">{reserva.cliente_email || 'Sin email'}</p>
              <p className="text-sm text-gray-600">{reserva.cliente_telefono || 'Sin teléfono'}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Registrada por</p>
              <p className="text-gray-900">{registradaPor}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Salón</p>
              <p className="text-gray-900">{reserva.salon?.nombre}</p>
              <p className="text-sm text-gray-600">
                Capacidad: {reserva.salon?.capacidad} personas
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Fecha y Hora Inicio</p>
              <p className="text-gray-900">{formatDate(reserva.fecha_inicio)}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Fecha y Hora Fin</p>
              <p className="text-gray-900">{formatDate(reserva.fecha_fin)}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Monto inicial</p>
              <p className="text-gray-900">
                {montoInicial === null ? 'Sin presupuesto' : formatCurrency(montoInicial)}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Monto actual</p>
              <p className="text-gray-900">
                {formatCurrency(montoActual)}
              </p>
              {totalServicios > 0 && (
                <p className="text-sm text-gray-600">
                  Salón {formatCurrency(Number(reserva.monto) || 0)} + servicios {formatCurrency(totalServicios)}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">ID Reserva</p>
              <p className="text-gray-900">#{reserva.id}</p>
            </div>
          </div>

          {reserva.distribucion && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Distribución</p>
              <p className="text-gray-900">{reserva.distribucion.nombre}</p>
              <p className="text-sm text-gray-600">
                Capacidad: {reserva.distribucion.capacidad} personas
              </p>
            </div>
          )}

          {reserva.observaciones && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Observaciones</p>
              <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{reserva.observaciones}</p>
            </div>
          )}

          {/* Servicios Adicionales */}
          {!loadingServicios && reservaServicios.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-5 h-5 text-green-600" />
                <p className="text-sm text-gray-600">Servicios Adicionales</p>
              </div>
              <div className="space-y-2">
                {reservaServicios.map(rs => (
                  <div
                    key={rs.id}
                    className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3"
                  >
                    <div className="flex-1">
                      <p className="text-gray-900">{rs.servicio?.nombre}</p>
                      {rs.servicio?.categoria && (
                        <p className="text-xs text-gray-600">{rs.servicio.categoria.nombre}</p>
                      )}
                      {rs.servicio?.descripcion && (
                        <RichTextDescription
                          value={rs.servicio.descripcion}
                          className="text-xs text-gray-600 mt-1 leading-relaxed"
                        />
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Cantidad: {rs.cantidad}</p>
                      <p className="text-green-600">
                        ${(rs.servicio?.precio || 0).toLocaleString('es-AR')} c/u
                      </p>
                      <p className="text-gray-900">
                        Total: ${((rs.servicio?.precio || 0) * rs.cantidad).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                  <p className="text-sm text-blue-800">
                    <strong>Total Servicios:</strong> ${reservaServicios.reduce((sum, rs) => sum + ((rs.servicio?.precio || 0) * rs.cantidad), 0).toLocaleString('es-AR')}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bo-reserva-modal-footer flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
          {canDelete ? (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar Reserva
            </button>
          ) : <div />}
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}
        onConfirm={confirmDelete}
        title="Eliminar reserva"
        description="¿Está seguro de eliminar esta reserva? También se eliminará el presupuesto asociado."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
      />
    </div>,
    document.body,
  );
}

