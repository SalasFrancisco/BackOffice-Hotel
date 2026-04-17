import { useState, useEffect } from 'react';
import { supabase, Perfil, CategoriaServicio, Servicio } from '../utils/supabase/client';
import { Plus, Edit, Trash2, AlertCircle, CheckCircle, Package, FolderOpen, ArrowUp, ArrowDown, ListOrdered } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';
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

type ServiciosAdicionalesProps = {
  perfil: Perfil;
};

export function ServiciosAdicionales({ perfil }: ServiciosAdicionalesProps) {
  const [categorias, setCategorias] = useState<CategoriaServicio[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
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
  
  // Form states - Servicio
  const [servicioNombre, setServicioNombre] = useState('');
  const [servicioDescripcion, setServicioDescripcion] = useState('');
  const [servicioPrecio, setServicioPrecio] = useState('');
  const [servicioCategoria, setServicioCategoria] = useState('');
  const [showOrdenCategoriasDialog, setShowOrdenCategoriasDialog] = useState(false);
  const [categoriasOrdenDraft, setCategoriasOrdenDraft] = useState<CategoriaServicio[]>([]);
  const [savingOrdenCategorias, setSavingOrdenCategorias] = useState(false);

  // Confirm dialogs
  const [confirmDeleteCategoria, setConfirmDeleteCategoria] = useState<{ open: boolean; categoriaId: number | null }>({
    open: false,
    categoriaId: null,
  });
  const [confirmDeleteServicio, setConfirmDeleteServicio] = useState<{ open: boolean; servicioId: number | null }>({
    open: false,
    servicioId: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const sortCategorias = (categoriasInput: CategoriaServicio[]) =>
    [...categoriasInput].sort((categoriaA, categoriaB) => {
      const ordenA = Number(categoriaA.orden);
      const ordenB = Number(categoriaB.orden);
      const tieneOrdenA = Number.isFinite(ordenA) && ordenA > 0;
      const tieneOrdenB = Number.isFinite(ordenB) && ordenB > 0;

      if (tieneOrdenA && tieneOrdenB && ordenA !== ordenB) {
        return ordenA - ordenB;
      }
      if (tieneOrdenA && !tieneOrdenB) return -1;
      if (!tieneOrdenA && tieneOrdenB) return 1;

      return categoriaA.nombre.localeCompare(categoriaB.nombre, 'es', { sensitivity: 'base' });
    });

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
      setCategorias(sortCategorias(categoriasData || []));

      // Load servicios
      const { data: serviciosData, error: serviciosError } = await supabase
        .from('servicios')
        .select('*, categoria:categorias_servicios(*)')
        .order('nombre');

      if (serviciosError) throw serviciosError;
      setServicios(serviciosData || []);

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
    setShowCategoriaDialog(true);
  };

  const handleEditCategoria = (categoria: CategoriaServicio) => {
    setEditingCategoria(categoria);
    setCategoriaNombre(categoria.nombre);
    setCategoriaDescripcion(categoria.descripcion || '');
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

  const moveCategoriaInDraft = (index: number, direction: -1 | 1) => {
    setCategoriasOrdenDraft((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [movedCategoria] = next.splice(index, 1);
      next.splice(targetIndex, 0, movedCategoria);
      return next;
    });
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

    try {
      const { error } = await supabase
        .from('servicios')
        .delete()
        .eq('id', confirmDeleteServicio.servicioId);

      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Servicio eliminado correctamente' });
      setConfirmDeleteServicio({ open: false, servicioId: null });
      loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting servicio:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmDeleteServicio({ open: false, servicioId: null });
    }
  };

  const getServiciosByCategoria = (categoriaId: number) => {
    return servicios.filter(s => s.id_categoria === categoriaId);
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
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-gray-900 mb-2">Servicios Adicionales</h2>
        <p className="text-gray-600">Gestión de categorías y servicios adicionales para reservas</p>
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
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCreateCategoria}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Categoría
          </button>
          <button
            onClick={handleCreateServicio}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Servicio
          </button>
          <button
            onClick={handleOpenOrdenCategoriasDialog}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <ListOrdered className="w-5 h-5" />
            Ordenar categorias
          </button>
        </div>
      )}

      {/* Categorías y Servicios */}
      <div className="space-y-6">
        {categorias.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
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
            
            return (
              <div key={categoria.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Categoria Header */}
                <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-gray-900">{categoria.nombre}</h3>
                      {categoria.descripcion && (
                        <p className="text-sm text-gray-600">{categoria.descripcion}</p>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
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

                {/* Servicios de la categoría */}
                <div className="p-4">
                  {serviciosCategoria.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No hay servicios en esta categoría
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {serviciosCategoria.map(servicio => (
                        <div
                          key={servicio.id}
                          className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
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
                                  onClick={() => handleDeleteServicio(servicio.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          {servicio.descripcion && (
                            <RichTextDescription
                              value={servicio.descripcion}
                              className="text-xs text-gray-600 mb-2 leading-relaxed"
                            />
                          )}
                          <p className="text-blue-600">${servicio.precio.toLocaleString('es-AR')}</p>
                        </div>
                      ))}
                    </div>
                  )}
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
          if (!open) setCategoriasOrdenDraft([]);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden p-0">
          <DialogHeader className="border-b px-6 pt-6 pb-4 pr-12">
            <DialogTitle>Ordenar categorias</DialogTitle>
          </DialogHeader>

          <div className="flex max-h-[calc(85vh-5rem)] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <p className="text-sm text-gray-600">
                Usa las flechas para mover cada categoria y luego guarda el orden.
              </p>

              {categoriasOrdenDraft.length === 0 ? (
                <p className="text-sm text-gray-500">No hay categorias para ordenar.</p>
              ) : (
                <div className="space-y-2">
                  {categoriasOrdenDraft.map((categoria, index) => (
                    <div
                      key={categoria.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs text-gray-500">Posicion {index + 1}</p>
                        <p className="truncate text-sm text-gray-900">{categoria.nombre}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveCategoriaInDraft(index, -1)}
                          disabled={index === 0 || savingOrdenCategorias}
                          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Mover arriba"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategoriaInDraft(index, 1)}
                          disabled={index === categoriasOrdenDraft.length - 1 || savingOrdenCategorias}
                          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Mover abajo"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowOrdenCategoriasDialog(false);
                  setCategoriasOrdenDraft([]);
                }}
                disabled={savingOrdenCategorias}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveOrdenCategorias}
                disabled={savingOrdenCategorias || categoriasOrdenDraft.length < 2}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingOrdenCategorias ? 'Guardando...' : 'Guardar orden'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog - Crear/Editar Categoria */}
      <Dialog open={showCategoriaDialog} onOpenChange={setShowCategoriaDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-hidden p-0">
          <DialogHeader className="border-b px-6 pt-6 pb-4 pr-12">
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

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCategoriaDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingCategoria ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog - Crear/Editar Servicio */}
      <Dialog open={showServicioDialog} onOpenChange={setShowServicioDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-hidden p-0">
          <DialogHeader className="border-b px-6 pt-6 pb-4 pr-12">
            <DialogTitle>
              {editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveServicio} className="flex max-h-[calc(85vh-5rem)] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
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
                placeholder="Descripcion opcional"
              />
            </div>
            </div>

            <div className="flex gap-3 border-t bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setShowServicioDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
        title="Eliminar Servicio"
        description="¿Está seguro de eliminar este servicio? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </div>
  );
}
