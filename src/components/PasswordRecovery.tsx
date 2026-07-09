import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { hasNonWhitespaceValue } from '../utils/formSanitizers';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import { ThemeToggle } from './ThemeToggle';
import { AuthBackgroundDecor } from './AuthBackgroundDecor';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

// Traduce a "usted" los errores técnicos de Supabase al actualizar la contraseña.
const getFriendlyPasswordError = (err: any): string => {
  const raw = String(err?.message || '').toLowerCase();
  if (/failed to fetch|networkerror|network request failed|load failed/.test(raw) || err?.name === 'AuthRetryableFetchError') {
    return 'No se pudo conectar con el servidor. Verifique su conexión e intente nuevamente.';
  }
  if (/different from the old password|should be different/.test(raw)) {
    return 'La nueva contraseña debe ser distinta a la anterior.';
  }
  if (/password/.test(raw) && /(weak|at least|should be|characters|requirements)/.test(raw)) {
    return PASSWORD_POLICY_MESSAGE;
  }
  if (/expired|invalid|token|session/.test(raw)) {
    return 'El enlace de recuperación no es válido o ya expiró. Solicite uno nuevo.';
  }
  return err?.message || 'No se pudo actualizar la contraseña.';
};

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
        text: 'El enlace de recuperación no es válido o ya expiró. Solicite uno nuevo.',
      });
      return;
    }

    if (!hasNonWhitespaceValue(password) || !hasNonWhitespaceValue(confirmPassword)) {
      setMessage({
        type: 'error',
        text: 'Complete ambos campos para actualizar la contraseña.',
      });
      return;
    }

    if (!isValidPassword(password)) {
      setMessage({ type: 'error', text: PASSWORD_POLICY_MESSAGE });
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

      // Si el usuario tenía pendiente el cambio por política, queda saldado.
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id) {
          await supabase
            .from('perfiles')
            .update({ requiere_cambio_password: false, cambio_password_limite: null })
            .eq('user_id', userData.user.id);
        }
      } catch (flagError) {
        console.warn('No se pudo limpiar requiere_cambio_password tras recuperación:', flagError);
      }

      setMessage({
        type: 'success',
        text: 'La contraseña se actualizó correctamente.',
      });

      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.warn('Password recovery sign out warning:', signOutError);
      }

      onPasswordUpdated('La contraseña se actualizó correctamente. Ya puede iniciar sesión.');
    } catch (err: any) {
      console.error('Password recovery error:', err);
      setMessage({
        type: 'error',
        text: getFriendlyPasswordError(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bo-auth-shell">
      <div className="bo-auth-brand-panel">
        <AuthBackgroundDecor />
        <div className="bo-auth-brand-content">
          <img src="/QuintoCente.png" alt="Hotel Quinto Centenario" className="bo-auth-brand-logo" />
          <span className="bo-auth-brand-eyebrow">Back-Office</span>
          <h1 className="bo-auth-brand-heading">Sistema de Gestión de Reservas</h1>
          <p className="bo-auth-brand-description">
            Defina una nueva contraseña para volver a acceder al sistema.
          </p>
        </div>
      </div>
      <div className="bo-auth-form-panel">
        <div className="bo-auth-form-panel-toggle">
          <ThemeToggle />
        </div>
        <div className="bo-auth-card bo-page-transition w-full max-w-md p-8">
          <div className="text-center mb-8">
            <h2 className="text-gray-900 mb-2">Crear Nueva Contraseña</h2>
            <p className="text-gray-600">
              Ingrese la nueva contraseña y repítala para confirmar el cambio.
            </p>
          </div>

          {!hasRecoverySession && !message && (
            <div className="flex items-start gap-2 p-3 rounded-lg mb-6 bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">
                El enlace de recuperación no es válido o ya expiró. Solicite uno nuevo desde el inicio de sesión.
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
                <label htmlFor="new-password" className="bo-auth-label">
                  Nueva contraseña
                </label>
                <div className="bo-auth-input-group">
                  <Lock className="bo-auth-input-icon" />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bo-auth-input bo-auth-input--toggle w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="bo-auth-input-toggle"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter password={password} />
              </div>

              <div>
                <label htmlFor="confirm-password" className="bo-auth-label">
                  Repetir contraseña
                </label>
                <div className="bo-auth-input-group">
                  <Lock className="bo-auth-input-icon" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={`bo-auth-input bo-auth-input--toggle w-full px-4 py-2 border focus:ring-2 focus:border-transparent ${
                      passwordMismatch
                        ? 'border-red-300 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="bo-auth-input-toggle"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordMismatch && (
                  <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden.</p>
                )}
              </div>

              <button type="submit" disabled={loading} className="bo-auth-submit">
                <KeyRound className="bo-auth-submit-icon" />
                {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
              </button>
            </form>
          )}

          <button onClick={onBackToLogin} className="bo-auth-link">
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    </div>
  );
}
