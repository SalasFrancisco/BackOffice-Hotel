import { useState, useEffect } from 'react';
import { supabase, Perfil } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';
import { AlertCircle, CheckCircle, Shield, User, Users, Plus, Edit, Loader2, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ModuleInfoBanner } from './ModuleInfoBanner';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { hasNonWhitespaceValue } from '../utils/formSanitizers';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';

export function Usuarios() {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadingEditUserId, setLoadingEditUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(null);
  const [confirmDeletePerfil, setConfirmDeletePerfil] = useState<{ open: boolean; perfil: Perfil | null }>({
    open: false,
    perfil: null,
  });
  const [confirmReactivatePerfil, setConfirmReactivatePerfil] = useState<{ open: boolean; perfil: Perfil | null }>({
    open: false,
    perfil: null,
  });
  const [statusFilter, setStatusFilter] = useState<'activos' | 'inactivos'>('activos');
  const [editingPerfil, setEditingPerfil] = useState<Perfil | null>(null);
  
  // Campos del formulario de alta
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newRol, setNewRol] = useState<'ADMIN' | 'OPERADOR'>('OPERADOR');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Campos del formulario de edición
  const [editNombre, setEditNombre] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRol, setEditRol] = useState<'ADMIN' | 'OPERADOR'>('OPERADOR');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  // Estado de la carga del email actual (vive en Supabase Auth, se trae del server).
  const [editEmailLoading, setEditEmailLoading] = useState(false);
  const [editEmailError, setEditEmailError] = useState(false);

  const canCreateUser = isValidPassword(newPassword) && hasNonWhitespaceValue(newEmail) && hasNonWhitespaceValue(newNombre);
  const canUpdatePassword = editPassword.trim().length === 0 || isValidPassword(editPassword);

  useEffect(() => {
    loadPerfiles();
  }, []);

  const parseServerResponse = async (response: Response) => {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  };

  const callServerEndpoint = async (path: string, accessToken: string, body: Record<string, any>) => {
    // Probamos rutas en orden de prioridad para tolerar despliegues previos.
    const urls = [
      `https://${projectId}.supabase.co/functions/v1/server/${path}`,
      `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/${path}`,
      `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/${path}`,
    ];

    let lastPayload: any = { error: 'No se pudo contactar el servidor' };
    let lastStatus = 0;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        });

        const payload = await parseServerResponse(response);
        lastPayload = payload;
        lastStatus = response.status;

        if (response.ok) {
          return { response, payload };
        }

        const message = String(payload?.error || '');
        const isNotFound = response.status === 404 || /not found|404/i.test(message);

        if (!isNotFound) {
          return { response, payload };
        }
      } catch (err: any) {
        lastPayload = { error: err?.message || 'Error de red al contactar el servidor' };
      }
    }

    return {
      response: new Response(null, { status: lastStatus || 500 }),
      payload: lastPayload,
    };
  };

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

    const newEmailSanitizado = newEmail.trim();
    const newNombreSanitizado = newNombre.trim();

    if (!hasNonWhitespaceValue(newEmailSanitizado) || !hasNonWhitespaceValue(newPassword) || !hasNonWhitespaceValue(newNombreSanitizado) || !newRol) {
      setMessage({ type: 'error', text: 'Todos los campos son requeridos' });
      return;
    }

    if (!isValidPassword(newPassword)) {
      setMessage({ type: 'error', text: PASSWORD_POLICY_MESSAGE });
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
      const { response, payload } = await callServerEndpoint(
        'create-user',
        session.access_token,
        {
          email: newEmailSanitizado,
          password: newPassword,
          nombre: newNombreSanitizado,
          rol: newRol,
        }
      );

      if (!response.ok) {
        throw new Error(payload.error || 'Error al crear usuario');
      }

      setMessage({
        type: 'success',
        text: payload.reactivated
          ? `Usuario ${newEmailSanitizado} creado correctamente`
          : `Usuario ${newEmailSanitizado} creado correctamente`,
      });
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
    if (loadingEditUserId) return;
    setLoadingEditUserId(perfil.user_id);

    setEditingPerfil(perfil);
    setEditNombre(perfil.nombre);
    setEditRol(perfil.rol);
    setEditPassword('');
    // Abrimos el modal de inmediato y mostramos "Cargando email…" mientras se
    // trae el email actual (que vive en Auth, no en la tabla perfiles).
    setEditEmail('');
    setEditEmailError(false);
    setEditEmailLoading(true);
    setShowEditDialog(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { response, payload } = await callServerEndpoint(
        'get-user-email',
        session.access_token,
        { userId: perfil.user_id }
      );

      if (response.ok && payload?.email) {
        setEditEmail(payload.email);
      } else {
        // Respondió pero sin email, o falló: avisamos en vez de dejarlo vacío en silencio.
        setEditEmailError(true);
      }
    } catch (err) {
      console.error('Error loading user email:', err);
      setEditEmailError(true);
    } finally {
      setEditEmailLoading(false);
      setLoadingEditUserId(null);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const editNombreSanitizado = editNombre.trim();
    const editEmailSanitizado = editEmail.trim();

    if (!editingPerfil || !hasNonWhitespaceValue(editNombreSanitizado) || !hasNonWhitespaceValue(editEmailSanitizado)) {
      setMessage({ type: 'error', text: 'Todos los campos son requeridos' });
      return;
    }

    try {
      setEditing(true);

      // Update perfil
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          nombre: editNombreSanitizado,
          rol: editRol,
        })
        .eq('user_id', editingPerfil.user_id);

      if (updateError) throw updateError;

      // Update email if changed
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const { response, payload } = await callServerEndpoint(
        'update-user-email',
        session.access_token,
        {
          userId: editingPerfil.user_id,
          newEmail: editEmailSanitizado,
        }
      );

      let warning = '';
      if (!response.ok) {
        console.error('Error updating email:', payload.error);
        warning = ' El email no pudo actualizarse.';
      }

      if (editPassword.trim().length > 0) {
        if (!isValidPassword(editPassword.trim())) {
          throw new Error(PASSWORD_POLICY_MESSAGE);
        }

        const { response: resetResponse, payload: resetPayload } = await callServerEndpoint(
          'reset-user-password',
          session.access_token,
          {
            userId: editingPerfil.user_id,
            newPassword: editPassword.trim(),
          }
        );

        if (!resetResponse.ok) {
          throw new Error(resetPayload.error || 'No se pudo actualizar la contraseña del usuario');
        }
      }

      setMessage({
        type: 'success',
        text: `Usuario actualizado correctamente.${warning}`,
      });

      setShowEditDialog(false);
      setEditingPerfil(null);
      setEditPassword('');
      loadPerfiles();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteClick = (perfil: Perfil) => {
    setMessage(null);

    if (perfil.rol !== 'OPERADOR') {
      setMessage({ type: 'error', text: 'Solo se pueden eliminar usuarios con rol OPERADOR.' });
      return;
    }

    setConfirmDeletePerfil({ open: true, perfil });
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    setConfirmDeletePerfil((current) => ({
      open,
      perfil: open ? current.perfil : null,
    }));
  };

  const confirmDeleteUser = async () => {
    const perfil = confirmDeletePerfil.perfil;
    if (!perfil) return;

    if (perfil.rol !== 'OPERADOR') {
      setMessage({ type: 'error', text: 'No se pueden eliminar usuarios con rol ADMIN.' });
      setConfirmDeletePerfil({ open: false, perfil: null });
      return;
    }

    try {
      setDeletingUserId(perfil.user_id);
      setMessage(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const { response, payload } = await callServerEndpoint(
        'delete-user',
        session.access_token,
        { userId: perfil.user_id }
      );

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo eliminar el usuario');
      }

      setMessage({ type: 'success', text: `Usuario ${perfil.nombre} dado de baja correctamente` });
      setConfirmDeletePerfil({ open: false, perfil: null });
      setPerfiles((current) => current.filter((item) => item.user_id !== perfil.user_id));
      loadPerfiles();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleReactivateClick = (perfil: Perfil) => {
    setMessage(null);
    if (perfil.rol !== 'OPERADOR') return;
    setConfirmReactivatePerfil({ open: true, perfil });
  };

  const confirmReactivateUser = async () => {
    const perfil = confirmReactivatePerfil.perfil;
    if (!perfil) return;

    try {
      setReactivatingUserId(perfil.user_id);
      setMessage(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const { response, payload } = await callServerEndpoint(
        'reactivate-user',
        session.access_token,
        { userId: perfil.user_id },
      );

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo reactivar el usuario');
      }

      setMessage({ type: 'success', text: `Usuario ${perfil.nombre} reactivado correctamente` });
      setConfirmReactivatePerfil({ open: false, perfil: null });
      loadPerfiles();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error reactivating user:', err);
      setMessage({ type: 'error', text: err.message });
      setConfirmReactivatePerfil({ open: false, perfil: null });
    } finally {
      setReactivatingUserId(null);
    }
  };

  const perfilesActivos = perfiles.filter((perfil) => perfil.activo !== false);
  const perfilesInactivos = perfiles.filter((perfil) => perfil.activo === false);
  const visiblePerfiles = statusFilter === 'activos' ? perfilesActivos : perfilesInactivos;

  return (
    <div className="bo-page">
      <div className="bo-page-header mb-4">
        <div className="bo-module-heading">
          <h2 className="bo-module-title text-gray-900">
            <span className="bo-module-title-icon">
              <Users className="h-6 w-6" />
            </span>
            Gestión de Usuarios
          </h2>
          <p className="bo-module-subtitle">Gestión de los usuarios y accesos del back-office</p>
        </div>
        <div className="bo-page-actions bo-page-actions--pair flex items-center justify-end gap-2">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="bo-action-button flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            title="Crear usuario"
            aria-label="Crear usuario"
          >
            <Plus className="w-5 h-5" />
            <span className="bo-btn-label">Crear Usuario</span>
          </button>
        </div>
      </div>

      <div className="mb-6">
        <ModuleInfoBanner>
          Cree usuarios del sistema y asigne su rol (administrador u operador). Con el badge de
          estado puede dar de baja o reactivar a un operador (use el filtro Activos / Inactivos para
          verlos); los administradores no se pueden desactivar. Solo los administradores gestionan
          usuarios.
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

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="mb-6">
        <div className="bo-status-segment" role="tablist" aria-label="Filtrar usuarios por estado">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'activos'}
            onClick={() => setStatusFilter('activos')}
            className={`bo-status-segment-btn${statusFilter === 'activos' ? ' is-active' : ''}`}
          >
            Activos
            <span className="bo-status-segment-count">{perfilesActivos.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'inactivos'}
            onClick={() => setStatusFilter('inactivos')}
            className={`bo-status-segment-btn${statusFilter === 'inactivos' ? ' is-active' : ''}`}
          >
            Inactivos
            <span className="bo-status-segment-count">{perfilesInactivos.length}</span>
          </button>
        </div>
      </div>

      <div className="bo-card-grid gap-6">
        {loading ? (
          <div className="bo-grid-empty text-center py-8 text-gray-500">
            Cargando usuarios...
          </div>
        ) : visiblePerfiles.length === 0 ? (
          <div className="bo-grid-empty text-center py-8 text-gray-500">
            {statusFilter === 'activos'
              ? 'No hay usuarios activos'
              : 'No hay usuarios dados de baja'}
          </div>
        ) : (
          visiblePerfiles.map(perfil => (
            <div key={perfil.user_id} className="bo-admin-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className={`w-12 h-12 flex-shrink-0 rounded-lg flex items-center justify-center ${
                  perfil.rol === 'ADMIN' ? 'bg-purple-100' : 'bg-blue-100'
                }`}>
                  {perfil.rol === 'ADMIN' ? (
                    <Shield className={`w-6 h-6 text-purple-600`} />
                  ) : (
                    <User className={`w-6 h-6 text-blue-600`} />
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    perfil.rol === 'ADMIN'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {perfil.rol}
                  </span>
                  <button
                    onClick={() => handleEditClick(perfil)}
                    disabled={loadingEditUserId !== null || deletingUserId !== null}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-70"
                    title="Editar usuario"
                  >
                    {loadingEditUserId === perfil.user_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Edit className="w-4 h-4" />
                    )}
                  </button>
                  {perfil.rol === 'OPERADOR' ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={perfil.activo !== false}
                      onClick={() =>
                        perfil.activo !== false
                          ? handleDeleteClick(perfil)
                          : handleReactivateClick(perfil)
                      }
                      disabled={deletingUserId !== null || reactivatingUserId !== null}
                      className={`bo-status-toggle disabled:cursor-wait ${
                        perfil.activo !== false ? 'is-activo' : 'is-inactivo'
                      }`}
                      title={perfil.activo !== false ? 'Dar de baja usuario' : 'Reactivar usuario'}
                    >
                      <span className="bo-status-toggle-track">
                        <span className="bo-status-toggle-knob">
                          {(deletingUserId === perfil.user_id ||
                            reactivatingUserId === perfil.user_id) && (
                            <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                          )}
                        </span>
                      </span>
                      <span className="bo-status-toggle-label">
                        {perfil.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                  ) : (
                    <span
                      className="bo-status-toggle bo-status-toggle--static is-activo"
                      title="Los administradores no se pueden desactivar"
                    >
                      <span className="bo-status-toggle-track">
                        <span className="bo-status-toggle-knob" />
                      </span>
                      <span className="bo-status-toggle-label">Activo</span>
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-gray-900 mb-2">{perfil.nombre}</h3>
              

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
            <div className="bo-form-grid-2">
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
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="bo-auth-input--toggle w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="bo-auth-input-toggle"
                    aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter password={newPassword} />
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

            <div className="bo-form-actions pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewEmail('');
                  setNewPassword('');
                  setNewNombre('');
                  setNewRol('OPERADOR');
                }}
                className="px-4 py-2 bo-btn-cancel rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !canCreateUser}
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
              <div className="relative">
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => {
                    setEditEmail(e.target.value);
                    if (editEmailError) setEditEmailError(false);
                  }}
                  required
                  disabled={editEmailLoading}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-wait"
                  placeholder={editEmailLoading ? 'Cargando email…' : 'usuario@hotel.com'}
                />
                {editEmailLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>
              {editEmailError ? (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  No se pudo cargar el email actual. Verifíquelo antes de guardar.
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Este será el email que el usuario use para iniciar sesión
                </p>
              )}
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

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Nueva contraseña (opcional)
              </label>
              <div className="relative">
                <input
                  type={showEditPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="bo-auth-input--toggle w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Complete solo si desea cambiarla"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword((v) => !v)}
                  className="bo-auth-input-toggle"
                  aria-label={showEditPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthMeter password={editPassword} />
            </div>

            <div className="bo-form-actions pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingPerfil(null);
                  setEditPassword('');
                }}
                className="px-4 py-2 bo-btn-cancel rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editing || editEmailLoading || !canUpdatePassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editing ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeletePerfil.open}
        onOpenChange={handleDeleteDialogOpenChange}
        onConfirm={confirmDeleteUser}
        title="Dar de baja usuario"
        description={
          confirmDeletePerfil.perfil
            ? `¿Está seguro de dar de baja al usuario "${confirmDeletePerfil.perfil.nombre}"? Perderá el acceso al sistema, pero podrá reactivarlo más adelante desde la pestaña Inactivos.`
            : ''
        }
        confirmText={deletingUserId ? 'Dando de baja...' : 'Dar de baja'}
        cancelText="Cancelar"
        variant="destructive"
      />

      <ConfirmDialog
        open={confirmReactivatePerfil.open}
        onOpenChange={(open) => setConfirmReactivatePerfil({ open, perfil: open ? confirmReactivatePerfil.perfil : null })}
        onConfirm={confirmReactivateUser}
        title="Reactivar usuario"
        description={
          confirmReactivatePerfil.perfil
            ? `¿Desea reactivar al usuario "${confirmReactivatePerfil.perfil.nombre}"? Volverá a tener acceso al sistema con su rol de operador.`
            : ''
        }
        confirmText={reactivatingUserId ? 'Reactivando...' : 'Reactivar'}
        cancelText="Cancelar"
        variant="default"
      />
    </div>
  );
}
