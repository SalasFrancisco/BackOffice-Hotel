import { useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Maximize2,
  Send,
} from 'lucide-react';
import { hasNonWhitespaceValue } from '../utils/formSanitizers';
import { ThemeToggle } from './ThemeToggle';
import { AuthBackgroundDecor } from './AuthBackgroundDecor';

type LoginProps = {
  onLoginSuccess: () => void;
  onLoginStart?: () => void;
  onLoginError?: () => void;
  authMessage?: { type: 'success' | 'error'; text: string } | null;
  // Si es false, la pantalla arranca en el formulario en vez de la portada
  // "Comenzar". Se usa al volver de un logout: el portal de despedida revela el
  // formulario (pantalla distinta) en vez de otra portada casi idéntica, que
  // producía un parpadeo por superposición.
  initialShowCover?: boolean;
};

// Convierte errores técnicos (sobre todo de red) en mensajes claros en usted.
const getFriendlyAuthError = (err: any, fallback: string) => {
  const raw = String(err?.message || err?.error_description || '');

  if (
    err?.name === 'AuthRetryableFetchError'
    || /failed to fetch|networkerror|network request failed|load failed/i.test(raw)
  ) {
    return 'No se pudo conectar con el servidor. Verifique su conexión a internet e intente nuevamente.';
  }

  if (/invalid login credentials/i.test(raw)) {
    return 'Email o contraseña incorrectos.';
  }

  return raw || fallback;
};

