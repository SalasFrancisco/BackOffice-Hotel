import { useState, useEffect } from 'react';
import { supabase, Perfil } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { AlertCircle, CheckCircle, Shield, User, Plus, Edit } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

export function Usuarios() {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<Perfil | null>(null);
  
  // Form fields for create
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newRol, setNewRol] = useState<'ADMIN' | 'OPERADOR'>('OPERADOR');

  // Form fields for edit
  const [editNombre, setEditNombre] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRol, setEditRol] = useState<'ADMIN' | 'OPERADOR'>('OPERADOR');

  useEffect(() => {
    loadPerfiles();
  }, []);

  const loadPerfiles = async () => {
    try {
      setLoading(true);
      setError('');

      const { data, error: queryError } = await supabase
        .from('perfiles')
        .select('*')
        .order('creado_en', { ascending: false });

      if (queryError) throw queryError;
      setPerfiles(data || []);
    } catch (err: any) {
      console.error('Error loading perfiles:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!newEmail || !newPassword || !newNombre || !newRol) {
      setMessage({ type: 'error', text: 'Todos los campos son requeridos' });
      return;
    }

    try {
      setCreating(true);

      // Get current user's access token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      // Call server endpoint to create user
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: newEmail,
            password: newPassword,
            nombre: newNombre,
            rol: newRol,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear usuario');
      }

      setMessage({ type: 'success', text: `Usuario ${newEmail} creado correctamente` });
      setShowCreateDialog(false);
      setNewEmail('');
      setNewPassword('');
      setNewNombre('');
      setNewRol('OPERADOR');
      loadPerfiles();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error creating user:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handleEditClick = async (perfil: Perfil) => {
    setEditingPerfil(perfil);
    setEditNombre(perfil.nombre);
    setEditRol(perfil.rol);
    
    // Get user email from server
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/get-user-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId: perfil.user_id }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setEditEmail(data.email || '');
      } else {
        setEditEmail('');
      }
    } catch (err) {
      console.error('Error loading user email:', err);
      setEditEmail('');
    }
    
    setShowEditDialog(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!editingPerfil || !editNombre || !editEmail) {
      setMessage({ type: 'error', text: 'Todos los campos son requeridos' });
      return;
    }

    try {
      setEditing(true);

      // Update perfil
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          nombre: editNombre,
          rol: editRol,
        })
        .eq('user_id', editingPerfil.user_id);

      if (updateError) throw updateError;

      // Update email if changed
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/update-user-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: editingPerfil.user_id,
            newEmail: editEmail,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        console.error('Error updating email:', data.error);
        // Don't throw here, just warn - email update might fail but other changes succeeded
        setMessage({ type: 'success', text: 'Usuario actualizado (email no pudo ser actualizado)' });
      } else {
        setMessage({ type: 'success', text: 'Usuario actualizado correctamente' });
      }

      setShowEditDialog(false);
      setEditingPerfil(null);
      loadPerfiles();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setEditing(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-gray-900">Gestión de Usuarios</h2>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Crear Usuario
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center py-8 text-gray-500">
            Cargando usuarios...
          </div>
        ) : perfiles.length === 0 ? (
          <div className="col-span-3 text-center py-8 text-gray-500">
            No hay usuarios registrados
          </div>
        ) : (
          perfiles.map(perfil => (
            <div key={perfil.user_id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  perfil.rol === 'ADMIN' ? 'bg-purple-100' : 'bg-blue-100'
                }`}>
                  {perfil.rol === 'ADMIN' ? (
                    <Shield className={`w-6 h-6 text-purple-600`} />
                  ) : (
                    <User className={`w-6 h-6 text-blue-600`} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    perfil.rol === 'ADMIN'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {perfil.rol}
                  </span>
                  <button
                    onClick={() => handleEditClick(perfil)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Editar usuario"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-gray-900 mb-2">{perfil.nombre}</h3>
              
              <p className="text-xs text-gray-500 mb-4 break-all">
                ID: {perfil.user_id}
              </p>

              <p className="text-sm text-gray-600">
                Creado: {new Date(perfil.creado_en).toLocaleDateString('es-AR')}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Usuario</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4 p-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Nombre Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newNombre}
                  onChange={(e) => setNewNombre(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="usuario@hotel.com"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Contraseña <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
                <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Rol <span className="text-red-500">*</span>
                </label>
                <select
                  value={newRol}
                  onChange={(e) => setNewRol(e.target.value as 'ADMIN' | 'OPERADOR')}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="OPERADOR">OPERADOR</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewEmail('');
                  setNewPassword('');
                  setNewNombre('');
                  setNewRol('OPERADOR');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditUser} className="space-y-4 p-2">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Nombre Completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Juan Pérez"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="usuario@hotel.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Este será el email que el usuario use para iniciar sesión
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Rol <span className="text-red-500">*</span>
              </label>
              <select
                value={editRol}
                onChange={(e) => setEditRol(e.target.value as 'ADMIN' | 'OPERADOR')}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="OPERADOR">OPERADOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingPerfil(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editing ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
