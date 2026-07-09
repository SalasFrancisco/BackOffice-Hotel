import { useState, useEffect } from 'react';
import { supabase, Perfil, CategoriaServicio, Servicio } from '../utils/supabase/client';
import { formatUSD } from '../utils/currency';
import { Plus, Edit, Trash2, AlertCircle, CheckCircle, Coffee, Package, FolderOpen, FolderPlus, PackagePlus, ListOrdered, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ModuleInfoBanner } from './ModuleInfoBanner';
import { RichTextDescription } from './RichTextDescription';
import { ServiceDescriptionEditor } from './ServiceDescriptionEditor';
import {
  hasNonWhitespaceValue,
  preventInvalidNumberKeys,
  sanitizeDecimalInput,
} from '../utils/formSanitizers';
import {
  hasServiceDescriptionContent,
  sanitizeServiceDescriptionMarkup,
} from '../utils/serviceDescriptionRichText';
import {
  DEFAULT_SERVICE_INCOME_CATEGORY,
  getServiceIncomeCategoryLabel,
  normalizeServiceIncomeCategory,
  SERVICE_INCOME_CATEGORY_OPTIONS,
  type ServiceIncomeCategory,
} from '../utils/serviceIncomeCategories';
import {
  sortServiceCategories,
  sortServicesByName,
} from '../utils/serviceCatalogOrder';

type ServiciosAdicionalesProps = {
  perfil: Perfil;
};

