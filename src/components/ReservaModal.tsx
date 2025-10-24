import { useState, useEffect } from 'react';
import { supabase, Reserva, ReservaServicio } from '../utils/supabase/client';
import { X, Trash2, Edit, CheckCircle, AlertCircle, Package } from 'lucide-react';

type ReservaModalProps = {
  reserva: Reserva;
  onClose: () => void;
};

const ESTADO_COLORS = {
  Pendiente: '#F7C948',
  Confirmado: '#4C7AF2',
  Pagado: '#35B679',
  Cancelado: '#B0B7C3',
};

export function ReservaModal({ reserva, onClose }: ReservaModalProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [reservaServicios, setReservaServicios] = useState<ReservaServicio[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(true);

  useEffect(() => {
    loadServicios();
  }, [reserva.id]);

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

  const handleChangeEstado = async (nuevoEstado: Reserva['estado']) => {
    try {
      setLoading(true);
      setMessage(null);

      const { error } = await supabase
        .from('reservas')
        .update({ estado: nuevoEstado })
        .eq('id', reserva.id);

      if (error) throw error;

      setMessage({ type: 'success', text: `Estado actualizado a ${nuevoEstado}` });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error updating estado:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Está seguro de eliminar esta reserva?')) return;

    try {
      setLoading(true);
      setMessage(null);

      const { error } = await supabase
        .from('reservas')
        .delete()
        .eq('id', reserva.id);

      if (error) throw error;

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
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-200">
          <div>
            <h3 className="text-gray-900 mb-1">Detalle de Reserva</h3>
            <div
              className="inline-block px-3 py-1 rounded-full text-sm text-white"
              style={{ backgroundColor: ESTADO_COLORS[reserva.estado] }}
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
        <div className="p-6 space-y-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Cliente</p>
              <p className="text-gray-900">{(reserva as any).nombre_cliente}</p>
              {(reserva as any).empresa_cliente && (
                <p className="text-sm text-gray-600">{(reserva as any).empresa_cliente}</p>
              )}
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
              <p className="text-sm text-gray-600 mb-1">Monto</p>
              <p className="text-gray-900">
                ${Number(reserva.monto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
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
                        <p className="text-xs text-gray-600 mt-1">{rs.servicio.descripcion}</p>
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

          {/* Cambiar Estado */}
          <div>
            <p className="text-sm text-gray-600 mb-2">Cambiar Estado</p>
            <div className="flex gap-2 flex-wrap">
              {(['Pendiente', 'Confirmado', 'Pagado', 'Cancelado'] as const).map(estado => (
                <button
                  key={estado}
                  onClick={() => handleChangeEstado(estado)}
                  disabled={loading || reserva.estado === estado}
                  className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: ESTADO_COLORS[estado] }}
                >
                  {estado}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar Reserva
          </button>
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
