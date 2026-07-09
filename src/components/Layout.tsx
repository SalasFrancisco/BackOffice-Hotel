import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  Building2,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Coffee,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  X,
} from "lucide-react";
import { Notificacion, Perfil, supabase } from "../utils/supabase/client";
import { projectId } from "../utils/supabase/info";
import { ThemeToggle } from "./ThemeToggle";
import {
  getNotificationVisual,
  isNotificationVisibleToUser,
} from "../utils/notifications";
import "../styles/notifications.css";

type LayoutProps = {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string, options?: { reservaId?: number | null }) => void;
  perfil: Perfil | null;
  onLogout: () => void;
  onChangePassword?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
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

const processReservaExpirations = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return;

  const endpoints = [
    `https://${projectId}.supabase.co/functions/v1/server/process-reserva-vencimiento`,
    `https://${projectId}.supabase.co/functions/v1/process-reserva-vencimiento`,
    `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/process-reserva-vencimiento`,
    `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/process-reserva-vencimiento`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        return;
      }

      const payload = await parseServerResponse(response);
      const errorMessage = String(payload?.error || "");
      const isNotFound =
        response.status === 404 || /not found|404/i.test(errorMessage);

      if (isNotFound) {
        continue;
      }

      console.warn(
        "No se pudo procesar vencimiento automático de reservas:",
        payload?.error || `HTTP ${response.status} en ${endpoint}`,
      );
      return;
    } catch {
      // Try next endpoint variant
    }
  }
};

