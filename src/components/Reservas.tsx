import { useState, useEffect } from 'react';
import { supabase, Reserva } from '../utils/supabase/client';
import { Plus, Search, Edit, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ReservaForm } from './ReservaForm';

const ESTADO_COLORS = {
  Pendiente: '#F7C948',
  Confirmado: '#4C7AF2',
  Pagado: '#35B679',
  Cancelado: '#B0B7C3',
};

export function Reservas() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingReserva, setEditingReserva] = useState<Reserva | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadReservas();
  }, [filterEstado]);

  const loadReservas = async () => {
    try {
      setLoading(true);
      setError('');

      let query = supabase
        .from('reservas')
        .select(`
          *,
          salon:salones(*),
          distribucion:distribuciones(*)
        `)
        .order('fecha_inicio', { ascending: false });

      if (filterEstado) {
        query = query.eq('estado', filterEstado);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;
      setReservas(data || []);
    } catch (err: any) {
      console.error('Error loading reservas:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar esta reserva?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('reservas')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setMessage({ type: 'success', text: 'Reserva eliminada correctamente' });
      loadReservas();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting reserva:', err);
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleEdit = (reserva: Reserva) => {
    setEditingReserva(reserva);
    setShowDialog(true);
  };

  const handleCreateNew = () => {
    setEditingReserva(null);
    setShowDialog(true);
  };

  const handleDialogClose = (success?: boolean) => {
    setShowDialog(false);
    setEditingReserva(null);
    if (success) {
      loadReservas();
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

  const filteredReservas = reservas.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.nombre_cliente.toLowerCase().includes(term) ||
      r.salon?.nombre.toLowerCase().includes(term) ||
      r.estado.toLowerCase().includes(term) ||
      r.id.toString().includes(term)
    );
  });

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-gray-900">Gestión de Reservas</h2>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva Reserva
        </button>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg mb-6 ${
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

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, salón, estado o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterEstado || ''}
          onChange={(e) => setFilterEstado(e.target.value || null)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Pagado">Pagado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">Salón</th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">Fecha Inicio</th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">Fecha Fin</th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">Monto</th>
                <th className="px-6 py-3 text-right text-xs text-gray-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    Cargando reservas...
                  </td>
                </tr>
              ) : filteredReservas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    No se encontraron reservas
                  </td>
                </tr>
              ) : (
                filteredReservas.map(reserva => (
                  <tr key={reserva.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">#{reserva.id}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{reserva.nombre_cliente}</div>
                      {reserva.empresa_cliente && (
                        <div className="text-xs text-gray-500">{reserva.empresa_cliente}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{reserva.salon?.nombre}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{formatDate(reserva.fecha_inicio)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{formatDate(reserva.fecha_fin)}</td>
                    <td className="px-6 py-4">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-xs text-white"
                        style={{ backgroundColor: ESTADO_COLORS[reserva.estado] }}
                      >
                        {reserva.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ${Number(reserva.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(reserva)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(reserva.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Mostrando {filteredReservas.length} de {reservas.length} reservas
      </div>

      {/* Dialog for Create/Edit */}
      <Dialog open={showDialog} onOpenChange={(open) => !open && handleDialogClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReserva ? 'Editar Reserva' : 'Nueva Reserva'}</DialogTitle>
          </DialogHeader>
          <ReservaForm
            reserva={editingReserva}
            onClose={handleDialogClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
