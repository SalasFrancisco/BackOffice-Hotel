import { useState, useEffect, useRef } from 'react';
import { supabase, Perfil } from './utils/supabase/client';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Reservas } from './components/Reservas';
import { Salones } from './components/Salones';
import { SalonEdit } from './components/SalonEdit';
import { ServiciosAdicionales } from './components/ServiciosAdicionales';
import { Usuarios } from './components/Usuarios';
import { ConfirmDialog } from './components/ConfirmDialog';
import { InfoDialog } from './components/InfoDialog';
import { PasswordRecovery } from './components/PasswordRecovery';

type NavigationRequest = {
  page: string;
  reservaId?: number | null;
};

const isPasswordRecoveryUrl = () => {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('recovery') === '1') {
    return true;
  }

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) {
    return false;
  }

  const hashParams = new URLSearchParams(hash);
  return hashParams.get('type') === 'recovery';
};

const clearPasswordRecoveryUrl = () => {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('recovery');
  nextUrl.hash = '';
  window.history.replaceState({}, document.title, nextUrl.toString());
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'password-recovery'>(() =>
    isPasswordRecoveryUrl() ? 'password-recovery' : 'login',
  );
  const [authFeedbackMessage, setAuthFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(() => {
    const win = window as any;
    const initial = typeof win.__INITIAL_PAGE__ === 'string' ? win.__INITIAL_PAGE__ : '';
    if (initial) {
      return initial;
    }
    const hashPage = window.location.hash.replace('#', '');
    return hashPage || 'dashboard';
  });
  const [editingSalonId, setEditingSalonId] = useState<number | null>(null);
  const [rlsError, setRlsError] = useState(false);
  const [hasUnsavedFormChanges, setHasUnsavedFormChanges] = useState(false);
  const [pendingNavigationRequest, setPendingNavigationRequest] = useState<NavigationRequest | null>(null);
  const [reservaHighlightRequest, setReservaHighlightRequest] = useState<{ reservaId: number; nonce: number } | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [copySqlFeedbackMessage, setCopySqlFeedbackMessage] = useState('');
  const [showCopySqlFeedbackDialog, setShowCopySqlFeedbackDialog] = useState(false);
  const recoveryFlowActiveRef = useRef(isPasswordRecoveryUrl());

  useEffect(() => {
    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === 'PASSWORD_RECOVERY') {
        recoveryFlowActiveRef.current = true;
        setAuthMode('password-recovery');
        setAuthFeedbackMessage(null);
        setLoading(false);
        return;
      }

      if (recoveryFlowActiveRef.current) {
        if (event === 'SIGNED_OUT') {
          recoveryFlowActiveRef.current = false;
          setAuthMode('login');
          clearPasswordRecoveryUrl();
        }
        setPerfil(null);
        setLoading(false);
        return;
      }

      if (session) {
        setAuthMode('login');
        setAuthFeedbackMessage(null);
        void loadPerfil(session.user.id);
      } else {
        setAuthMode('login');
        setPerfil(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);

      if (recoveryFlowActiveRef.current) {
        setPerfil(null);
        return;
      }

      if (currentSession) {
        try {
          const { data, error } = await supabase
            .from('perfiles')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .single();

          if (error) {
            console.error('Error loading perfil:', error);
            
            // Check for infinite recursion error
            if (error.code === '42P17' || error.message?.includes('infinite recursion')) {
              setRlsError(true);
              await supabase.auth.signOut();
              setSession(null);
              return;
            }
            
            throw error;
          }
          setPerfil(data);
        } catch (err: any) {
          console.error('Error in checkSession:', err);
          setPerfil(null);
        }
      } else {
        setPerfil(null);
      }
    } catch (err) {
      console.error('Error checking session:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPerfil = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error loading perfil:', error);
        
        // Check if it's the infinite recursion error
        if (error.code === '42P17' || error.message?.includes('infinite recursion')) {
          throw new Error('RLS_RECURSION_ERROR');
        }
        
        throw error;
      }
      setPerfil(data);
    } catch (err: any) {
      console.error('Error loading perfil:', err);
      
      // Store the error type for display
      if (err.message === 'RLS_RECURSION_ERROR') {
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }
      
      setPerfil(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPerfil(null);
    setCurrentPage('dashboard');
  };

  const executeNavigation = ({ page, reservaId }: NavigationRequest) => {
    setCurrentPage(page);
    setEditingSalonId(null);

    if (page === 'reservas' && reservaId) {
      setReservaHighlightRequest({ reservaId, nonce: Date.now() });
    } else if (page !== 'reservas') {
      setReservaHighlightRequest(null);
    }
  };

  const handleNavigate = (page: string, options?: { reservaId?: number | null }) => {
    const request: NavigationRequest = { page, reservaId: options?.reservaId ?? null };
    const isPageChange = page !== currentPage;
    const hasReservaTarget = Boolean(options?.reservaId);

    if (!isPageChange && !hasReservaTarget) return;

    if (isPageChange && hasUnsavedFormChanges) {
      setPendingNavigationRequest(request);
      setShowUnsavedChangesDialog(true);
      return;
    }

    executeNavigation(request);
  };

  const confirmNavigationWithoutSaving = () => {
    if (!pendingNavigationRequest) return;
    executeNavigation(pendingNavigationRequest);
    setHasUnsavedFormChanges(false);
    setPendingNavigationRequest(null);
    setShowUnsavedChangesDialog(false);
  };

  const handleUnsavedDialogOpenChange = (open: boolean) => {
    setShowUnsavedChangesDialog(open);
    if (!open) {
      setPendingNavigationRequest(null);
    }
  };

  const handleEditSalon = (salonId: number) => {
    setEditingSalonId(salonId);
  };

  const handleBackFromSalonEdit = () => {
    setEditingSalonId(null);
  };

  const handleBackToLoginFromRecovery = async () => {
    recoveryFlowActiveRef.current = false;
    clearPasswordRecoveryUrl();
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.warn('Recovery sign out warning:', signOutError);
    }
    setSession(null);
    setPerfil(null);
    setAuthMode('login');
    setAuthFeedbackMessage(null);
  };

  const handlePasswordUpdated = (message: string) => {
    recoveryFlowActiveRef.current = false;
    clearPasswordRecoveryUrl();
    setSession(null);
    setPerfil(null);
    setAuthMode('login');
    setAuthFeedbackMessage({ type: 'success', text: message });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (authMode === 'password-recovery') {
    return (
      <PasswordRecovery
        hasRecoverySession={Boolean(session)}
        onBackToLogin={handleBackToLoginFromRecovery}
        onPasswordUpdated={handlePasswordUpdated}
      />
    );
  }

  if (rlsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-red-900 mb-2">Error de Configuración de Base de Datos</h1>
              <p className="text-red-700">
                Se detectó un error de recursión infinita en las políticas RLS de Supabase.
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Acción requerida:</strong> Debes ejecutar el siguiente SQL en Supabase para corregir las políticas.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-gray-900 mb-2">Pasos para solucionar:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Ve a <strong>Supabase Dashboard</strong> → <strong>SQL Editor</strong></li>
                <li>Copia el SQL de abajo y pégalo en el editor</li>
                <li>Haz clic en <strong>Run</strong> (Ejecutar)</li>
                <li>Recarga esta página (F5)</li>
              </ol>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-gray-900">SQL a ejecutar:</h4>
                <button
                  onClick={async () => {
                    const sql = document.getElementById('fix-sql')?.textContent || '';
                    try {
                      await navigator.clipboard.writeText(sql);
                      setCopySqlFeedbackMessage('SQL copiado al portapapeles.');
                    } catch (clipboardError) {
                      console.error('Error copying SQL to clipboard:', clipboardError);
                      setCopySqlFeedbackMessage('No se pudo copiar el SQL. Copialo manualmente.');
                    }
                    setShowCopySqlFeedbackDialog(true);
                  }}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Copiar SQL
                </button>
              </div>
              <pre id="fix-sql" className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs">
{`-- Fix infinite recursion in RLS policies
DROP POLICY IF EXISTS admin_all_perfiles ON public.perfiles;
DROP POLICY IF EXISTS users_read_own_perfil ON public.perfiles;
DROP POLICY IF EXISTS users_read_all_perfiles ON public.perfiles;
DROP POLICY IF EXISTS authenticated_read_perfiles ON public.perfiles;
DROP POLICY IF EXISTS users_update_own_perfil ON public.perfiles;
DROP POLICY IF EXISTS service_role_all_perfiles ON public.perfiles;

-- Create policies without recursion
CREATE POLICY "authenticated_read_perfiles" ON public.perfiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_update_own_perfil" ON public.perfiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all_perfiles" ON public.perfiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);`}
              </pre>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-blue-900 mb-2">¿Qué causó este error?</h4>
              <p className="text-sm text-blue-800">
                Las políticas RLS anteriores intentaban verificar permisos consultando la misma tabla <code className="bg-blue-200 px-1 rounded">perfiles</code> que estaban protegiendo, 
                creando un ciclo infinito. Las nuevas políticas eliminan esta recursión.
              </p>
            </div>

            <button
              onClick={() => {
                setRlsError(false);
                window.location.reload();
              }}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Ya ejecuté el SQL - Recargar página
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session || !perfil) {
    return <Login onLoginSuccess={checkSession} authMessage={authFeedbackMessage} />;
  }

  const renderPage = () => {
    // Si estamos editando un salón, mostrar la página de edición
    if (editingSalonId !== null && currentPage === 'salones') {
      return <SalonEdit salonId={editingSalonId} onBack={handleBackFromSalonEdit} />;
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard perfil={perfil} />;
      case 'reservas':
        return (
          <Reservas
            perfil={perfil}
            onUnsavedChangesChange={setHasUnsavedFormChanges}
            highlightRequest={reservaHighlightRequest}
          />
        );
      case 'salones':
        return <Salones perfil={perfil} onEditSalon={handleEditSalon} />;
      case 'servicios':
        return <ServiciosAdicionales perfil={perfil} />;
      case 'usuarios':
        return perfil.rol === 'ADMIN' ? <Usuarios /> : <Dashboard perfil={perfil} />;
      default:
        return <Dashboard perfil={perfil} />;
    }
  };

  return (
    <>
      <Layout
        currentPage={currentPage}
        onNavigate={handleNavigate}
        perfil={perfil}
        onLogout={handleLogout}
      >
        {renderPage()}
      </Layout>

      <ConfirmDialog
        open={showUnsavedChangesDialog}
        onOpenChange={handleUnsavedDialogOpenChange}
        onConfirm={confirmNavigationWithoutSaving}
        title="Cambios sin guardar"
        description="¿Está seguro que quiere cambiar de pestaña sin guardar los cambios?"
        confirmText="Cambiar pestaña"
        cancelText="Continuar editando"
        variant="default"
      />

      <InfoDialog
        open={showCopySqlFeedbackDialog}
        onOpenChange={setShowCopySqlFeedbackDialog}
        title="Portapapeles"
        description={copySqlFeedbackMessage}
        actionText="Cerrar"
      />
    </>
  );
}
