import { useState, useEffect, useRef } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { supabase, Perfil } from './utils/supabase/client';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Reservas } from './components/Reservas';
import { Salones } from './components/Salones';
import { SalonEdit } from './components/SalonEdit';
import { ServiciosAdicionales } from './components/ServiciosAdicionales';
import { Usuarios } from './components/Usuarios';
import { Notificaciones } from './components/Notificaciones';
import { Perfil as PerfilPage } from './components/Perfil';
import { ConfirmDialog } from './components/ConfirmDialog';
import { InfoDialog } from './components/InfoDialog';
import { PasswordRecovery } from './components/PasswordRecovery';
import { ForcedPasswordChange } from './components/ForcedPasswordChange';
import { SessionPortalTransition } from './components/SessionPortalTransition';
import {
  SESSION_ACTIVITY_STORAGE_KEY,
  SESSION_INACTIVITY_WARNING_MS,
  clearSessionActivity,
  getSessionInactivityRemainingMs,
  isSessionInactive,
  recordSessionActivity,
  validateOrInitializeSessionActivity,
} from './utils/sessionActivity';
import { InactivityWarningDialog } from './components/InactivityWarningDialog';

type NavigationRequest = {
  page: string;
  reservaId?: number | null;
};

const NAVIGABLE_PAGES = new Set([
  'dashboard',
  'reservas',
  'salones',
  'servicios',
  'notificaciones',
  'perfil',
  'usuarios',
]);

