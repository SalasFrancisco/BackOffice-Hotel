import { useState, useEffect } from 'react';
import { supabase, Salon, Perfil } from '../utils/supabase/client';
import { Plus, Edit, AlertCircle, CheckCircle, Building2, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ModuleInfoBanner } from './ModuleInfoBanner';
import {
  hasNonWhitespaceValue,
  preventInvalidNumberKeys,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from '../utils/formSanitizers';
import { formatUSD } from '../utils/currency';
import { deleteReservaWithPresupuesto } from '../utils/reservaDeletion';

type SalonesProps = {
  perfil: Perfil;
  onEditSalon: (salonId: number) => void;
};

export function Salones({ perfil, onEditSalon }: SalonesProps) {
  const [salones, setSalones] = useState<Salon[]>([]);
  const [expandedSalones, setExpandedSalones] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSalon, setEditingSalon] = useState<Salon | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; salonId: number | null }>({
    open: false,
    salonId: null,
  });
  const [confirmReactivate, setConfirmReactivate] = useState<{ open: boolean; salonId: number | null }>({
    open: false,
    salonId: null,
  });
  const [statusFilter, setStatusFilter] = useState<'activos' | 'inactivos'>('activos');

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

      // Traemos todos (activos e inactivos); el filtro por estado se hace en la UI.
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

    const nombreSanitizado = nombre.trim();
    const capacidadSanitizada = sanitizeIntegerInput(capacidad);
    const precioBaseSanitizado = sanitizeDecimalInput(precioBase);
    const descripcionSanitizada = descripcion.trim();

    if (!hasNonWhitespaceValue(nombreSanitizado) || !capacidadSanitizada || !precioBaseSanitizado) {
      setMessage({ type: 'error', text: 'Por favor complete todos los campos requeridos' });
      return;
    }

    const capacidadNumero = parseInt(capacidadSanitizada, 10);
    if (!capacidadNumero || capacidadNumero <= 0) {
      setMessage({ type: 'error', text: 'Por favor ingrese una capacidad válida' });
      return;
    }

    const precioNumero = parseFloat(precioBaseSanitizado);
    if (Number.isNaN(precioNumero) || precioNumero < 0) {
      setMessage({ type: 'error', text: 'Por favor ingrese un precio base válido' });
      return;
    }

    try {
      setFormLoading(true);

      const salonData = {
        nombre: nombreSanitizado,
        capacidad: capacidadNumero,
        precio_base: precioNumero,
        descripcion: hasNonWhitespaceValue(descripcionSanitizada) ? descripcionSanitizada : null,
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
          .insert([{ ...salonData, activo: true }]);

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
    const salonId = confirmDelete.salonId;

    try {
      const { data: reservasAsociadas, error: reservasError } = await supabase
        .from('reservas')
        .select('id, presupuesto_url')
        .eq('id_salon', salonId);

      if (reservasError) throw reservasError;

      const reservasDelSalon = reservasAsociadas || [];
      for (const reserva of reservasDelSalon) {
        await deleteReservaWithPresupuesto({
          id: reserva.id,
          presupuesto_url: reserva.presupuesto_url,
        });
      }

      const { error: deleteError } = await supabase
        .from('salones')
        .update({ activo: false })
        .eq('id', salonId);

      if (deleteError) throw deleteError;

      const reservasEliminadasText = reservasDelSalon.length > 0
        ? ` y ${reservasDelSalon.length} reserva(s) asociada(s)`
        : '';
      setMessage({ type: 'success', text: `Salón desactivado correctamente${reservasEliminadasText}` });
      setConfirmDelete({ open: false, salonId: null });
      void loadSalones();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deactivating salon:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmDelete({ open: false, salonId: null });
    }
  };

  const handleReactivate = (id: number) => {
    if (!canEdit) return;
    setConfirmReactivate({ open: true, salonId: id });
  };

  const confirmReactivarSalon = async () => {
    if (!confirmReactivate.salonId) return;
    const salonId = confirmReactivate.salonId;

    try {
      const { error: updateError } = await supabase
        .from('salones')
        .update({ activo: true })
        .eq('id', salonId);

      if (updateError) throw updateError;

      setMessage({ type: 'success', text: 'Salón reactivado correctamente' });
      setConfirmReactivate({ open: false, salonId: null });
      void loadSalones();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error reactivating salon:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmReactivate({ open: false, salonId: null });
    }
  };

  const salonesActivos = salones.filter((salon) => salon.activo !== false);
  const salonesInactivos = salones.filter((salon) => salon.activo === false);
  const visibleSalones = statusFilter === 'activos' ? salonesActivos : salonesInactivos;

  return (
    <div className="bo-page">
      <div className="bo-page-header mb-4">
        <div className="bo-module-heading">
          <h2 className="bo-module-title text-gray-900">
            <span className="bo-module-title-icon">
              <Building2 className="h-6 w-6" />
            </span>
            Gestión de Salones
          </h2>
          <p className="bo-module-subtitle">Administración de los salones y sus distribuciones</p>
        </div>
        {canEdit && (
          <div className="bo-page-actions bo-page-actions--pair flex items-center justify-end gap-2">
            <button
              onClick={handleCreateNew}
              className="bo-action-button flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              title="Nuevo salón"
              aria-label="Nuevo salón"
            >
              <Plus className="w-5 h-5" />
              <span className="bo-btn-label">Nuevo Salón</span>
            </button>
          </div>
        )}
      </div>

      <div className="mb-6">
        <ModuleInfoBanner>
          Cree y edite los salones disponibles para eventos, con su capacidad, precio base y
          distribuciones. Con el badge de estado puede desactivar un salón (deja de poder reservarse,
          pero no se borra) o reactivarlo cuando quiera; use el filtro Activos / Inactivos para verlos.
        </ModuleInfoBanner>
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

      {/* Filtro por estado */}
      <div className="mb-6">
        <div className="bo-status-segment" role="tablist" aria-label="Filtrar salones por estado">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'activos'}
            onClick={() => setStatusFilter('activos')}
            className={`bo-status-segment-btn${statusFilter === 'activos' ? ' is-active' : ''}`}
          >
            Activos
            <span className="bo-status-segment-count">{salonesActivos.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'inactivos'}
            onClick={() => setStatusFilter('inactivos')}
            className={`bo-status-segment-btn${statusFilter === 'inactivos' ? ' is-active' : ''}`}
          >
            Inactivos
            <span className="bo-status-segment-count">{salonesInactivos.length}</span>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bo-card-grid gap-6">
        {loading ? (
          <div className="bo-grid-empty text-center py-8 text-gray-500">
            Cargando salones...
          </div>
        ) : visibleSalones.length === 0 ? (
          <div className="bo-grid-empty text-center py-8 text-gray-500">
            {statusFilter === 'activos'
              ? 'No hay salones activos'
              : 'No hay salones inactivos'}
          </div>
        ) : (
          visibleSalones.map(salon => {
            const isExpanded = expandedSalones.has(Number(salon.id));
            const toggleExpanded = () =>
              setExpandedSalones((prev) => {
                const next = new Set(prev);
                if (next.has(Number(salon.id))) {
                  next.delete(Number(salon.id));
                } else {
                  next.add(Number(salon.id));
                }
                return next;
              });

            return (
            <div key={salon.id} className="bo-admin-card bo-card-compact bo-salon-card bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(salon)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar salón y distribuciones"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={salon.activo !== false}
                      onClick={() =>
                        salon.activo !== false
                          ? handleDelete(salon.id)
                          : handleReactivate(salon.id)
                      }
                      className={`bo-status-toggle ${
                        salon.activo !== false ? 'is-activo' : 'is-inactivo'
                      }`}
                      title={salon.activo !== false ? 'Desactivar salón' : 'Reactivar salón'}
                    >
                      <span className="bo-status-toggle-track">
                        <span className="bo-status-toggle-knob" />
                      </span>
                      <span className="bo-status-toggle-label">
                        {salon.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                  </div>
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
                    {formatUSD(salon.precio_base)}
                  </span>
                </div>
              </div>

              {salon.descripcion && (
                <>
                  <button
                    type="button"
                    onClick={toggleExpanded}
                    className="bo-accordion-toggle"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Ver menos' : 'Ver más información'}
                    <ChevronDown className="w-4 h-4 bo-accordion-toggle-icon" />
                  </button>
                  <div className={`bo-accordion-body${isExpanded ? ' is-open' : ''}`}>
                    <div className="bo-accordion-inner">
                      <p className="text-sm text-gray-600 pt-3">
                        {salon.descripcion}
                      </p>
                    </div>
                  </div>
                </>
              )}

            </div>
            );
          })
        )}
      </div>

      {/* Dialog for Create/Edit */}
      <Dialog open={showDialog} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl bo-salon-dialog">
          <DialogHeader className="bo-salon-dialog-head">
            <span className="bo-salon-dialog-head-icon" aria-hidden="true">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="bo-salon-dialog-head-text">
              <DialogTitle>{editingSalon ? 'Editar Salón' : 'Nuevo Salón'}</DialogTitle>
              <p className="bo-salon-dialog-subtitle">
                {editingSalon
                  ? 'Actualice los datos y la descripción del salón.'
                  : 'Complete los datos del salón. La descripción admite textos extensos.'}
              </p>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="bo-salon-form">
            <div className="bo-salon-field">
              <label className="bo-salon-label">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="Ej.: Salón Centenario"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="bo-form-grid-2">
              <div className="bo-salon-field">
                <label className="bo-salon-label">
                  Capacidad <span className="text-red-500">*</span>
                </label>
                <div className="bo-salon-input-group">
                  <input
                    type="number"
                    min="1"
                    value={capacidad}
                    onChange={(e) => setCapacidad(sanitizeIntegerInput(e.target.value))}
                    onKeyDown={preventInvalidNumberKeys}
                    inputMode="numeric"
                    required
                    placeholder="0"
                    className="w-full py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bo-salon-input bo-salon-input--suffixed"
                  />
                  <span className="bo-salon-input-suffix">personas</span>
                </div>
              </div>

              <div className="bo-salon-field">
                <label className="bo-salon-label">
                  Precio Base <span className="text-red-500">*</span>
                </label>
                <div className="bo-salon-input-group">
                  <span className="bo-salon-input-prefix">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={precioBase}
                    onChange={(e) => setPrecioBase(sanitizeDecimalInput(e.target.value))}
                    onKeyDown={preventInvalidNumberKeys}
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    className="w-full py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bo-salon-input bo-salon-input--prefixed"
                  />
                </div>
              </div>
            </div>

            <div className="bo-salon-field">
              <label className="bo-salon-label">Descripción</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={6}
                placeholder="Describa el salón: ambientación, servicios incluidos, características destacadas, condiciones..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bo-salon-textarea"
              />
              <div className="bo-salon-field-hint">
                <span>Opcional. Se muestra en la ficha del salón.</span>
                <span>{descripcion.trim().length} caracteres</span>
              </div>
            </div>

            <div className="bo-form-actions pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bo-btn-cancel rounded-lg transition-colors"
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
        title="Desactivar salón"
        description="¿Está seguro de desactivar este salón? Dejará de poder reservarse y se eliminarán sus reservas asociadas y presupuestos. Podrá reactivarlo más adelante desde la pestaña Inactivos."
        confirmText="Desactivar"
        cancelText="Cancelar"
      />

      <ConfirmDialog
        open={confirmReactivate.open}
        onOpenChange={(open) => setConfirmReactivate({ open, salonId: null })}
        onConfirm={confirmReactivarSalon}
        title="Reactivar salón"
        description="¿Desea reactivar este salón? Volverá a estar disponible para reservar y aparecerá en la pestaña Activos."
        confirmText="Reactivar"
        cancelText="Cancelar"
        variant="default"
      />
    </div>
  );
}