export function ServiciosAdicionales({ perfil }: ServiciosAdicionalesProps) {
  const [categorias, setCategorias] = useState<CategoriaServicio[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [expandedServicios, setExpandedServicios] = useState<Set<number>>(new Set());
  const [expandedCategorias, setExpandedCategorias] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Dialogs
  const [showCategoriaDialog, setShowCategoriaDialog] = useState(false);
  const [showServicioDialog, setShowServicioDialog] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<CategoriaServicio | null>(null);
  const [editingServicio, setEditingServicio] = useState<Servicio | null>(null);
  
  // Form states - Categoría
  const [categoriaNombre, setCategoriaNombre] = useState('');
  const [categoriaDescripcion, setCategoriaDescripcion] = useState('');
  const [categoriaSuperior, setCategoriaSuperior] = useState<ServiceIncomeCategory>(
    DEFAULT_SERVICE_INCOME_CATEGORY,
  );
  
  // Form states - Servicio
  const [servicioNombre, setServicioNombre] = useState('');
  const [servicioDescripcion, setServicioDescripcion] = useState('');
  const [servicioPrecio, setServicioPrecio] = useState('');
  const [servicioCategoria, setServicioCategoria] = useState('');
  const [showOrdenCategoriasDialog, setShowOrdenCategoriasDialog] = useState(false);
  const [categoriasOrdenDraft, setCategoriasOrdenDraft] = useState<CategoriaServicio[]>([]);
  const [savingOrdenCategorias, setSavingOrdenCategorias] = useState(false);
  const [draggingCategoriaId, setDraggingCategoriaId] = useState<number | null>(null);
  const [dragOverCategoriaId, setDragOverCategoriaId] = useState<number | null>(null);

  // Confirm dialogs
  const [confirmDeleteCategoria, setConfirmDeleteCategoria] = useState<{ open: boolean; categoriaId: number | null }>({
    open: false,
    categoriaId: null,
  });
  const [confirmDeleteServicio, setConfirmDeleteServicio] = useState<{ open: boolean; servicioId: number | null }>({
    open: false,
    servicioId: null,
  });
  const [confirmReactivateServicio, setConfirmReactivateServicio] = useState<{ open: boolean; servicioId: number | null }>({
    open: false,
    servicioId: null,
  });
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'activos' | 'inactivos'>('activos');

  useEffect(() => {
    loadData();
  }, []);

  const isOrdenColumnMissingError = (error: unknown) => {
    if (!error || typeof error !== 'object' || !('message' in error)) return false;
    const message = String((error as { message?: string }).message || '').toLowerCase();
    return message.includes('orden') && message.includes('categorias_servicios');
  };

  const loadData = async () => {
    try {
      setLoading(true);

      // Load categorias
      const { data: categoriasData, error: categoriasError } = await supabase
        .from('categorias_servicios')
        .select('*')
        .order('nombre');

      if (categoriasError) throw categoriasError;
      setCategorias(sortServiceCategories(categoriasData || []));

      // Load servicios (todos: activos e inactivos; el filtro se hace en la UI)
      const { data: serviciosData, error: serviciosError } = await supabase
        .from('servicios')
        .select('*, categoria:categorias_servicios(*)')
        .order('nombre');

      if (serviciosError) throw serviciosError;
      setServicios(sortServicesByName(serviciosData || []));

    } catch (err: any) {
      console.error('Error loading data:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ===== CATEGORÍAS =====
  
  const handleCreateCategoria = () => {
    setEditingCategoria(null);
    setCategoriaNombre('');
    setCategoriaDescripcion('');
    setCategoriaSuperior(DEFAULT_SERVICE_INCOME_CATEGORY);
    setShowCategoriaDialog(true);
  };

  const handleEditCategoria = (categoria: CategoriaServicio) => {
    setEditingCategoria(categoria);
    setCategoriaNombre(categoria.nombre);
    setCategoriaDescripcion(categoria.descripcion || '');
    setCategoriaSuperior(normalizeServiceIncomeCategory(categoria.categoria_superior));
    setShowCategoriaDialog(true);
  };

  const handleSaveCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const categoriaNombreSanitizado = categoriaNombre.trim();
    const categoriaDescripcionSanitizada = categoriaDescripcion.trim();

    if (!hasNonWhitespaceValue(categoriaNombreSanitizado)) {
      setMessage({ type: 'error', text: 'El nombre es requerido' });
      return;
    }

    try {
      if (editingCategoria) {
        // Update
        const { error } = await supabase
          .from('categorias_servicios')
          .update({
            nombre: categoriaNombreSanitizado,
            descripcion: hasNonWhitespaceValue(categoriaDescripcionSanitizada) ? categoriaDescripcionSanitizada : null,
            categoria_superior: categoriaSuperior,
          })
          .eq('id', editingCategoria.id);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Categoría actualizada correctamente' });
      } else {
        // Create
        const siguienteOrden = categorias.reduce((maxOrden, categoria) => {
          const ordenCategoria = Number(categoria.orden);
          return Number.isFinite(ordenCategoria) && ordenCategoria > maxOrden
            ? ordenCategoria
            : maxOrden;
        }, 0) + 1;

        const payloadBase = {
          nombre: categoriaNombreSanitizado,
          descripcion: hasNonWhitespaceValue(categoriaDescripcionSanitizada) ? categoriaDescripcionSanitizada : null,
          categoria_superior: categoriaSuperior,
        };

        const { error: errorConOrden } = await supabase
          .from('categorias_servicios')
          .insert({
            ...payloadBase,
            orden: siguienteOrden,
          });

        if (errorConOrden) {
          if (isOrdenColumnMissingError(errorConOrden)) {
            const { error: errorSinOrden } = await supabase
              .from('categorias_servicios')
              .insert(payloadBase);
            if (errorSinOrden) throw errorSinOrden;
          } else {
            throw errorConOrden;
          }
        }
        setMessage({ type: 'success', text: 'Categoría creada correctamente' });
      }

      setShowCategoriaDialog(false);
      loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving categoria:', err);
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteCategoria = async (id: number) => {
    setConfirmDeleteCategoria({ open: true, categoriaId: id });
  };

  const confirmDeleteCategoriaAction = async () => {
    if (!confirmDeleteCategoria.categoriaId) return;

    try {
      const { error } = await supabase
        .from('categorias_servicios')
        .delete()
        .eq('id', confirmDeleteCategoria.categoriaId);

      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Categoría eliminada correctamente' });
      setConfirmDeleteCategoria({ open: false, categoriaId: null });
      loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting categoria:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmDeleteCategoria({ open: false, categoriaId: null });
    }
  };

  const handleOpenOrdenCategoriasDialog = () => {
    setCategoriasOrdenDraft([...categorias]);
    setShowOrdenCategoriasDialog(true);
  };

  const reorderCategoriasInDraft = (draggedCategoriaId: number, targetCategoriaId: number) => {
    if (draggedCategoriaId === targetCategoriaId) return;

    setCategoriasOrdenDraft((prev) => {
      const draggedIndex = prev.findIndex((categoria) => categoria.id === draggedCategoriaId);
      const targetIndex = prev.findIndex((categoria) => categoria.id === targetCategoriaId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      const [movedCategoria] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, movedCategoria);
      return next;
    });
  };

  const moveCategoriaInDraft = (categoriaId: number, direction: -1 | 1) => {
    setCategoriasOrdenDraft((prev) => {
      const currentIndex = prev.findIndex((categoria) => categoria.id === categoriaId);
      const targetIndex = currentIndex + direction;

      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      const [movedCategoria] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, movedCategoria);
      return next;
    });
  };

  const handleCategoriaDragStart = (categoriaId: number) => {
    setDraggingCategoriaId(categoriaId);
    setDragOverCategoriaId(categoriaId);
  };

  const handleCategoriaDragOver = (event: React.DragEvent<HTMLDivElement>, categoriaId: number) => {
    event.preventDefault();
    if (dragOverCategoriaId !== categoriaId) {
      setDragOverCategoriaId(categoriaId);
    }
  };

  const handleCategoriaDrop = (event: React.DragEvent<HTMLDivElement>, targetCategoriaId: number) => {
    event.preventDefault();
    if (draggingCategoriaId === null) return;
    reorderCategoriasInDraft(draggingCategoriaId, targetCategoriaId);
    setDragOverCategoriaId(null);
    setDraggingCategoriaId(null);
  };

  const handleCategoriaDragEnd = () => {
    setDragOverCategoriaId(null);
    setDraggingCategoriaId(null);
  };

  const handleSaveOrdenCategorias = async () => {
    if (categoriasOrdenDraft.length === 0) {
      setShowOrdenCategoriasDialog(false);
      return;
    }

    try {
      setSavingOrdenCategorias(true);
      setMessage(null);

      await Promise.all(
        categoriasOrdenDraft.map(async (categoria, index) => {
          const { error } = await supabase
            .from('categorias_servicios')
            .update({ orden: index + 1 })
            .eq('id', categoria.id);

          if (error) throw error;
        }),
      );

      setShowOrdenCategoriasDialog(false);
      setCategoriasOrdenDraft([]);
      setDragOverCategoriaId(null);
      setDraggingCategoriaId(null);
      setMessage({ type: 'success', text: 'Orden de categorias actualizado correctamente' });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving categorias order:', err);
      if (isOrdenColumnMissingError(err)) {
        setMessage({
          type: 'error',
          text: 'No se puede guardar el orden personalizado porque falta la columna \"orden\" en categorias_servicios.',
        });
      } else {
        setMessage({ type: 'error', text: err.message });
      }
    } finally {
      setSavingOrdenCategorias(false);
    }
  };

  // ===== SERVICIOS =====
  
  const handleCreateServicio = () => {
    if (categorias.length === 0) {
      setMessage({
        type: 'error',
        text: 'No se puede crear un servicio sin una categoría previa',
      });
      return;
    }

    setEditingServicio(null);
    setServicioNombre('');
    setServicioDescripcion('');
    setServicioPrecio('');
    setServicioCategoria('');
    setShowServicioDialog(true);
  };

  const handleEditServicio = (servicio: Servicio) => {
    setEditingServicio(servicio);
    setServicioNombre(servicio.nombre);
    setServicioDescripcion(servicio.descripcion || '');
    setServicioPrecio(servicio.precio.toString());
    setServicioCategoria(servicio.id_categoria.toString());
    setShowServicioDialog(true);
  };

  const handleSaveServicio = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const servicioNombreSanitizado = servicioNombre.trim();
    const servicioDescripcionSanitizada = sanitizeServiceDescriptionMarkup(servicioDescripcion).trim();
    const descripcionTieneContenido = hasServiceDescriptionContent(servicioDescripcionSanitizada);
    const servicioPrecioSanitizado = sanitizeDecimalInput(servicioPrecio);
    const servicioCategoriaSanitizada = servicioCategoria.trim();

    if (!hasNonWhitespaceValue(servicioNombreSanitizado) || !servicioPrecioSanitizado || !hasNonWhitespaceValue(servicioCategoriaSanitizada)) {
      setMessage({ type: 'error', text: 'Todos los campos marcados son requeridos' });
      return;
    }

    const precio = parseFloat(servicioPrecioSanitizado);
    if (isNaN(precio) || precio < 0) {
      setMessage({ type: 'error', text: 'El precio debe ser un número válido' });
      return;
    }

    try {
      if (editingServicio) {
        // Update
        const { error } = await supabase
          .from('servicios')
          .update({
            nombre: servicioNombreSanitizado,
            descripcion: descripcionTieneContenido ? servicioDescripcionSanitizada : null,
            precio: precio,
            id_categoria: parseInt(servicioCategoriaSanitizada, 10),
          })
          .eq('id', editingServicio.id);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Servicio actualizado correctamente' });
      } else {
        // Create
        const { error } = await supabase
          .from('servicios')
          .insert({
            nombre: servicioNombreSanitizado,
            descripcion: descripcionTieneContenido ? servicioDescripcionSanitizada : null,
            precio: precio,
            id_categoria: parseInt(servicioCategoriaSanitizada, 10),
            activo: true,
          });

        if (error) throw error;
        setMessage({ type: 'success', text: 'Servicio creado correctamente' });
      }

      setShowServicioDialog(false);
      loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error saving servicio:', err);
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteServicio = async (id: number) => {
    setConfirmDeleteServicio({ open: true, servicioId: id });
  };

  const confirmDeleteServicioAction = async () => {
    if (!confirmDeleteServicio.servicioId) return;
    const servicioId = confirmDeleteServicio.servicioId;

    try {
      const { error } = await supabase
        .from('servicios')
        .update({ activo: false })
        .eq('id', servicioId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Servicio desactivado correctamente' });
      setConfirmDeleteServicio({ open: false, servicioId: null });
      void loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deactivating servicio:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmDeleteServicio({ open: false, servicioId: null });
    }
  };

  const handleReactivateServicio = (id: number) => {
    setConfirmReactivateServicio({ open: true, servicioId: id });
  };

  const confirmReactivateServicioAction = async () => {
    if (!confirmReactivateServicio.servicioId) return;
    const servicioId = confirmReactivateServicio.servicioId;

    try {
      const { error } = await supabase
        .from('servicios')
        .update({ activo: true })
        .eq('id', servicioId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Servicio reactivado correctamente' });
      setConfirmReactivateServicio({ open: false, servicioId: null });
      void loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error reactivating servicio:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmReactivateServicio({ open: false, servicioId: null });
    }
  };

  const getServiciosByCategoria = (categoriaId: number) => {
    return servicios.filter((servicio) =>
      servicio.id_categoria === categoriaId &&
      (serviceStatusFilter === 'activos' ? servicio.activo !== false : servicio.activo === false),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  const isAdmin = perfil.rol === 'ADMIN';

  return (
    <div className="bo-page">
      <div className="mb-4">
        <h2 className="bo-module-title text-gray-900">
          <span className="bo-module-title-icon">
            <Coffee className="h-6 w-6" />
          </span>
          Servicios Adicionales
        </h2>
        <p className="bo-module-subtitle">Gestión de categorías y servicios adicionales para reservas</p>
      </div>

      <div className="mb-6">
        <ModuleInfoBanner>
          Organice el catálogo de servicios adicionales en categorías (catering, ambientación, etc.)
          con sus precios. Con el badge de estado puede desactivar o reactivar un servicio; use el
          filtro Activos / Inactivos para verlos. Las categorías, en cambio, se eliminan de forma
          definitiva.
        </ModuleInfoBanner>
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

      {/* Action buttons */}
      {isAdmin && (
        <div className="bo-page-actions bo-page-actions--pair flex gap-3 mb-6">
          <button
            onClick={handleCreateCategoria}
            className="bo-action-button flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            title="Nueva categoría"
            aria-label="Nueva categoría"
          >
            <FolderPlus className="w-5 h-5" />
            <span className="bo-btn-label">Nueva Categoría</span>
          </button>
          <button
            onClick={handleCreateServicio}
            className="bo-action-button flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            title="Nuevo servicio"
            aria-label="Nuevo servicio"
          >
            <PackagePlus className="w-5 h-5" />
            <span className="bo-btn-label">Nuevo Servicio</span>
          </button>
          <button
            onClick={handleOpenOrdenCategoriasDialog}
            className="bo-action-button flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            title="Ordenar categorías"
            aria-label="Ordenar categorías"
          >
            <ListOrdered className="w-5 h-5" />
            <span className="bo-btn-label">Ordenar categorias</span>
          </button>
        </div>
      )}

      {/* Filtro por estado de los servicios */}
      {isAdmin && (
        <div className="mb-6">
          <div className="bo-status-segment" role="tablist" aria-label="Filtrar servicios por estado">
            <button
              type="button"
              role="tab"
              aria-selected={serviceStatusFilter === 'activos'}
              onClick={() => setServiceStatusFilter('activos')}
              className={`bo-status-segment-btn${serviceStatusFilter === 'activos' ? ' is-active' : ''}`}
            >
              Servicios activos
              <span className="bo-status-segment-count">
                {servicios.filter((s) => s.activo !== false).length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={serviceStatusFilter === 'inactivos'}
              onClick={() => setServiceStatusFilter('inactivos')}
              className={`bo-status-segment-btn${serviceStatusFilter === 'inactivos' ? ' is-active' : ''}`}
            >
              Servicios inactivos
              <span className="bo-status-segment-count">
                {servicios.filter((s) => s.activo === false).length}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Categorías y Servicios */}
      <div className="space-y-6">
        {serviceStatusFilter === 'inactivos' && servicios.filter((s) => s.activo === false).length === 0 ? (
          <div className="bo-card-compact bg-white rounded-lg border border-gray-200 p-8 text-center">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No hay servicios inactivos</p>
          </div>
        ) : categorias.length === 0 ? (
          <div className="bo-card-compact bg-white rounded-lg border border-gray-200 p-8 text-center">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">No hay categorías creadas</p>
            {isAdmin && (
              <button
                onClick={handleCreateCategoria}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Crear primera categoría
              </button>
            )}
          </div>
        ) : (
          categorias.map(categoria => {
            const serviciosCategoria = getServiciosByCategoria(categoria.id);
            // En la vista de inactivos ocultamos las categorías que no tienen
            // ningún servicio inactivo, para no llenar de tarjetas vacías.
            if (serviceStatusFilter === 'inactivos' && serviciosCategoria.length === 0) {
              return null;
            }
            const isCategoriaOpen = expandedCategorias.has(Number(categoria.id));
            const toggleCategoria = () =>
              setExpandedCategorias((prev) => {
                const next = new Set(prev);
                if (next.has(Number(categoria.id))) {
                  next.delete(Number(categoria.id));
                } else {
                  next.add(Number(categoria.id));
                }
                return next;
              });

            return (
              <div key={categoria.id} className="bo-admin-card bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Categoria Header */}
                <div className="bo-section-header bg-gray-50 p-4 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={toggleCategoria}
                    className="bo-cat-toggle"
                    aria-expanded={isCategoriaOpen}
                  >
                    <ChevronDown className="w-5 h-5 bo-cat-toggle-chevron" />
                    <FolderOpen className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-gray-900">{categoria.nombre}</h3>
                      <p className="mt-1 text-xs font-medium text-blue-700">
                        {getServiceIncomeCategoryLabel(categoria.categoria_superior)}
                        <span className="text-gray-500"> · {serviciosCategoria.length} servicio(s)</span>
                      </p>
                      {categoria.descripcion && (
                        <p className="text-sm text-gray-600">{categoria.descripcion}</p>
                      )}
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditCategoria(categoria)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar categoría"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategoria(categoria.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar categoría"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Servicios de la categoría (acordeón) */}
                <div className={`bo-accordion-body${isCategoriaOpen ? ' is-open' : ''}`}>
                  <div className="bo-accordion-inner">
                <div className="p-4">
                  {serviciosCategoria.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No hay servicios en esta categoría
                    </p>
                  ) : (
                    <div className="bo-service-grid gap-3">
                      {serviciosCategoria.map(servicio => {
                        const isExpanded = expandedServicios.has(Number(servicio.id));
                        const toggleExpanded = () =>
                          setExpandedServicios((prev) => {
                            const next = new Set(prev);
                            if (next.has(Number(servicio.id))) {
                              next.delete(Number(servicio.id));
                            } else {
                              next.add(Number(servicio.id));
                            }
                            return next;
                          });

                        return (
                        <div
                          key={servicio.id}
                          className="bo-service-card border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <h4 className="text-gray-900 text-sm">{servicio.nombre}</h4>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleEditServicio(servicio)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Editar"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={servicio.activo !== false}
                                  onClick={() =>
                                    servicio.activo !== false
                                      ? handleDeleteServicio(servicio.id)
                                      : handleReactivateServicio(servicio.id)
                                  }
                                  className={`bo-status-toggle ${
                                    servicio.activo !== false ? 'is-activo' : 'is-inactivo'
                                  }`}
                                  title={
                                    servicio.activo !== false
                                      ? 'Desactivar servicio'
                                      : 'Reactivar servicio'
                                  }
                                >
                                  <span className="bo-status-toggle-track">
                                    <span className="bo-status-toggle-knob" />
                                  </span>
                                  <span className="bo-status-toggle-label">
                                    {servicio.activo !== false ? 'Activo' : 'Inactivo'}
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="bo-service-price text-blue-600">{formatUSD(servicio.precio)}</p>
                          {servicio.descripcion && (
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
                                  <RichTextDescription
                                    value={servicio.descripcion}
                                    className="text-xs text-gray-600 pt-2 leading-relaxed"
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Dialog - Ordenar Categorias */}
      <Dialog
        open={showOrdenCategoriasDialog}
        onOpenChange={(open) => {
          if (savingOrdenCategorias) return;
          setShowOrdenCategoriasDialog(open);
          if (!open) {
            setCategoriasOrdenDraft([]);
            setDragOverCategoriaId(null);
            setDraggingCategoriaId(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ordenar categorías</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 p-2">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Arrastre y suelte cada categoría para reordenarla. Al final, guarde los cambios.
              </p>

              {categoriasOrdenDraft.length === 0 ? (
                <p className="text-sm text-gray-500">No hay categorias para ordenar.</p>
              ) : (
                <div className="space-y-2">
                  {categoriasOrdenDraft.map((categoria, index) => {
                    const isDragOver = dragOverCategoriaId === categoria.id;
                    const isDragging = draggingCategoriaId === categoria.id;

                    return (
                    <div
                      key={categoria.id}
                      draggable={!savingOrdenCategorias}
                      onDragStart={() => handleCategoriaDragStart(categoria.id)}
                      onDragOver={(event) => handleCategoriaDragOver(event, categoria.id)}
                      onDrop={(event) => handleCategoriaDrop(event, categoria.id)}
                      onDragEnd={handleCategoriaDragEnd}
                      className={`bo-order-row flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                        isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
                      } ${isDragging ? 'opacity-60' : ''} ${savingOrdenCategorias ? 'cursor-not-allowed' : 'cursor-grab'}`}
                    >
                      <div className="flex min-w-0 items-center gap-2 pr-2">
                        <GripVertical className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-500">Posicion {index + 1}</p>
                          <p className="truncate text-sm text-gray-900">{categoria.nombre}</p>
                        </div>
                      </div>

                      <div className="bo-order-actions flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveCategoriaInDraft(categoria.id, -1)}
                          disabled={savingOrdenCategorias || index === 0}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Subir"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategoriaInDraft(categoria.id, 1)}
                          disabled={savingOrdenCategorias || index === categoriasOrdenDraft.length - 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Bajar"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bo-form-actions pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowOrdenCategoriasDialog(false);
                  setCategoriasOrdenDraft([]);
                  setDragOverCategoriaId(null);
                  setDraggingCategoriaId(null);
                }}
                disabled={savingOrdenCategorias}
                className="px-4 py-2 bo-btn-cancel rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveOrdenCategorias}
                disabled={savingOrdenCategorias || categoriasOrdenDraft.length < 2}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingOrdenCategorias ? 'Guardando...' : 'Guardar orden'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog - Crear/Editar Categoria */}
      <Dialog open={showCategoriaDialog} onOpenChange={setShowCategoriaDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCategoria ? 'Editar Categoría' : 'Nueva Categoría'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCategoria} className="space-y-4 p-2">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={categoriaNombre}
                onChange={(e) => setCategoriaNombre(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Desayuno"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                value={categoriaDescripcion}
                onChange={(e) => setCategoriaDescripcion(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Descripción opcional"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Categoría superior <span className="text-red-500">*</span>
              </label>
              <select
                value={categoriaSuperior}
                onChange={(event) => {
                  setCategoriaSuperior(event.target.value as ServiceIncomeCategory);
                }}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {SERVICE_INCOME_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Define en qué rubro se sumarán los servicios de esta categoría en el dashboard.
              </p>
            </div>

            <div className="bo-form-actions pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowCategoriaDialog(false)}
                className="px-4 py-2 bo-btn-cancel rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingCategoria ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog - Crear/Editar Servicio */}
      <Dialog open={showServicioDialog} onOpenChange={setShowServicioDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveServicio} className="space-y-4 p-2">
            <div className="space-y-4">
              <div>
              <label className="block text-sm text-gray-700 mb-2">
                Categoría <span className="text-red-500">*</span>
              </label>
              <select
                value={servicioCategoria}
                onChange={(e) => setServicioCategoria(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Seleccione una categoría</option>
                {categorias.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={servicioNombre}
                onChange={(e) => setServicioNombre(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Café y Medialunas"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Precio <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={servicioPrecio}
                onChange={(e) => setServicioPrecio(sanitizeDecimalInput(e.target.value))}
                onKeyDown={preventInvalidNumberKeys}
                inputMode="decimal"
                required
                min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Descripción
              </label>
              <ServiceDescriptionEditor
                value={servicioDescripcion}
                onChange={setServicioDescripcion}
                placeholder="Descripción opcional"
              />
            </div>
            </div>

            <div className="bo-form-actions pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowServicioDialog(false)}
                className="px-4 py-2 bo-btn-cancel rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingServicio ? 'Guardar Cambios' : 'Crear Servicio'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteCategoria.open}
        onOpenChange={(open) => setConfirmDeleteCategoria({ open, categoriaId: null })}
        onConfirm={confirmDeleteCategoriaAction}
        title="Eliminar Categoría"
        description="¿Está seguro de eliminar esta categoría? Se eliminarán también todos los servicios asociados. Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />

      <ConfirmDialog
        open={confirmDeleteServicio.open}
        onOpenChange={(open) => setConfirmDeleteServicio({ open, servicioId: null })}
        onConfirm={confirmDeleteServicioAction}
        title="Desactivar servicio"
        description="¿Está seguro de desactivar este servicio? Dejará de ofrecerse en nuevas reservas. Podrá reactivarlo más adelante desde la pestaña Servicios inactivos."
        confirmText="Desactivar"
        cancelText="Cancelar"
      />

      <ConfirmDialog
        open={confirmReactivateServicio.open}
        onOpenChange={(open) => setConfirmReactivateServicio({ open, servicioId: null })}
        onConfirm={confirmReactivateServicioAction}
        title="Reactivar servicio"
        description="¿Desea reactivar este servicio? Volverá a estar disponible para sumarse a las reservas."
        confirmText="Reactivar"
        cancelText="Cancelar"
        variant="default"
      />
    </div>
  );
}