const getPageFromUrl = () => {
  const hashPage = window.location.hash.replace(/^#/, '');
  return NAVIGABLE_PAGES.has(hashPage) ? hashPage : 'dashboard';
};

const replacePageInUrl = (page: string) => {
  const nextUrl = new URL(window.location.href);
  nextUrl.hash = page;
  window.history.replaceState(window.history.state, document.title, nextUrl.toString());
};

const isAdminRole = (rol?: string | null) => String(rol || '').toUpperCase() === 'ADMIN';
const isAdminOnlyPage = (page: string) => page === 'dashboard' || page === 'usuarios';

const getPasswordRecoveryTokenHash = () => {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('recovery') !== '1' || searchParams.get('type') !== 'recovery') {
    return null;
  }

  return searchParams.get('token_hash');
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

const clearPasswordRecoveryTokenFromUrl = () => {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('token_hash');
  nextUrl.searchParams.delete('type');
  window.history.replaceState({}, document.title, nextUrl.toString());
};

const clearPasswordRecoveryUrl = () => {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('recovery');
  nextUrl.searchParams.delete('token_hash');
  nextUrl.searchParams.delete('type');
  nextUrl.hash = '';
  window.history.replaceState({}, document.title, nextUrl.toString());
};

const INACTIVE_USER_MESSAGE = 'Usuario dado de baja. Contacte al administrador.';
// Mensaje único para cualquier fin de sesión involuntario (inactividad de 15 min
// o expiración/refresh fallido del token de Supabase), para no confundir al usuario
// con dos textos distintos según el camino por el que cae.
const SESSION_ENDED_MESSAGE = 'Su sesión expiró. Inicie sesión nuevamente.';
const PERFIL_LOAD_ERROR_MESSAGE = 'No se pudo cargar su perfil. Vuelva a iniciar sesión.';

const isPerfilActivo = (perfil?: Perfil | null) => perfil?.activo !== false;

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
    // La home natural es el Dashboard. Un deep-link por hash (#salones, etc.) tiene
    // prioridad. Los OPERADOR se redirigen a 'reservas' por el guard de rol
    // (isAdminOnlyPage), tanto en el render como en el efecto, así que igual
    // aterrizan en su pantalla correcta.
    return getPageFromUrl();
  });
  // Historial de navegación interno (para las flechas atrás/adelante del sistema).
  const [navState, setNavState] = useState<{ stack: string[]; index: number }>(() => {
    return { stack: [getPageFromUrl()], index: 0 };
  });
  const [editingSalonId, setEditingSalonId] = useState<number | null>(null);
  const [rlsError, setRlsError] = useState(false);
  const [hasUnsavedFormChanges, setHasUnsavedFormChanges] = useState(false);
  // Acción de navegación en espera de confirmar (cuando hay cambios sin guardar).
  const [pendingNavAction, setPendingNavAction] = useState<{ run: () => void } | null>(null);
  const [reservaHighlightRequest, setReservaHighlightRequest] = useState<{ reservaId: number; nonce: number } | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [copySqlFeedbackMessage, setCopySqlFeedbackMessage] = useState('');
  const [showCopySqlFeedbackDialog, setShowCopySqlFeedbackDialog] = useState(false);
  const [sessionPortal, setSessionPortal] = useState<
    { variant: 'enter' | 'exit'; message: string } | null
  >(null);
  // Segundos restantes mostrados en el aviso previo de inactividad (null = oculto).
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);
  // Al volver de un logout, la pantalla de login arranca en el formulario (no en la
  // portada "Comenzar"), para que el portal de despedida revele una pantalla distinta
  // y no otra portada casi idéntica (evita el parpadeo por superposición).
  const [loginStartsOnForm, setLoginStartsOnForm] = useState(false);
  // Cambio de contraseña por política de seguridad.
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [passwordWarningDismissed, setPasswordWarningDismissed] = useState(false);
  // Cambio de contraseña voluntario (cualquier rol, desde el menú).
  const [voluntaryChangeOpen, setVoluntaryChangeOpen] = useState(false);
  // Recordatorio (modal) que aparece una vez por sesión para contraseñas viejas.
  const [passwordReminderDismissed, setPasswordReminderDismissed] = useState(false);
  const recoveryFlowActiveRef = useRef(isPasswordRecoveryUrl());
  const recoveryTokenExchangePendingRef = useRef(Boolean(getPasswordRecoveryTokenHash()));
  const inactivityLogoutInProgressRef = useRef(false);
  const manualLogoutInProgressRef = useRef(false);
  // El portal de salida sólo se descarta cuando (a) terminó su animación mínima y
  // (b) el signOut realmente completó, para que no se descubra la app en redes lentas.
  const exitAnimDoneRef = useRef(false);
  const logoutSettledRef = useRef(false);
  // Se arma al recibir SIGNED_IN interactivo; el portal de bienvenida se dispara
  // recién cuando el perfil cargó, para mostrar el nombre sin parpadeo.
  const pendingWelcomePortalRef = useRef(false);
  // Lo reasigna el efecto de inactividad para que el diálogo de aviso pueda
  // "seguir conectado" reiniciando el contador.
  const stayConnectedRef = useRef<() => void>(() => {});
  // Solo se arma cuando el usuario inicia sesión de forma interactiva (click en
  // "Iniciar Sesión"). Supabase re-emite SIGNED_IN al volver el foco a la
  // pestaña o al refrescar el token; sin esta bandera el portal de bienvenida
  // aparecería cada vez que el usuario cambia de pestaña y vuelve.
  const interactiveLoginRef = useRef(false);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryFlowActiveRef.current = true;
        setSession(session);
        setAuthMode('password-recovery');
        setAuthFeedbackMessage(null);
        setLoading(false);
        return;
      }

      if (recoveryFlowActiveRef.current) {
        if (recoveryTokenExchangePendingRef.current && event === 'INITIAL_SESSION') {
          return;
        }

        if (event === 'SIGNED_OUT') {
          recoveryFlowActiveRef.current = false;
          clearSessionActivity();
          setAuthMode('login');
          clearPasswordRecoveryUrl();
        } else {
          setSession(session);
        }
        setPerfil(null);
        setLoading(false);
        return;
      }

      if (session) {
        if (!validateOrInitializeSessionActivity(session)) {
          setLoading(false);
          window.setTimeout(() => {
            void expireSessionForInactivity();
          }, 0);
          return;
        }

        if (event === 'SIGNED_IN' && interactiveLoginRef.current) {
          interactiveLoginRef.current = false;
          // El portal se dispara desde loadPerfil (una vez que hay nombre).
          pendingWelcomePortalRef.current = true;
        }

        setSession(session);
        setAuthMode('login');
        setAuthFeedbackMessage(null);
        void loadPerfil(session.user.id);
      } else {
        if (event === 'SIGNED_OUT') {
          clearSessionActivity();
          // SIGNED_OUT que no proviene de un logout manual ni del cierre por
          // inactividad = la sesión caducó sola (token/refresh de Supabase).
          // Mostramos el mismo mensaje que el cierre por inactividad.
          if (!manualLogoutInProgressRef.current && !inactivityLogoutInProgressRef.current) {
            setAuthFeedbackMessage({ type: 'error', text: SESSION_ENDED_MESSAGE });
          }
        }
        interactiveLoginRef.current = false;
        pendingWelcomePortalRef.current = false;
        setSession(null);
        setAuthMode('login');
        setPerfil(null);
      }
    });

    void initializeAuthentication();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const initializeAuthentication = async () => {
    const recoveryTokenHash = getPasswordRecoveryTokenHash();
    if (!recoveryTokenHash) {
      await checkSession();
      return;
    }

    recoveryFlowActiveRef.current = true;
    setAuthMode('password-recovery');
    setPerfil(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: recoveryTokenHash,
        type: 'recovery',
      });

      if (error) throw error;
      setSession(data.session);
    } catch (err) {
      console.error('Error verifying password recovery link:', err);
      setSession(null);
    } finally {
      recoveryTokenExchangePendingRef.current = false;
      clearPasswordRecoveryTokenFromUrl();
      setLoading(false);
    }
  };

  const checkSession = async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (recoveryFlowActiveRef.current) {
        setSession(currentSession);
        setPerfil(null);
        return;
      }

      if (currentSession) {
        if (!validateOrInitializeSessionActivity(currentSession)) {
          await expireSessionForInactivity();
          return;
        }

        setSession(currentSession);
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
          if (!isPerfilActivo(data)) {
            await supabase.auth.signOut();
            setSession(null);
            setPerfil(null);
            setAuthFeedbackMessage({ type: 'error', text: INACTIVE_USER_MESSAGE });
            return;
          }

          setPerfil(data);
        } catch (err: any) {
          console.error('Error in checkSession:', err);
          // Fallo transitorio al cargar el perfil: cerramos sesión con aviso en
          // lugar de dejar una sesión "a medias" que muestra el Login.
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            console.error('Error signing out after perfil load failure:', signOutErr);
          }
          setSession(null);
          setPerfil(null);
          setAuthFeedbackMessage({ type: 'error', text: PERFIL_LOAD_ERROR_MESSAGE });
        }
      } else {
        setSession(null);
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
      if (!isPerfilActivo(data)) {
        pendingWelcomePortalRef.current = false;
        await supabase.auth.signOut();
        setSession(null);
        setPerfil(null);
        setAuthFeedbackMessage({ type: 'error', text: INACTIVE_USER_MESSAGE });
        return;
      }

      setPerfil(data);

      // Recién ahora, con el nombre disponible, disparamos el portal de bienvenida
      // (evita el parpadeo de "Bienvenido" sin nombre mientras cargaba el perfil).
      if (pendingWelcomePortalRef.current) {
        pendingWelcomePortalRef.current = false;
        const firstName = data?.nombre?.trim().split(/\s+/)[0];
        setSessionPortal({
          variant: 'enter',
          message: firstName ? `Bienvenido, ${firstName}` : 'Bienvenido',
        });
      }
    } catch (err: any) {
      console.error('Error loading perfil:', err);
      pendingWelcomePortalRef.current = false;

      // Store the error type for display
      if (err.message === 'RLS_RECURSION_ERROR') {
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      // Fallo transitorio (p. ej. red): cerramos sesión limpiamente con aviso en
      // vez de dejar al usuario atascado en el Login con una sesión "a medias".
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.error('Error signing out after perfil load failure:', signOutErr);
      }
      setSession(null);
      setPerfil(null);
      setAuthFeedbackMessage({ type: 'error', text: PERFIL_LOAD_ERROR_MESSAGE });
    }
  };

  const handleLoginStart = () => {
    // El usuario disparó un login real: habilitamos el portal de bienvenida
    // para el próximo evento SIGNED_IN.
    interactiveLoginRef.current = true;
    setLoginStartsOnForm(false);
  };

  const handleInteractiveLoginSuccess = () => {
    // La sesión y el perfil ya se cargan vía onAuthStateChange (SIGNED_IN),
    // que además dispara el portal de bienvenida. No re-consultamos el perfil
    // acá para evitar queries redundantes.
  };

  const handleLoginError = () => {
    // El intento de login falló: desarmamos el portal de bienvenida que había
    // quedado preparado por handleLoginStart.
    interactiveLoginRef.current = false;
    pendingWelcomePortalRef.current = false;
  };

  // El portal de salida se descarta sólo cuando su animación mínima terminó y el
  // signOut realmente completó (evita descubrir la app en redes lentas).
  const maybeDismissExitPortal = () => {
    if (exitAnimDoneRef.current && logoutSettledRef.current) {
      exitAnimDoneRef.current = false;
      logoutSettledRef.current = false;
      setSessionPortal(null);
    }
  };

  const handleLogout = async () => {
    manualLogoutInProgressRef.current = true;
    exitAnimDoneRef.current = false;
    logoutSettledRef.current = false;
    const firstName = perfil?.nombre?.trim().split(/\s+/)[0];
    setSessionPortal({
      variant: 'exit',
      message: firstName ? `¡Hasta pronto, ${firstName}!` : '¡Hasta pronto!',
    });
    setLoginStartsOnForm(true);
    setInactivityCountdown(null);
    clearSessionActivity();
    setAuthFeedbackMessage(null);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setSession(null);
      setPerfil(null);
      setCurrentPage('dashboard');
      replacePageInUrl('dashboard');
      manualLogoutInProgressRef.current = false;
      logoutSettledRef.current = true;
      maybeDismissExitPortal();
    }
  };

  const expireSessionForInactivity = async () => {
    if (inactivityLogoutInProgressRef.current || manualLogoutInProgressRef.current) return;

    inactivityLogoutInProgressRef.current = true;
    exitAnimDoneRef.current = false;
    logoutSettledRef.current = false;
    setSessionPortal({ variant: 'exit', message: 'Su sesión se cerró por inactividad...' });
    setLoginStartsOnForm(true);
    setInactivityCountdown(null);
    clearSessionActivity();
    setAuthFeedbackMessage({ type: 'error', text: SESSION_ENDED_MESSAGE });

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out inactive session:', err);
    } finally {
      setSession(null);
      setPerfil(null);
      setCurrentPage('dashboard');
      replacePageInUrl('dashboard');
      inactivityLogoutInProgressRef.current = false;
      logoutSettledRef.current = true;
      maybeDismissExitPortal();
    }
  };

  useEffect(() => {
    if (!session || authMode === 'password-recovery') return;

    let inactivityTimer: ReturnType<typeof window.setTimeout> | null = null;
    let warningInterval: ReturnType<typeof window.setInterval> | null = null;
    let lastActivityUpdateAt = 0;
    const userId = session.user.id;

    const hideWarning = () => {
      if (warningInterval) {
        window.clearInterval(warningInterval);
        warningInterval = null;
      }
      setInactivityCountdown(null);
    };

    const startWarning = () => {
      if (warningInterval) return;

      const tick = () => {
        const remainingMs = getSessionInactivityRemainingMs(userId);
        if (remainingMs <= 0) {
          hideWarning();
          void expireSessionForInactivity();
          return;
        }
        // Otra pestaña registró actividad: ya no hace falta avisar.
        if (remainingMs > SESSION_INACTIVITY_WARNING_MS) {
          hideWarning();
          scheduleInactivityCheck();
          return;
        }
        setInactivityCountdown(Math.ceil(remainingMs / 1000));
      };

      tick();
      warningInterval = window.setInterval(tick, 1000);
    };

    const scheduleInactivityCheck = () => {
      if (inactivityTimer) {
        window.clearTimeout(inactivityTimer);
      }

      const remainingMs = getSessionInactivityRemainingMs(userId);
      if (remainingMs <= 0) {
        hideWarning();
        void expireSessionForInactivity();
        return;
      }

      // Dentro de la ventana de aviso: mostramos la cuenta regresiva.
      if (remainingMs <= SESSION_INACTIVITY_WARNING_MS) {
        startWarning();
        return;
      }

      hideWarning();
      inactivityTimer = window.setTimeout(() => {
        if (isSessionInactive(userId)) {
          void expireSessionForInactivity();
        } else {
          scheduleInactivityCheck();
        }
      }, remainingMs - SESSION_INACTIVITY_WARNING_MS);
    };

    // Permite que el botón "Seguir conectado" del aviso reinicie el contador.
    stayConnectedRef.current = () => {
      recordSessionActivity(userId);
      lastActivityUpdateAt = Date.now();
      scheduleInactivityCheck();
    };

    const registerActivity = (event: Event) => {
      if (isSessionInactive(userId)) {
        // Si el usuario está cerrando sesión a propósito, no secuestramos el
        // clic: dejamos que el botón dispare el logout manual (con su despedida)
        // en lugar de mostrar el aviso de inactividad.
        const target = event.target as Element | null;
        if (target?.closest?.('[data-logout-trigger]')) {
          return;
        }

        event.stopImmediatePropagation();
        void expireSessionForInactivity();
        return;
      }

      const now = Date.now();
      if (now - lastActivityUpdateAt < 30_000) return;

      lastActivityUpdateAt = now;
      recordSessionActivity(userId, now);
      scheduleInactivityCheck();
    };

    const verifySessionOnReturn = () => {
      if (document.visibilityState === 'hidden') return;

      if (isSessionInactive(userId)) {
        void expireSessionForInactivity();
        return;
      }

      recordSessionActivity(userId);
      lastActivityUpdateAt = Date.now();
      scheduleInactivityCheck();
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== SESSION_ACTIVITY_STORAGE_KEY) return;
      if (event.newValue === null) return;

      if (isSessionInactive(userId)) {
        void expireSessionForInactivity();
        return;
      }

      scheduleInactivityCheck();
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

    scheduleInactivityCheck();

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, registerActivity, true);
    });
    window.addEventListener('focus', verifySessionOnReturn);
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', verifySessionOnReturn);

    return () => {
      if (inactivityTimer) {
        window.clearTimeout(inactivityTimer);
      }
      if (warningInterval) {
        window.clearInterval(warningInterval);
        warningInterval = null;
      }
      setInactivityCountdown(null);

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, registerActivity, true);
      });
      window.removeEventListener('focus', verifySessionOnReturn);
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', verifySessionOnReturn);
    };
  }, [session, authMode]);

  // Cambia de página (con remapeo por rol) sin tocar el historial.
  const applyPage = (page: string, reservaId?: number | null) => {
    const authorizedPage = !isAdminRole(perfil?.rol) && isAdminOnlyPage(page) ? 'reservas' : page;
    setCurrentPage(authorizedPage);
    replacePageInUrl(authorizedPage);
    setEditingSalonId(null);

    if (authorizedPage === 'reservas' && reservaId) {
      setReservaHighlightRequest({ reservaId, nonce: Date.now() });
    } else if (authorizedPage !== 'reservas') {
      setReservaHighlightRequest(null);
    }
    return authorizedPage;
  };

  const executeNavigation = ({ page, reservaId }: NavigationRequest) => {
    const authorizedPage = applyPage(page, reservaId);
    // Apila en el historial (descartando el "adelante" si veníamos de un atrás).
    setNavState((prev) => {
      if (prev.stack[prev.index] === authorizedPage) return prev;
      const stack = prev.stack.slice(0, prev.index + 1);
      stack.push(authorizedPage);
      return { stack, index: stack.length - 1 };
    });
  };

  const performHistoryNav = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= navState.stack.length) return;
    applyPage(navState.stack[targetIndex], null);
    setNavState((prev) => ({ ...prev, index: targetIndex }));
  };

  const canGoBack = navState.index > 0;
  const canGoForward = navState.index < navState.stack.length - 1;

  const handleGoBack = () => {
    if (!canGoBack) return;
    const target = navState.index - 1;
    if (hasUnsavedFormChanges) {
      setPendingNavAction({ run: () => performHistoryNav(target) });
      setShowUnsavedChangesDialog(true);
      return;
    }
    performHistoryNav(target);
  };

  const handleGoForward = () => {
    if (!canGoForward) return;
    const target = navState.index + 1;
    if (hasUnsavedFormChanges) {
      setPendingNavAction({ run: () => performHistoryNav(target) });
      setShowUnsavedChangesDialog(true);
      return;
    }
    performHistoryNav(target);
  };

  const handleNavigate = (page: string, options?: { reservaId?: number | null }) => {
    const request: NavigationRequest = { page, reservaId: options?.reservaId ?? null };
    const isPageChange = page !== currentPage;
    const hasReservaTarget = Boolean(options?.reservaId);

    if (!isPageChange && !hasReservaTarget) return;

    if (isPageChange && hasUnsavedFormChanges) {
      setPendingNavAction({ run: () => executeNavigation(request) });
      setShowUnsavedChangesDialog(true);
      return;
    }

    executeNavigation(request);
  };

  const confirmNavigationWithoutSaving = () => {
    if (!pendingNavAction) return;
    pendingNavAction.run();
    setHasUnsavedFormChanges(false);
    setPendingNavAction(null);
    setShowUnsavedChangesDialog(false);
  };

  const handleUnsavedDialogOpenChange = (open: boolean) => {
    setShowUnsavedChangesDialog(open);
    if (!open) {
      setPendingNavAction(null);
    }
  };

  const handleEditSalon = (salonId: number) => {
    setEditingSalonId(salonId);
  };

  const handleBackFromSalonEdit = () => {
    setEditingSalonId(null);
  };

  useEffect(() => {
    if (!perfil || isAdminRole(perfil.rol) || !isAdminOnlyPage(currentPage)) {
      return;
    }

    setCurrentPage('reservas');
    replacePageInUrl('reservas');
    setEditingSalonId(null);
    setReservaHighlightRequest(null);
  }, [perfil?.rol, currentPage]);

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
                  <strong>Acción requerida:</strong> Debe ejecutar el siguiente SQL en Supabase para corregir las políticas.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-gray-900 mb-2">Pasos para solucionar:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Vaya a <strong>Supabase Dashboard</strong> → <strong>SQL Editor</strong></li>
                <li>Copie el SQL de abajo y péguelo en el editor</li>
                <li>Haga clic en <strong>Run</strong> (Ejecutar)</li>
                <li>Recargue esta página (F5)</li>
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
                      setCopySqlFeedbackMessage('No se pudo copiar el SQL. Cópielo manualmente.');
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
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT rol
  FROM public.perfiles
  WHERE user_id = auth.uid()
    AND COALESCE(activo, true) = true;
