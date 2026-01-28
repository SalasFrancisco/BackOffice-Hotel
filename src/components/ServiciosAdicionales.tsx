import { useState, useEffect } from 'react';
import { supabase, Perfil, CategoriaServicio, Servicio } from '../utils/supabase/client';
import { Plus, Edit, Trash2, AlertCircle, CheckCircle, Package, FolderOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';

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

  const [selectedCategoria, setSelectedCategoria] = useState<number | null>(null);

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

  const loadData = async () => {
    try {
      setLoading(true);

      // Load categorias
      const { data: categoriasData, error: categoriasError } = await supabase
        .from('categorias_servicios')
        .select('*')
        .order('nombre');

      if (categoriasError) throw categoriasError;
      setCategorias(categoriasData || []);

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

    if (!categoriaNombre) {
      setMessage({ type: 'error', text: 'El nombre es requerido' });
      return;
    }

    try {
      if (editingCategoria) {
        // Update
        const { error } = await supabase
          .from('categorias_servicios')
          .update({
            nombre: categoriaNombre,
            descripcion: categoriaDescripcion || null,
          })
          .eq('id', editingCategoria.id);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Categoría actualizada correctamente' });
      } else {
        // Create
        const { error } = await supabase
          .from('categorias_servicios')
          .insert({
            nombre: categoriaNombre,
            descripcion: categoriaDescripcion || null,
          });

        if (error) throw error;
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

  // ===== SERVICIOS =====
  
  const handleCreateServicio = () => {
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

    if (!servicioNombre || !servicioPrecio || !servicioCategoria) {
      setMessage({ type: 'error', text: 'Todos los campos marcados son requeridos' });
      return;
    }

    const precio = parseFloat(servicioPrecio);
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
            nombre: servicioNombre,
            descripcion: servicioDescripcion || null,
            precio: precio,
            id_categoria: parseInt(servicioCategoria),
          })
          .eq('id', editingServicio.id);

        if (error) throw error;
        setMessage({ type: 'success', text: 'Servicio actualizado correctamente' });
      } else {
        // Create
        const { error } = await supabase
          .from('servicios')
          .insert({
            nombre: servicioNombre,
            descripcion: servicioDescripcion || null,
            precio: precio,
            id_categoria: parseInt(servicioCategoria),
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
                            <p className="text-xs text-gray-600 mb-2">{servicio.descripcion}</p>
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

      {/* Dialog - Crear/Editar Categoría */}
      <Dialog open={showCategoriaDialog} onOpenChange={setShowCategoriaDialog}>
        <DialogContent className="max-w-md">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveServicio} className="space-y-4 p-2">
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
                onChange={(e) => setServicioPrecio(e.target.value)}
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
              <textarea
                value={servicioDescripcion}
                onChange={(e) => setServicioDescripcion(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Descripción opcional"
              />
            </div>

            <div className="flex gap-3 pt-4">
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