export function Login({
  onLoginSuccess,
  onLoginStart,
  onLoginError,
  authMessage = null,
  initialShowCover = true,
}: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);
  // Cara visible del flip: false = login, true = recuperación de contraseña.
  const [flipped, setFlipped] = useState(false);
  // Si llegamos acá con un mensaje (p. ej. "sesión cerrada por inactividad"),
  // mostramos la pantalla directo en vez de tapar el aviso con la portada.
  const [coverVisible, setCoverVisible] = useState(() => initialShowCover && !authMessage);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const visibleAuthMessage = authMessage?.text === error ? null : authMessage;

  const emailInputRef = useRef<HTMLInputElement>(null);
  const recoveryEmailInputRef = useRef<HTMLInputElement>(null);

  // Al quedar visible el formulario (portada cerrada), llevamos el foco al campo
  // de email correspondiente para cerrar el ciclo de accesibilidad de teclado.
  useEffect(() => {
    if (coverVisible || isOpening) return;
    const target = flipped ? recoveryEmailInputRef.current : emailInputRef.current;
    // Un frame de margen para no competir con la animación de flip.
    const raf = window.requestAnimationFrame(() => target?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [coverVisible, isOpening, flipped]);

  const goToRecovery = () => setFlipped(true);

  const backToLogin = () => {
    setFlipped(false);
    setRecoverySent(false);
    setRecoveryMessage('');
    setRecoveryEmail('');
  };

  const handleBeginLogin = () => {
    setIsClosing(false);
    setIsOpening(true);
  };

  const reopenCover = () => {
    setCoverVisible(true);
    setIsOpening(false);
    setIsClosing(true);
  };

  const handleCoverAnimationEnd = () => {
    if (isOpening) {
      setIsOpening(false);
      setCoverVisible(false);
    }
    if (isClosing) {
      setIsClosing(false);
    }
  };

  const parseServerResponse = async (response: Response) => {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  };

  const requestPasswordResetEmail = async (recoveryEmailTarget: string) => {
    const redirectUrl = new URL('/reservas/', window.location.origin);
    redirectUrl.searchParams.set('recovery', '1');

    const urls = [
      `https://${projectId}.supabase.co/functions/v1/server/request-password-reset`,
      `https://${projectId}.supabase.co/functions/v1/request-password-reset`,
      `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/request-password-reset`,
      `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/request-password-reset`,
    ];

    let lastPayload: any = { error: 'No se pudo contactar el servidor' };
    let lastStatus = 0;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            email: recoveryEmailTarget,
            redirectTo: redirectUrl.toString(),
          }),
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const emailSanitizado = email.trim();

    if (!hasNonWhitespaceValue(emailSanitizado) || !hasNonWhitespaceValue(password)) {
      setError('Complete email y contraseña válidos');
      setLoading(false);
      return;
    }

    try {
      // Avisamos que es un login interactivo real para que se muestre el
      // portal de bienvenida (y no en re-emisiones de sesión al cambiar de pestaña).
      onLoginStart?.();

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailSanitizado,
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

      if (perfil.activo === false) {
        await supabase.auth.signOut();
        throw new Error('Usuario dado de baja. Contacte al administrador.');
      }

      onLoginSuccess();
    } catch (err: any) {
      console.error('Login error:', err);
      onLoginError?.();
      setError(getFriendlyAuthError(err, 'Error al iniciar sesión'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryMessage('');
    setLoading(true);

    const recoveryEmailSanitizado = recoveryEmail.trim();

    if (!hasNonWhitespaceValue(recoveryEmailSanitizado)) {
      setRecoverySent(false);
      setRecoveryMessage('Ingrese un email válido');
      setLoading(false);
      return;
    }

    try {
      const { response, payload } = await requestPasswordResetEmail(recoveryEmailSanitizado);

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo enviar el email de recuperación');
      }

      setRecoverySent(true);
      setRecoveryMessage(
        'Si el email corresponde a un usuario válido, recibirá un enlace para cambiar la contraseña.',
      );
    } catch (err: any) {
      console.error('Recovery error:', err);
      setRecoverySent(false);
      setRecoveryMessage(getFriendlyAuthError(err, 'Error al enviar el email de recuperación'));
    } finally {
      setLoading(false);
    }
  };

  const renderWelcomeCover = () =>
    coverVisible && (
      <div className="bo-auth-cover-perspective-full">
        <div
          className={`bo-auth-cover-full${isOpening ? ' is-opening' : ''}${
            isClosing ? ' is-closing' : ''
          }`}
          onAnimationEnd={handleCoverAnimationEnd}
        >
          <AuthBackgroundDecor />
          <div className="bo-auth-cover-full-content">
            <img
              src="/QuintoCente.png"
              alt="Hotel Quinto Centenario"
              className="bo-auth-cover-full-logo"
            />
            <h2 className="bo-auth-cover-full-heading">Sistema de Gestión de Reservas</h2>
            <p className="bo-auth-cover-full-description">Hotel Quinto Centenario</p>
            <button type="button" onClick={handleBeginLogin} className="bo-auth-cover-cta">
              Comenzar
              <LogIn className="bo-auth-submit-icon" />
            </button>
          </div>
        </div>
      </div>
    );

  const loginFace = (
    <div className="bo-auth-card p-8">
      <div className="text-center mb-8">
        <h2 className="text-gray-900 mb-2">Hotel Back-Office</h2>
        <p className="text-gray-600">Ingrese sus credenciales para continuar</p>
      </div>

      {visibleAuthMessage && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg mb-6 ${
            visibleAuthMessage.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {visibleAuthMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <p
            className={`text-sm ${
              visibleAuthMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
            }`}
          >
            {visibleAuthMessage.text}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="bo-auth-label">
            Email
          </label>
          <div className="bo-auth-input-group">
            <Mail className="bo-auth-input-icon" />
            <input
              ref={emailInputRef}
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bo-auth-input w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="correo@ejemplo.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="bo-auth-label">
            Contraseña
          </label>
          <div className="bo-auth-input-group">
            <Lock className="bo-auth-input-icon" />
            <input
              id="password"
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
        </div>

        <button type="submit" disabled={loading} className="bo-auth-submit">
          <LogIn className="bo-auth-submit-icon" />
          {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
        </button>
      </form>

      <button type="button" onClick={goToRecovery} className="bo-auth-link">
        ¿Olvidó su contraseña?
      </button>
    </div>
  );

  const recoveryFace = (
    <div className="bo-auth-card p-8">
      <div className="text-center mb-8">
        <h2 className="text-gray-900 mb-2">Recuperar Contraseña</h2>
        <p className="text-gray-600">Ingrese su email para recibir instrucciones</p>
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
            <label htmlFor="recovery-email" className="bo-auth-label">
              Email
            </label>
            <div className="bo-auth-input-group">
              <Mail className="bo-auth-input-icon" />
              <input
                ref={recoveryEmailInputRef}
                id="recovery-email"
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                required
                className="bo-auth-input w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="bo-auth-submit">
            <Send className="bo-auth-submit-icon" />
            {loading ? 'Enviando...' : 'Enviar Email de Recuperación'}
          </button>
        </form>
      )}

      <button type="button" onClick={backToLogin} className="bo-auth-link">
        Volver al inicio de sesión
      </button>
    </div>
  );

  return (
    <div className="bo-auth-shell">
      <div className="bo-auth-brand-panel">
        <AuthBackgroundDecor />
        <button
          type="button"
          onClick={reopenCover}
          className="bo-auth-expand-btn"
          aria-label="Ver presentación en pantalla completa"
          title="Ver presentación"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <div className="bo-auth-brand-content">
          <img src="/QuintoCente.png" alt="Hotel Quinto Centenario" className="bo-auth-brand-logo" />
          <span className="bo-auth-brand-eyebrow">Back-Office</span>
          <h1 className="bo-auth-brand-heading">Sistema de Gestión de Reservas</h1>
          <p className="bo-auth-brand-description">
            {flipped
              ? 'Recupere el acceso a su cuenta para seguir gestionando las reservas del hotel.'
              : 'Acceda al sistema de gestión de reservas del Hotel Quinto Centenario.'}
          </p>
        </div>
      </div>
      <div className="bo-auth-form-panel">
        <div className="bo-auth-form-panel-toggle">
          <ThemeToggle />
        </div>

        <div className="bo-auth-flip-perspective bo-page-transition w-full max-w-md">
          <div className={`bo-auth-flip${flipped ? ' is-flipped' : ''}`}>
            <div className="bo-auth-flip-face bo-auth-flip-front" aria-hidden={flipped}>
              {loginFace}
            </div>
            <div className="bo-auth-flip-face bo-auth-flip-back" aria-hidden={!flipped}>
              {recoveryFace}
            </div>
          </div>
        </div>
      </div>
      {renderWelcomeCover()}
    </div>
  );
}