$$;

CREATE OR REPLACE FUNCTION public.prevent_unsafe_self_perfil_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND public.get_user_role() <> 'ADMIN' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'No puede modificar el usuario del perfil';
    END IF;

    IF NEW.rol IS DISTINCT FROM OLD.rol THEN
      RAISE EXCEPTION 'No puede modificar el rol del perfil';
    END IF;

    IF NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
      RAISE EXCEPTION 'No puede modificar la fecha de creación del perfil';
    END IF;

    IF NEW.activo IS DISTINCT FROM OLD.activo THEN
      RAISE EXCEPTION 'No puede modificar el estado del perfil';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfiles_prevent_unsafe_self_update ON public.perfiles;
CREATE TRIGGER perfiles_prevent_unsafe_self_update
BEFORE UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_unsafe_self_perfil_update();

DROP POLICY IF EXISTS admin_all_perfiles ON public.perfiles;
DROP POLICY IF EXISTS users_read_own_perfil ON public.perfiles;
DROP POLICY IF EXISTS users_read_all_perfiles ON public.perfiles;
DROP POLICY IF EXISTS authenticated_read_perfiles ON public.perfiles;
DROP POLICY IF EXISTS users_update_own_perfil ON public.perfiles;
DROP POLICY IF EXISTS service_role_all_perfiles ON public.perfiles;

