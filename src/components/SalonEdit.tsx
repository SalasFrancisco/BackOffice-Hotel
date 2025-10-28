import { useState, useEffect } from 'react';
import { supabase, Salon, Distribucion } from '../utils/supabase/client';
import { ArrowLeft, Plus, Edit, Trash2, AlertCircle, CheckCircle, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';

type SalonEditProps = {
  salonId: number;
  onBack: () => void;
};

export function SalonEdit({ salonId, onBack }: SalonEditProps) {
  const [salon, setSalon] = useState<Salon | null>(null);
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showDistDialog, setShowDistDialog] = useState(false);
  const [editingDist, setEditingDist] = useState<Distribucion | null>(null);

  // Form fields - Salon
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [precioBase, setPrecioBase] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [savingSalon, setSavingSalon] = useState(false);

  // Form fields - Distribucion
  const [distNombre, setDistNombre] = useState('');
  const [distCapacidad, setDistCapacidad] = useState('');
  const [savingDist, setSavingDist] = useState(false);

  // Confirm dialog
  const [confirmDeleteDist, setConfirmDeleteDist] = useState<{ open: boolean; distId: number | null }>({
    open: false,
    distId: null,
  });

  useEffect(() => {
    loadData();
  }, [salonId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load salon
      const { data: salonData, error: salonError } = await supabase
        .from('salones')
        .select('*')
        .eq('id', salonId)
        .single();

      if (salonError) throw salonError;
      
      setSalon(salonData);
      setNombre(salonData.nombre);
      setCapacidad(salonData.capacidad.toString());
      setPrecioBase(salonData.precio_base.toString());
      setDescripcion(salonData.descripcion || '');

      // Load distribuciones
      const { data: distData, error: distError } = await supabase
        .from('distribuciones')
        .select('*')
        .eq('id_salon', salonId)
        .order('nombre');

      if (distError) throw distError;
      setDistribuciones(distData || []);

    } catch (err: any) {
      console.error('Error loading salon:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSalon = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!nombre || !capacidad || !precioBase) {
      setMessage({ type: 'error', text: 'Complete todos los campos requeridos del salon' });
      return;
    }

    const capacidadNumero = parseInt(capacidad, 10);
    if (!capacidadNumero || capacidadNumero <= 0) {
      setMessage({ type: 'error', text: 'Ingrese una capacidad valida para el salon' });
      return;
    }

    const maxDistribucion = distribuciones.reduce((max, dist) => Math.max(max, dist.capacidad), 0);
    if (distribuciones.length > 0 && capacidadNumero < maxDistribucion) {
      setMessage({
        type: 'error',
        text: `La capacidad del salon no puede ser inferior a la mayor distribucion (${maxDistribucion} personas)`,
      });
      return;
    }

    try {
      setSavingSalon(true);

      const { error } = await supabase
        .from('salones')
        .update({
          nombre,
          capacidad: capacidadNumero,
          precio_base: parseFloat(precioBase),
          descripcion: descripcion || null,
        })
        .eq('id', salonId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Salon actualizado correctamente' });
      loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving salon:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingSalon(false);
    }
  };

  const handleEditDist = (dist: Distribucion) => {
    setEditingDist(dist);
    setDistNombre(dist.nombre);
    setDistCapacidad(dist.capacidad.toString());
    setShowDistDialog(true);
  };

  const handleCreateNewDist = () => {
    setEditingDist(null);
    setDistNombre('');
    setDistCapacidad('');
    setShowDistDialog(true);
  };

  const handleSaveDist = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);


    if (!distNombre || !distCapacidad) {
      setMessage({ type: 'error', text: 'Complete todos los campos de la distribucion' });
      return;
    }

    const capacidadSalon = salon ? salon.capacidad : parseInt(capacidad, 10) || 0;
    const capacidadDistribucion = parseInt(distCapacidad, 10);

    if (!capacidadDistribucion || capacidadDistribucion <= 0) {
      setMessage({ type: 'error', text: 'Ingrese una capacidad valida para la distribucion' });
      return;
    }

    if (capacidadDistribucion > capacidadSalon) {
      setMessage({
        type: 'error',
        text: `La distribucion no puede superar la capacidad del salon (${capacidadSalon} personas)`,
      });
      return;
    }

    try {
      setSavingDist(true);

      if (editingDist) {
        const { error } = await supabase
          .from('distribuciones')
          .update({
            nombre: distNombre,
            capacidad: capacidadDistribucion,
          })
          .eq('id', editingDist.id);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Distribucion actualizada correctamente' });
      } else {
        const { error } = await supabase
          .from('distribuciones')
          .insert([{
            id_salon: salonId,
            nombre: distNombre,
            capacidad: capacidadDistribucion,
          }]);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Distribucion creada correctamente' });
      }



      setShowDistDialog(false);
      setEditingDist(null);
      loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving distribucion:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingDist(false);
    }
  };

  const handleDeleteDist = async (id: number) => {
    setConfirmDeleteDist({ open: true, distId: id });
  };

  const confirmDeleteDistAction = async () => {
    if (!confirmDeleteDist.distId) return;

    try {
      const { error } = await supabase
        .from('distribuciones')
        .delete()
        .eq('id', confirmDeleteDist.distId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Distribución eliminada correctamente' });
      setConfirmDeleteDist({ open: false, distId: null });
      loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting distribucion:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmDeleteDist({ open: false, distId: null });
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">Salon no encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Volver a Salones
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <Building2 className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-gray-900">Editar Salon</h2>
          <p className="text-sm text-gray-600">ID: {salon.id}</p>
        </div>
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

      {/* Datos del Salon */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-gray-900 mb-4">Datos del Salon</h3>
        <form onSubmit={handleSaveSalon} className="space-y-4">
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
                Capacidad Máxima <span className="text-red-500">*</span>
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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSalon}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingSalon ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>

      {/* Distribuciones */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-gray-900">Distribuciones del Salon</h3>
            <p className="text-sm text-gray-600">Configuraciones de distribución con diferentes capacidades</p>
          </div>
          <button
            onClick={handleCreateNewDist}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Distribución
          </button>
        </div>

        {distribuciones.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No hay distribuciones creadas para este Salon
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {distribuciones.map(dist => (
              <div key={dist.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-gray-900">{dist.nombre}</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditDist(dist)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteDist(dist.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Capacidad: <span className="text-gray-900">{dist.capacidad} personas</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog for Create/Edit Distribution */}
      <Dialog open={showDistDialog} onOpenChange={setShowDistDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDist ? 'Editar Distribución' : 'Nueva Distribución'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveDist} className="space-y-4 p-2">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Nombre de la Distribución <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={distNombre}
                onChange={(e) => setDistNombre(e.target.value)}
                required
                placeholder="Ej: Auditorio, Banquete, Cóctel"
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
                value={distCapacidad}
                onChange={(e) => setDistCapacidad(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Número de personas que pueden asistir con esta distribución
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowDistDialog(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingDist}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingDist ? 'Guardando...' : editingDist ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteDist.open}
        onOpenChange={(open) => setConfirmDeleteDist({ open, distId: null })}
        onConfirm={confirmDeleteDistAction}
        title="Eliminar Distribución"
        description="¿Está seguro de eliminar esta distribución? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </div>
  );
}

