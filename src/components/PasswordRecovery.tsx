import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { hasNonWhitespaceValue } from '../utils/formSanitizers';

type PasswordRecoveryProps = {
  hasRecoverySession: boolean;
  onBackToLogin: () => void;
  onPasswordUpdated: (message: string) => void;
};

export function PasswordRecovery({
  hasRecoverySession,
  onBackToLogin,
  onPasswordUpdated,
}: PasswordRecoveryProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const passwordMismatch = useMemo(() => {
    if (!hasNonWhitespaceValue(confirmPassword)) return false;
    return password !== confirmPassword;
  }, [confirmPassword, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!hasRecoverySession) {
      setMessage({
        type: 'error',
        text: 'El enlace de recuperación no es válido o ya expiró. Solicitá uno nuevo.',
      });
      return;
    }

    if (!hasNonWhitespaceValue(password) || !hasNonWhitespaceValue(confirmPassword)) {
      setMessage({
        type: 'error',
        text: 'Completá ambos campos para actualizar la contraseña.',
      });
      return;
    }

    if (password.length < 6) {
      setMessage({
        type: 'error',
        text: 'La nueva contraseña debe tener al menos 6 caracteres.',
      });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({
        type: 'error',
        text: 'Las contraseñas no coinciden.',
      });
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMessage({
        type: 'success',
        text: 'La contraseña se actualizó correctamente.',
      });

      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.warn('Password recovery sign out warning:', signOutError);
      }

      onPasswordUpdated('La contraseña se actualizó correctamente. Ya podés iniciar sesión.');
    } catch (err: any) {
      console.error('Password recovery error:', err);
      setMessage({
        type: 'error',
        text: err?.message || 'No se pudo actualizar la contraseña.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-gray-900 mb-2">Crear Nueva Contraseña</h1>
            <p className="text-gray-600">
              Ingresá la nueva contraseña y repetila para confirmar el cambio.
            </p>
          </div>

          {!hasRecoverySession && !message && (
            <div className="flex items-start gap-2 p-3 rounded-lg mb-6 bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">
                El enlace de recuperación no es válido o ya expiró. Solicitá uno nuevo desde el inicio de sesión.
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

          {hasRecoverySession && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm text-gray-700 mb-1">
                  Nueva contraseña
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm text-gray-700 mb-1">
                  Repetir contraseña
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${
                    passwordMismatch
                      ? 'border-red-300 focus:ring-red-500'
                      : 'border-gray-300 focus:ring-blue-500'
                  }`}
                  placeholder="••••••••"
                />
                {passwordMismatch && (
                  <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
              </button>
            </form>
          )}

          <button
            onClick={onBackToLogin}
            className="w-full mt-4 text-sm text-gray-600 hover:text-gray-900"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    </div>
  );
}