-- Create policies without recursion
CREATE POLICY "admin_all_perfiles" ON public.perfiles
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'ADMIN')
  WITH CHECK (public.get_user_role() = 'ADMIN');

CREATE POLICY "users_read_own_perfil" ON public.perfiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_perfil" ON public.perfiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND COALESCE(activo, true) = true)
  WITH CHECK (auth.uid() = user_id AND COALESCE(activo, true) = true);

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

  const sessionPortalElement = sessionPortal && (
    <SessionPortalTransition
      variant={sessionPortal.variant}
      message={sessionPortal.message}
      onComplete={() => {
        // El portal de salida sólo se descarta cuando además el signOut completó.
        if (sessionPortal.variant === 'exit') {
          exitAnimDoneRef.current = true;
          maybeDismissExitPortal();
        } else {
          setSessionPortal(null);
        }
      }}
    />
  );

  if (!session || !perfil) {
    return (
      <>
        <Login
          onLoginSuccess={handleInteractiveLoginSuccess}
          onLoginStart={handleLoginStart}
          onLoginError={handleLoginError}
          authMessage={authFeedbackMessage}
          initialShowCover={!loginStartsOnForm}
        />
        {sessionPortalElement}
      </>
    );
  }

  // ----- Cambio de contraseña por política de seguridad -----
  const passwordChangeRequired = perfil.requiere_cambio_password === true;
  const passwordDeadline = perfil.cambio_password_limite ? new Date(perfil.cambio_password_limite) : null;
  const passwordChangeOverdue =
    passwordChangeRequired && passwordDeadline !== null && Date.now() > passwordDeadline.getTime();
  const passwordDaysRemaining =
    passwordDeadline && !passwordChangeOverdue
      ? Math.max(0, Math.ceil((passwordDeadline.getTime() - Date.now()) / 86_400_000))
      : null;

  const handlePasswordChangeCompleted = () => {
    setPerfil((prev) =>
      prev ? { ...prev, requiere_cambio_password: false, cambio_password_limite: null } : prev,
    );
    setPasswordChangeOpen(false);
    setVoluntaryChangeOpen(false);
  };

  // Prioridad: plazo vencido (obligatorio) > aviso de seguridad > cambio voluntario.
  const passwordChangeMode = passwordChangeOverdue
    ? 'forced'
    : passwordChangeOpen
      ? 'pending'
      : voluntaryChangeOpen
        ? 'voluntary'
        : null;

  if (passwordChangeMode) {
    return (
      <ForcedPasswordChange
        perfil={perfil}
        mode={passwordChangeMode}
        daysRemaining={passwordChangeMode === 'pending' ? passwordDaysRemaining : null}
        onCancel={
          passwordChangeMode === 'forced'
            ? undefined
            : () => {
                setPasswordChangeOpen(false);
                setVoluntaryChangeOpen(false);
              }
        }
        onCompleted={handlePasswordChangeCompleted}
      />
    );
  }

  const passwordDeadlineText = passwordDeadline
    ? passwordDeadline.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const passwordRemainingText =
    passwordDaysRemaining != null
      ? passwordDaysRemaining <= 0
        ? ' (vence hoy)'
        : ` (le ${passwordDaysRemaining === 1 ? 'queda 1 día' : `quedan ${passwordDaysRemaining} días`})`
      : '';
  const showPasswordWarning = passwordChangeRequired && !passwordChangeOverdue && !passwordWarningDismissed;
  const showPasswordReminder =
    passwordChangeRequired && !passwordChangeOverdue && !passwordReminderDismissed;

  const isAdmin = isAdminRole(perfil.rol);
  const effectiveCurrentPage = !isAdmin && isAdminOnlyPage(currentPage) ? 'reservas' : currentPage;
  const renderReservasPage = () => (
    <Reservas
      perfil={perfil}
      onUnsavedChangesChange={setHasUnsavedFormChanges}
      highlightRequest={reservaHighlightRequest}
    />
  );

  const renderPage = () => {
    // Si estamos editando un salón, mostrar la página de edición
    if (editingSalonId !== null && effectiveCurrentPage === 'salones') {
      return <SalonEdit salonId={editingSalonId} onBack={handleBackFromSalonEdit} />;
    }

    switch (effectiveCurrentPage) {
      case 'dashboard':
        return isAdmin ? <Dashboard perfil={perfil} /> : renderReservasPage();
      case 'reservas':
        return renderReservasPage();
      case 'salones':
        return <Salones perfil={perfil} onEditSalon={handleEditSalon} />;
      case 'servicios':
        return <ServiciosAdicionales perfil={perfil} />;
      case 'notificaciones':
        return <Notificaciones perfil={perfil} onNavigate={handleNavigate} />;
      case 'perfil':
        return <PerfilPage perfil={perfil} onChangePassword={() => setVoluntaryChangeOpen(true)} />;
      case 'usuarios':
        return isAdmin ? <Usuarios /> : renderReservasPage();
      default:
        return isAdmin ? <Dashboard perfil={perfil} /> : renderReservasPage();
    }
  };

  return (
    <>
      <Layout
        currentPage={effectiveCurrentPage}
        onNavigate={handleNavigate}
        onBack={handleGoBack}
        onForward={handleGoForward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        perfil={perfil}
        onLogout={handleLogout}
        onChangePassword={() => setVoluntaryChangeOpen(true)}
      >
        {showPasswordWarning && (
          <div className="bo-pw-security-banner" role="status">
            <ShieldAlert className="bo-pw-security-banner-icon h-5 w-5" aria-hidden="true" />
            <p className="bo-pw-security-banner-text">
              Por seguridad debe cambiar su contraseña
              {passwordDeadlineText ? ` antes del ${passwordDeadlineText}` : ''}
              {passwordRemainingText}.
            </p>
            <button
              type="button"
              className="bo-pw-security-banner-cta"
              onClick={() => setPasswordChangeOpen(true)}
            >
              Cambiar ahora
            </button>
            <button
              type="button"
              className="bo-pw-security-banner-close"
              onClick={() => setPasswordWarningDismissed(true)}
              aria-label="Descartar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
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

      <InactivityWarningDialog
        open={inactivityCountdown !== null}
        secondsLeft={inactivityCountdown ?? 0}
        onStay={() => stayConnectedRef.current()}
      />

      <ConfirmDialog
        open={showPasswordReminder}
        onOpenChange={(open) => {
          if (!open) setPasswordReminderDismissed(true);
        }}
        onConfirm={() => {
          setPasswordReminderDismissed(true);
          setPasswordChangeOpen(true);
        }}
        title="Actualice su contraseña"
        description={`Su contraseña actual es anterior a la nueva política de seguridad. Le recomendamos cambiarla${
          passwordDeadlineText ? ` antes del ${passwordDeadlineText}` : ''
        }${passwordRemainingText}.`}
        confirmText="Cambiar ahora"
        cancelText="Más tarde"
        variant="default"
      />

      {sessionPortalElement}

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