export function Layout({
  children,
  currentPage,
  onNavigate,
  perfil,
  onLogout,
  onChangePassword,
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
}: LayoutProps) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [liveToast, setLiveToast] = useState<Notificacion | null>(null);
  const [loadingNotificaciones, setLoadingNotificaciones] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Sidebar de escritorio colapsable (persistido). En mobile no aplica: usa el cajón.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("bo-sidebar-collapsed") === "1";
  });
  const notificationRefs = useRef<Array<HTMLDivElement | null>>([]);
  const toastTimeoutRef = useRef<number | null>(null);
  const knownNotificationIdsRef = useRef<Set<number>>(new Set());
  // Notificaciones que este usuario ocultó ("eliminó"): el borrado es por
  // usuario, así no reaparecen en la campana.
  const hiddenNotificationIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bo-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    }
  }, [sidebarCollapsed]);

  const isAdmin = String(perfil?.rol || "").toUpperCase() === "ADMIN";
  const menuItems = [
    ...(isAdmin
      ? [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }]
      : []),
    { id: "reservas", label: "Reservas", icon: ListChecks },
    { id: "salones", label: "Salones", icon: Building2 },
    { id: "servicios", label: "Servicios Adicionales", icon: Coffee },
    { id: "notificaciones", label: "Notificaciones", icon: Bell },
  ];

  if (isAdmin) {
    menuItems.push({ id: "usuarios", label: "Usuarios", icon: UserCog });
  }

  const loadNotificaciones = async (
    userId: string,
    options?: { withLoading?: boolean },
  ) => {
    const withLoading = options?.withLoading ?? false;
    try {
      // El spinner solo en la carga inicial; los refrescos de fondo son silenciosos
      // para que abrir la campana sea instantáneo y no parpadee a "Cargando...".
      if (withLoading) setLoadingNotificaciones(true);
      setNotificationsError("");

      // Las tres consultas en paralelo (antes eran secuenciales) para responder antes.
      const [notifRes, leidasRes, ocultasRes] = await Promise.all([
        supabase
          .from("notificaciones")
          .select("*")
          .order("creado_en", { ascending: false })
          .limit(30),
        supabase
          .from("notificaciones_leidas")
          .select("id_notificacion")
          .eq("user_id", userId),
        supabase
          .from("notificaciones_ocultas")
          .select("id_notificacion")
          .eq("user_id", userId),
      ]);

      if (notifRes.error) throw notifRes.error;
      if (leidasRes.error) throw leidasRes.error;
      // No es fatal: si la tabla aún no existe (migración sin aplicar), seguimos
      // con el set vacío para no romper la campana.
      if (ocultasRes.error) {
        console.warn(
          "No se pudieron cargar las notificaciones ocultas:",
          ocultasRes.error,
        );
      }

      const hiddenSet = new Set(
        (ocultasRes.data || []).map((item) => item.id_notificacion),
      );
      hiddenNotificationIdsRef.current = hiddenSet;

      const notificationsList = (notifRes.data || []).filter(
        (item) => isNotificationVisibleToUser(item, perfil) && !hiddenSet.has(item.id),
      );
      const readSet = new Set(
        (leidasRes.data || []).map((item) => item.id_notificacion),
      );
      knownNotificationIdsRef.current = new Set(
        notificationsList.map((item) => item.id),
      );

      setNotificaciones(
        notificationsList.filter((item) => !readSet.has(item.id)),
      );
    } catch (err: any) {
      console.error("Error loading notificaciones:", err);
      setNotificationsError(
        err?.message || "No se pudieron cargar las notificaciones.",
      );
    } finally {
      if (withLoading) setLoadingNotificaciones(false);
    }
  };

  const showLiveNotificationToast = (notification: Notificacion) => {
    setLiveToast(notification);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setLiveToast(null);
    }, 5000);
  };

  useEffect(() => {
    if (!perfil?.user_id) return;
    const userId = perfil.user_id;

    // Carga inicial rápida (con spinner) — ya sin esperar al proceso de vencimiento.
    loadNotificaciones(userId, { withLoading: true });
    // El procesamiento de vencimientos corre en segundo plano, sin bloquear la
    // campana; sus notificaciones nuevas llegan por realtime. (Idealmente lo hace
    // el cron del servidor — ver migración *_cron_reserva_vencimiento.sql.)
    void processReservaExpirations();

    const notificationsChannel = supabase
      .channel(`notificaciones-live-${perfil.user_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones" },
        (payload) => {
          const newNotification = payload.new as Notificacion;
          if (!isNotificationVisibleToUser(newNotification, perfil)) {
            return;
          }
          if (
            knownNotificationIdsRef.current.has(newNotification.id) ||
            hiddenNotificationIdsRef.current.has(newNotification.id)
          ) {
            return;
          }

          knownNotificationIdsRef.current.add(newNotification.id);
          setNotificaciones((prev) => {
            return [newNotification, ...prev].slice(0, 30);
          });
          showLiveNotificationToast(newNotification);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificaciones_leidas",
          filter: `user_id=eq.${perfil.user_id}`,
        },
        (payload) => {
          const readRow = payload.new as { id_notificacion: number };
          setNotificaciones((prev) =>
            prev.filter((item) => item.id !== readRow.id_notificacion),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificaciones_ocultas",
          filter: `user_id=eq.${perfil.user_id}`,
        },
        (payload) => {
          // El usuario "eliminó" la notificación (en el módulo u otra pestaña):
          // la sacamos de la campana.
          const hiddenRow = payload.new as { id_notificacion: number };
          hiddenNotificationIdsRef.current.add(hiddenRow.id_notificacion);
          knownNotificationIdsRef.current.delete(hiddenRow.id_notificacion);
          setNotificaciones((prev) =>
            prev.filter((item) => item.id !== hiddenRow.id_notificacion),
          );
        },
      )
      .subscribe();

    // Refresco silencioso periódico (respaldo por si se perdió un evento realtime).
    const refreshInterval = window.setInterval(() => {
      loadNotificaciones(userId, { withLoading: false });
    }, 90000);
    // Vencimientos en segundo plano, con baja frecuencia (cada 5 min).
    const expirationInterval = window.setInterval(() => {
      void processReservaExpirations();
    }, 300000);

    return () => {
      window.clearInterval(refreshInterval);
      window.clearInterval(expirationInterval);
      supabase.removeChannel(notificationsChannel);
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [perfil?.user_id]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const clickedInsideNotifications = notificationRefs.current.some(
        (node) => node?.contains(event.target as Node),
      );
      if (!clickedInsideNotifications) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPage]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

  const unreadCount = useMemo(() => notificaciones.length, [notificaciones]);

  const markAsRead = async (notificationId: number): Promise<boolean> => {
    if (!perfil?.user_id) return false;

    try {
      const { error } = await supabase
        .from("notificaciones_leidas")
        .upsert(
          [{ id_notificacion: notificationId, user_id: perfil.user_id }],
          { onConflict: "id_notificacion,user_id", ignoreDuplicates: true },
        );

      if (error) throw error;

      setNotificaciones((prev) =>
        prev.filter((item) => item.id !== notificationId),
      );
      return true;
    } catch (err: any) {
      console.error("Error marking notification as read:", err);
      setNotificationsError(
        err?.message || "No se pudo marcar la notificación como leída.",
      );
      return false;
    }
  };

  const handleNotificationClick = async (notification: Notificacion) => {
    await markAsRead(notification.id);
    setNotificationsOpen(false);
    onNavigate("reservas", { reservaId: notification.reserva_id ?? null });
  };

  const markAllAsRead = async () => {
    if (!perfil?.user_id) return;

    const unread = [...notificaciones];
    if (unread.length === 0) return;

    try {
      const payload = unread.map((item) => ({
        id_notificacion: item.id,
        user_id: perfil.user_id,
      }));

      const { error } = await supabase
        .from("notificaciones_leidas")
        .upsert(payload, {
          onConflict: "id_notificacion,user_id",
          ignoreDuplicates: true,
        });

      if (error) throw error;

      setNotificaciones([]);
    } catch (err: any) {
      console.error("Error marking all notifications as read:", err);
      setNotificationsError(
        err?.message || "No se pudieron marcar las notificaciones como leídas.",
      );
    }
  };

  const formatNotificationDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const setNotificationRef =
    (index: number) => (node: HTMLDivElement | null) => {
      notificationRefs.current[index] = node;
    };

  const handleNavigateFromMenu = (page: string) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  const renderNotifications = (refIndex: number) => (
    <div className="relative flex-shrink-0" ref={setNotificationRef(refIndex)}>
      <button
        onClick={() => setNotificationsOpen((prev) => !prev)}
        className={`relative mt-0.5 inline-flex h-8 w-8 items-center justify-center transition-colors ${
          refIndex === 1 ? "bo-sidebar-icon-btn" : "text-gray-700 hover:text-blue-600"
        } ${unreadCount > 0 ? "bell-ringing-wrapper" : ""}`}
        title={
          unreadCount > 0
            ? `${unreadCount} notificación(es) sin leer`
            : "Notificaciones"
        }
      >
        {unreadCount > 0 ? (
          <BellRing className="h-5 w-5 bell-ringing" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unreadCount > 0 && (
          <span
            className="bo-notification-badge absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div
          className={`bo-notifications-panel ${
            refIndex === 1
              ? "bo-notifications-panel-desktop"
              : "bo-notifications-panel-mobile"
          } rounded-lg shadow-xl`}
        >
          <div className="bo-notif-panel-head">
            <p className="bo-notif-panel-title">Notificaciones</p>
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="bo-notif-markall"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar todas
            </button>
          </div>

          {notificationsError && (
            <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">
              {notificationsError}
            </div>
          )}

          <div className="bo-notif-list">
            {loadingNotificaciones ? (
              <div className="bo-notif-empty">Cargando notificaciones...</div>
            ) : notificaciones.length === 0 ? (
              <div className="bo-notif-empty">
                <BellOff className="h-7 w-7 bo-notif-empty-icon" />
                Sin notificaciones sin leer
              </div>
            ) : (
              notificaciones.map((item) => {
                const visual = getNotificationVisual(item);
                const VisualIcon = visual.Icon;
                return (
                <div
                  key={item.id}
                  className="bo-notif-item is-unread"
                  onClick={() => {
                    void handleNotificationClick(item);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void handleNotificationClick(item);
                    }
                  }}
                >
                  <span className={`bo-notif-icon bo-notif-icon--${visual.tone}`} aria-hidden="true">
                    <VisualIcon className="h-4 w-4" />
                  </span>
                  <div className="bo-notif-item-body">
                    <div className="bo-notif-item-top">
                      <span className="bo-notif-item-label">{visual.label}</span>
                      <span className="bo-notif-item-date">
                        {formatNotificationDate(item.creado_en)}
                      </span>
                    </div>
                    <p className="bo-notif-item-title">{item.titulo}</p>
                    <p className="bo-notif-item-msg">{item.mensaje}</p>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void markAsRead(item.id);
                    }}
                    className="bo-notif-item-check"
                    title="Marcar como leída"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            className="bo-notif-seeall"
            onClick={() => {
              setNotificationsOpen(false);
              onNavigate("notificaciones");
            }}
          >
            Ver todas las notificaciones
          </button>
        </div>
      )}
    </div>
  );

  const renderNavigation = () => (
    <nav className="bo-sidebar-nav px-3">
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => handleNavigateFromMenu(item.id)}
            className={`bo-nav-item w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 ${
              currentPage === item.id ? "is-active" : ""
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  const renderUserFooter = () => (
    <div className="bo-sidebar-footer">
      <button
        type="button"
        onClick={() => handleNavigateFromMenu('perfil')}
        className={`bo-sidebar-user${currentPage === 'perfil' ? ' is-active' : ''}`}
        title="Ver mi perfil"
      >
        <span className="bo-sidebar-user-avatar" aria-hidden="true">
          {(perfil?.nombre || '?').trim().charAt(0).toUpperCase()}
        </span>
        <span className="bo-sidebar-user-meta">
          <span className="bo-sidebar-user-name text-sm">{perfil?.nombre}</span>
          <span className="bo-sidebar-subtitle text-xs">{perfil?.rol}</span>
        </span>
      </button>
      {onChangePassword && (
        <button
          onClick={() => {
            setMobileMenuOpen(false);
            onChangePassword();
          }}
          className="bo-nav-item w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
        >
          <KeyRound className="w-4 h-4" />
          <span className="text-sm">Cambiar contraseña</span>
        </button>
      )}
      <button
        onClick={onLogout}
        data-logout-trigger="true"
        className="bo-nav-item w-full flex items-center gap-2 px-3 py-2 rounded-lg"
      >
        <LogOut className="w-4 h-4" />
        <span className="text-sm">Cerrar Sesión</span>
      </button>
    </div>
  );

  return (
    <div className={`bo-shell bg-gray-50${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      {liveToast && (() => {
        const toastVisual = getNotificationVisual(liveToast);
        const ToastIcon = toastVisual.Icon;
        return (
          <div
            className="bo-toast fixed top-4 right-4 z-[80] rounded-lg shadow-lg"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3 p-3">
              <span className={`bo-notif-icon bo-notif-icon--${toastVisual.tone} mt-0.5`} aria-hidden="true">
                <ToastIcon className="w-4 h-4" />
              </span>
              <button
                type="button"
                className="bo-toast-btn min-w-0 flex-1"
                onClick={() => {
                  const reservaId = liveToast.reserva_id ?? null;
                  setLiveToast(null);
                  onNavigate("reservas", { reservaId });
                }}
                title="Ver la reserva"
              >
                <span className="bo-toast-label">{toastVisual.label}</span>
                <p className="bo-toast-title">{liveToast.titulo}</p>
                <p className="bo-toast-msg">{liveToast.mensaje}</p>
              </button>
              <button
                onClick={() => setLiveToast(null)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
                title="Cerrar notificación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}

      <header className="bo-mobile-header">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
          aria-label="Abrir menú"
          aria-expanded={mobileMenuOpen}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="bo-mobile-title">
          <h1 className="truncate text-gray-900">Back Office Hotel</h1>
          <p className="truncate text-xs text-gray-500">Sistema de Gestión de Reservas</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {renderNotifications(0)}
        </div>
      </header>

      <div
        className={`bo-mobile-drawer-overlay ${mobileMenuOpen ? "is-open" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`bo-mobile-drawer ${mobileMenuOpen ? "is-open" : ""}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-gray-900">Back Office Hotel</h1>
              <p className="text-gray-500 text-sm mt-1">Sistema de Gestión de Reservas</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {renderNavigation()}
        {renderUserFooter()}
      </aside>

      <aside className="bo-sidebar-desktop">
        <div className="p-6">
          <div className="bo-sidebar-brand">
            <div className="bo-sidebar-brand-controls">
              <div className="bo-sidebar-nav-arrows">
                <button
                  type="button"
                  onClick={() => onBack?.()}
                  disabled={!canGoBack}
                  className="bo-sidebar-nav-arrow"
                  title="Atrás"
                  aria-label="Ir a la pantalla anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onForward?.()}
                  disabled={!canGoForward}
                  className="bo-sidebar-nav-arrow"
                  title="Adelante"
                  aria-label="Ir a la pantalla siguiente"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <div className="bo-sidebar-brand-controls-right">
                <ThemeToggle />
                {renderNotifications(1)}
              </div>
            </div>
            <h1 className="bo-sidebar-title">Back Office Hotel</h1>
            <p className="bo-sidebar-subtitle text-sm mt-1">Sistema de Gestión de Reservas</p>
          </div>
        </div>
        {renderNavigation()}
        {renderUserFooter()}
      </aside>

      {/* Manija flotante fija al borde del sidebar: ocultar / mostrar. Se
          desliza con el sidebar y queda siempre visible como control externo.
          Se oculta mientras está abierto el panel de notificaciones para no
          pisarse con él. */}
      {!notificationsOpen && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="bo-sidebar-toggle"
          title={sidebarCollapsed ? "Mostrar menú" : "Ocultar menú"}
          aria-label={sidebarCollapsed ? "Mostrar menú lateral" : "Ocultar menú lateral"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      )}

      {/* Con el sidebar oculto, las flechas de navegación quedan igual accesibles
          en un grupo flotante compacto al borde izquierdo, junto a la manija. */}
      {sidebarCollapsed && !notificationsOpen && (
        <div className="bo-collapsed-nav" role="group" aria-label="Navegación del sistema">
          <button
            type="button"
            onClick={() => onBack?.()}
            disabled={!canGoBack}
            className="bo-collapsed-nav-btn"
            title="Atrás"
            aria-label="Ir a la pantalla anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onForward?.()}
            disabled={!canGoForward}
            className="bo-collapsed-nav-btn"
            title="Adelante"
            aria-label="Ir a la pantalla siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      <main className="bo-main">
        <div key={currentPage} className="bo-page-transition">
          {children}
        </div>
      </main>
    </div>
  );
}

