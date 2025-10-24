import { useState, useEffect } from 'react';
import { supabase, Perfil } from './utils/supabase/client';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Reservas } from './components/Reservas';
import { Salones } from './components/Salones';
import { SalonEdit } from './components/SalonEdit';
import { ServiciosAdicionales } from './components/ServiciosAdicionales';
import { Usuarios } from './components/Usuarios';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [editingSalonId, setEditingSalonId] = useState<number | null>(null);
  const [rlsError, setRlsError] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        if (import.meta.env.VITE_ALWAYS_LOGOUT_ON_START === 'true') {
          try {
            await supabase.auth.signOut();
          } catch (_) {
            // ignore
          }
          setSession(null);
          setPerfil(null);
        }
      } finally {
        await checkSession();
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadPerfil(session.user.id);
      } else {
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

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    setEditingSalonId(null);
  };

  const handleEditSalon = (salonId: number) => {
    setEditingSalonId(salonId);
  };

  const handleBackFromSalonEdit = () => {
    setEditingSalonId(null);
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
                  onClick={() => {
                    const sql = document.getElementById('fix-sql')?.textContent || '';
                    navigator.clipboard.writeText(sql);
                    alert('SQL copiado al portapapeles');
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
    return <Login onLoginSuccess={checkSession} />;
  }

  const renderPage = () => {
    // Si estamos editando un salón, mostrar la página de edición
    if (editingSalonId !== null && currentPage === 'salones') {
      return <SalonEdit salonId={editingSalonId} onBack={handleBackFromSalonEdit} />;
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'reservas':
        return <Reservas />;
      case 'salones':
        return <Salones perfil={perfil} onEditSalon={handleEditSalon} />;
      case 'servicios':
        return <ServiciosAdicionales perfil={perfil} />;
      case 'usuarios':
        return perfil.rol === 'ADMIN' ? <Usuarios /> : <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      perfil={perfil}
      onLogout={handleLogout}
    >
      {renderPage()}
    </Layout>
  );
}
