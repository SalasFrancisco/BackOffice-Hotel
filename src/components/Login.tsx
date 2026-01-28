import { useState } from 'react';
import { supabase } from '../utils/supabase/client';
import { AlertCircle, CheckCircle } from 'lucide-react';

type LoginProps = {
  onLoginSuccess: () => void;
};

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Check if user has a profile
      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (perfilError) {
        console.error('Error loading perfil:', perfilError);
        throw new Error('Usuario sin perfil asignado. Contacte al administrador.');
      }

      if (!perfil) {
        throw new Error('Usuario sin perfil asignado. Contacte al administrador.');
      }

      onLoginSuccess();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryMessage('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
        redirectTo: window.location.origin,
      });

      if (error) throw error;

      setRecoverySent(true);
      setRecoveryMessage('Se ha enviado un email con instrucciones para recuperar tu contraseña.');
    } catch (err: any) {
      console.error('Recovery error:', err);
      setRecoveryMessage(err.message || 'Error al enviar el email de recuperación');
    } finally {
      setLoading(false);
    }
  };

  if (showRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-gray-900 mb-2">Recuperar Contraseña</h1>
              <p className="text-gray-600">Ingresa tu email para recibir instrucciones</p>
            </div>

            {recoveryMessage && (
              <div
                className={`flex items-start gap-2 p-3 rounded-lg mb-6 ${
                  recoverySent
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                {recoverySent ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                )}
                <p className={`text-sm ${recoverySent ? 'text-green-800' : 'text-red-800'}`}>
                  {recoveryMessage}
                </p>
              </div>
            )}

            {!recoverySent && (
              <form onSubmit={handlePasswordRecovery} className="space-y-4">
                <div>
                  <label htmlFor="recovery-email" className="block text-sm text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    id="recovery-email"
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="tu@email.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Enviando...' : 'Enviar Email de Recuperación'}
                </button>
              </form>
            )}

            <button
              onClick={() => {
                setShowRecovery(false);
                setRecoverySent(false);
                setRecoveryMessage('');
                setRecoveryEmail('');
              }}
              className="w-full mt-4 text-sm text-gray-600 hover:text-gray-900"
            >
              Volver al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-gray-900 mb-2">Hotel Back-Office</h1>
            <p className="text-gray-600">Sistema de Gestión de Reservas</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-gray-700 mb-1">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          <button
            onClick={() => setShowRecovery(true)}
            className="w-full mt-4 text-sm text-gray-600 hover:text-gray-900"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>
    </div>
  );
}
