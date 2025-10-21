import { useState, useEffect } from 'react';
import { supabase, Salon, Perfil } from '../utils/supabase/client';
import { Plus, Edit, Trash2, AlertCircle, CheckCircle, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';

type SalonesProps = {
  perfil: Perfil;
  onEditSalon: (salonId: number) => void;
};

export function Salones({ perfil, onEditSalon }: SalonesProps) {
  const [salones, setSalones] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSalon, setEditingSalon] = useState<Salon | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; salonId: number | null }>({
    open: false,
    salonId: null,
  });

  // Form fields
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [precioBase, setPrecioBase] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const canEdit = perfil.rol === 'ADMIN';

  useEffect(() => {
    loadSalones();
  }, []);

  const loadSalones = async () => {
    try {
      setLoading(true);
      setError('');

      const { data, error: queryError } = await supabase
        .from('salones')
        .select('*')
        .order('nombre');

      if (queryError) throw queryError;
      setSalones(data || []);
    } catch (err: any) {
      console.error('Error loading salones:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNombre('');
    setCapacidad('');
    setPrecioBase('');
    setDescripcion('');
    setEditingSalon(null);
    setShowDialog(false);
  };

  const handleEdit = (salon: Salon) => {
    if (!canEdit) return;
    onEditSalon(salon.id);
  };

  const handleQuickEdit = (salon: Salon) => {
    if (!canEdit) return;
    setEditingSalon(salon);
    setNombre(salon.nombre);
    setCapacidad(salon.capacidad.toString());
    setPrecioBase(salon.precio_base.toString());
    setDescripcion(salon.descripcion || '');
    setShowDialog(true);
  };

  const handleCreateNew = () => {
    if (!canEdit) return;
    resetForm();
    setShowDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    if (!nombre || !capacidad || !precioBase) {
      setMessage({ type: 'error', text: 'Por favor complete todos los campos requeridos' });
      return;
    }

    try {
      setFormLoading(true);

      const salonData = {
        nombre,
        capacidad: parseInt(capacidad),
        precio_base: parseFloat(precioBase),
        descripcion: descripcion || null,
      };

      if (editingSalon) {
        const { error: updateError } = await supabase
          .from('salones')
          .update(salonData)
          .eq('id', editingSalon.id);

        if (updateError) throw updateError;
        setMessage({ type: 'success', text: 'Salón actualizado correctamente' });
      } else {
        const { error: insertError } = await supabase
          .from('salones')
          .insert([salonData]);

        if (insertError) throw insertError;
        setMessage({ type: 'success', text: 'Salón creado correctamente' });
      }

      resetForm();
      loadSalones();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving salon:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canEdit) return;
    setConfirmDelete({ open: true, salonId: id });
  };

  const confirmDeleteSalon = async () => {
    if (!confirmDelete.salonId) return;

    try {
      const { error: deleteError } = await supabase
        .from('salones')
        .delete()
        .eq('id', confirmDelete.salonId);

      if (deleteError) throw deleteError;

      setMessage({ type: 'success', text: 'Salón eliminado correctamente' });
      setConfirmDelete({ open: false, salonId: null });
      loadSalones();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting salon:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmDelete({ open: false, salonId: null });
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-gray-900">Gestión de Salones</h2>
        {canEdit && (
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Salón
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Modo de solo lectura:</strong> Solo los administradores pueden crear, editar o eliminar salones.
          </p>
        </div>
      )}

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

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center py-8 text-gray-500">
            Cargando salones...
          </div>
        ) : salones.length === 0 ? (
          <div className="col-span-3 text-center py-8 text-gray-500">
            No hay salones registrados
          </div>
        ) : (
          salones.map(salon => (
            <div key={salon.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleDelete(salon.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <h3 className="text-gray-900 mb-2">{salon.nombre}</h3>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Capacidad:</span>
                  <span className="text-gray-900">{salon.capacidad} personas</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Precio Base:</span>
                  <span className="text-gray-900">
                    ${Number(salon.precio_base).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {salon.descripcion && (
                <p className="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-200">
                  {salon.descripcion}
                </p>
              )}

              {canEdit && (
                <button
                  onClick={() => handleEdit(salon)}
                  className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Editar Salón y Distribuciones
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Dialog for Create/Edit */}
      <Dialog open={showDialog} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSalon ? 'Editar Salón' : 'Nuevo Salón'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 p-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Capacidad <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={capacidad}
                  onChange={(e) => setCapacidad(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Precio Base <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioBase}
                  onChange={(e) => setPrecioBase(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Descripción
                </label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {formLoading ? 'Guardando...' : editingSalon ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete.open}
        onOpenChange={(open) => setConfirmDelete({ open, salonId: null })}
        onConfirm={confirmDeleteSalon}
        title="Eliminar Salón"
        description="¿Está seguro de eliminar este salón? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </div>
  );
}
