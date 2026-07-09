import { useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { supabase, type Perfil } from '../utils/supabase/client';
import { hasNonWhitespaceValue } from '../utils/formSanitizers';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import { ThemeToggle } from './ThemeToggle';
import { AuthBackgroundDecor } from './AuthBackgroundDecor';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

// 'forced'    → plazo vencido, obligatorio (sin cancelar)
// 'pending'   → dentro del plazo, por seguridad (con "Más tarde")
// 'voluntary' → el usuario elige cambiarla (con "Cancelar")
export type PasswordChangeMode = 'forced' | 'pending' | 'voluntary';

type ForcedPasswordChangeProps = {
  perfil: Perfil;
  mode: PasswordChangeMode;
  daysRemaining?: number | null;
  onCancel?: () => void;
  onCompleted: () => void;
};

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
  return err?.message || 'No se pudo actualizar la contraseña.';
};

// Pantalla de cambio de contraseña. Según `mode`:
//   'forced'    → plazo vencido, no puede continuar (sin "más tarde").
//   'pending'   → aún dentro del plazo, sugerido por seguridad ("Más tarde").
//   'voluntary' → el usuario elige cambiarla (neutro, "Cancelar").
export function ForcedPasswordChange({ perfil, mode, daysRemaining, onCancel, onCompleted }: ForcedPasswordChangeProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const mismatch = hasNonWhitespaceValue(confirmPassword) && password !== confirmPassword;

  const mandatory = mode === 'forced';
  const voluntary = mode === 'voluntary';
  const brandHeading = voluntary ? 'Cambie su contraseña' : 'Seguridad de la cuenta';
  const brandDescription = voluntary
    ? 'Defina una nueva contraseña para el acceso a su cuenta.'
    : 'Por seguridad debe definir una nueva contraseña que cumpla con los requisitos actuales.';
  const cardTitle = voluntary ? 'Cambiar contraseña' : 'Actualice su contraseña';
  const remainingText =
    daysRemaining != null
      ? daysRemaining <= 0
        ? ' El plazo vence hoy.'
        : ` Le ${daysRemaining === 1 ? 'queda 1 día' : `quedan ${daysRemaining} días`}.`
      : '';
  const cardSubtitle = mandatory
    ? 'El plazo para cambiar su contraseña venció. Debe actualizarla para continuar.'
    : voluntary
      ? 'Ingrese una nueva contraseña que cumpla con los requisitos de seguridad.'
      : `Por política de seguridad, defina una nueva contraseña.${remainingText}`;
  const cancelLabel = voluntary ? 'Cancelar' : 'Más tarde';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!isValidPassword(password)) {
      setMessage({ type: 'error', text: PASSWORD_POLICY_MESSAGE });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // La política se cumplió → quitamos el requerimiento de cambio.
      const { error: clearError } = await supabase
        .from('perfiles')
        .update({ requiere_cambio_password: false, cambio_password_limite: null })
        .eq('user_id', perfil.user_id);
      if (clearError) {
        console.warn('Contraseña cambiada, pero no se pudo limpiar el flag:', clearError);
      }

      setMessage({ type: 'success', text: 'Contraseña actualizada correctamente.' });
      onCompleted();
    } catch (err: any) {
      console.error('Forced password change error:', err);
      setMessage({ type: 'error', text: getFriendlyPasswordError(err) });
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
          <h1 className="bo-auth-brand-heading">{brandHeading}</h1>
          <p className="bo-auth-brand-description">{brandDescription}</p>
        </div>
      </div>
      <div className="bo-auth-form-panel">
        <div className="bo-auth-form-panel-toggle">
          <ThemeToggle />
        </div>
        <div className="bo-auth-card bo-page-transition w-full max-w-md p-8">
          <div className="text-center mb-6">
            <span className={`${voluntary ? 'bo-dialog-info-icon' : 'bo-dialog-warning-icon'} mx-auto mb-3`}>
              {voluntary ? <KeyRound className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
            </span>
            <h2 className="text-gray-900 mb-2">{cardTitle}</h2>
            <p className="text-gray-600 text-sm">{cardSubtitle}</p>
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forced-password" className="bo-auth-label">Nueva contraseña</label>
              <div className="bo-auth-input-group">
                <Lock className="bo-auth-input-icon" />
                <input
                  id="forced-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bo-auth-input bo-auth-input--toggle w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="bo-auth-input-toggle"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthMeter password={password} />
            </div>

            <div>
              <label htmlFor="forced-confirm" className="bo-auth-label">Repetir contraseña</label>
              <div className="bo-auth-input-group">
                <Lock className="bo-auth-input-icon" />
                <input
                  id="forced-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={`bo-auth-input bo-auth-input--toggle w-full px-4 py-2 border focus:ring-2 focus:border-transparent ${
                    mismatch ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="bo-auth-input-toggle"
                  aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mismatch && <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden.</p>}
            </div>

            <button type="submit" disabled={loading} className="bo-auth-submit">
              <KeyRound className="bo-auth-submit-icon" />
              {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
            </button>
          </form>

          {!mandatory && onCancel && (
            <button onClick={onCancel} className="bo-auth-link">
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
