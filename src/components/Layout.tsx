import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  Building2,
  Check,
  CheckCheck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PackagePlus,
  UserCog,
  X,
} from "lucide-react";
import { Notificacion, Perfil, supabase } from "../utils/supabase/client";
import { projectId } from "../utils/supabase/info";
import "../styles/notifications.css";

type LayoutProps = {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string, options?: { reservaId?: number | null }) => void;
  perfil: Perfil | null;
  onLogout: () => void;
};

const SALONES_NOTIFICATION_ORIGIN = "salones_form";
const RESERVA_EXPIRATION_NOTIFICATION_ORIGIN = "reserva_vencimiento_auto";

const getNotificationOrigin = (notification: Notificacion): string | null => {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const origin = (metadata as Record<string, unknown>).origen;
  return typeof origin === "string" ? origin : null;
};

const isNotificationFromSalonesForm = (notification: Notificacion): boolean =>
  getNotificationOrigin(notification) === SALONES_NOTIFICATION_ORIGIN;

const isNotificationFromReservaExpiration = (
  notification: Notificacion,
): boolean =>
  getNotificationOrigin(notification) ===
  RESERVA_EXPIRATION_NOTIFICATION_ORIGIN;

const isBackofficeNotification = (notification: Notificacion): boolean =>
  isNotificationFromSalonesForm(notification) ||
  isNotificationFromReservaExpiration(notification);

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
        "No se pudo procesar vencimiento automatico de reservas:",
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
}: LayoutProps) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [liveToast, setLiveToast] = useState<Notificacion | null>(null);
  const [loadingNotificaciones, setLoadingNotificaciones] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const knownNotificationIdsRef = useRef<Set<number>>(new Set());

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "reservas", label: "Reservas", icon: ListChecks },
    { id: "salones", label: "Salones", icon: Building2 },
    { id: "servicios", label: "Servicios Adicionales", icon: PackagePlus },
  ];

  if (perfil?.rol === "ADMIN") {
    menuItems.push({ id: "usuarios", label: "Usuarios", icon: UserCog });
  }

  const loadNotificaciones = async (userId: string) => {
    try {
      setLoadingNotificaciones(true);
      setNotificationsError("");

      await processReservaExpirations();

      const { data: notificacionesData, error: notificacionesErrorRaw } =
        await supabase
          .from("notificaciones")
          .select("*")
          .order("creado_en", { ascending: false })
          .limit(30);

      if (notificacionesErrorRaw) throw notificacionesErrorRaw;

      const notificationsList = (notificacionesData || []).filter(
        isBackofficeNotification,
      );
      if (notificationsList.length === 0) {
        setNotificaciones([]);
        return;
      }

      const ids = notificationsList.map((item) => item.id);

      const { data: leidasData, error: leidasError } = await supabase
        .from("notificaciones_leidas")
        .select("id_notificacion")
        .eq("user_id", userId)
        .in("id_notificacion", ids);

      if (leidasError) throw leidasError;

      const readSet = new Set(
        (leidasData || []).map((item) => item.id_notificacion),
      );
      knownNotificationIdsRef.current = new Set(
        notificationsList.map((item) => item.id),
      );

      const unreadNotifications = notificationsList.filter(
        (item) => !readSet.has(item.id),
      );
      setNotificaciones(unreadNotifications);
    } catch (err: any) {
      console.error("Error loading notificaciones:", err);
      setNotificationsError(
        err?.message || "No se pudieron cargar las notificaciones.",
      );
    } finally {
      setLoadingNotificaciones(false);
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

    loadNotificaciones(perfil.user_id);

    const notificationsChannel = supabase
      .channel(`notificaciones-live-${perfil.user_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones" },
        (payload) => {
          const newNotification = payload.new as Notificacion;
          if (!isBackofficeNotification(newNotification)) {
            return;
          }
          if (knownNotificationIdsRef.current.has(newNotification.id)) {
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
      .subscribe();

    const interval = window.setInterval(() => {
      loadNotificaciones(perfil.user_id);
    }, 30000);

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(notificationsChannel);
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [perfil?.user_id]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

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
        err?.message || "No se pudieron marcar las notificaciones como leÃ­das.",
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

  return (
    <div className="flex h-screen bg-gray-50">
      {liveToast && (
        <div
          className="fixed top-4 right-4 z-[80] rounded-lg border border-blue-200 bg-white shadow-lg"
          style={{ width: "22rem", maxWidth: "94vw" }}
        >
          <div className="flex items-start gap-3 p-3">
            <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900">{liveToast.titulo}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {liveToast.mensaje}
              </p>
            </div>
            <button
              onClick={() => setLiveToast(null)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
              title="Cerrar notificaciÃ³n"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-gray-900">Hotel Back-Office</h1>
              <p className="text-gray-500 text-sm mt-1">Sistema de Reservas</p>
            </div>

            <div className="relative flex-shrink-0" ref={notificationsRef}>
              <button
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className={`relative mt-0.5 inline-flex h-8 w-8 items-center justify-center text-gray-700 hover:text-blue-600 transition-colors ${
                  unreadCount > 0 ? "bell-ringing-wrapper" : ""
                }`}
                title={
                  unreadCount > 0
                    ? `${unreadCount} notificaciÃ³n(es) sin leer`
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
                    className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white"
                    aria-hidden="true"
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div
                  className="absolute right-0 top-11 z-50 rounded-lg border border-gray-200 bg-white shadow-xl"
                  style={{ width: "22rem", maxWidth: "94vw" }}
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
                    <p className="text-sm text-gray-900">Notificaciones</p>
                    <button
                      onClick={markAllAsRead}
                      disabled={unreadCount === 0}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
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

                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {loadingNotificaciones ? (
                      <div className="px-3 py-4 text-sm text-gray-500 text-center">
                        Cargando notificaciones...
                      </div>
                    ) : notificaciones.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-500 text-center">
                        No hay notificaciones
                      </div>
                    ) : (
                      notificaciones.map((item) => (
                        <div
                          key={item.id}
                          className="px-3 py-2 bg-blue-50/40 cursor-pointer hover:bg-blue-100 transition-colors"
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
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-gray-900">
                                {item.titulo}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {item.mensaje}
                              </p>
                              <p className="text-[11px] text-gray-500 mt-1">
                                {formatNotificationDate(item.creado_en)}
                              </p>
                            </div>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void markAsRead(item.id);
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-blue-600 hover:bg-blue-100"
                              title="Marcar como leída"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="px-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                  currentPage === item.id
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
          <div className="mb-3">
            <p className="text-sm text-gray-900">{perfil?.nombre}</p>
            <p className="text-xs text-gray-500">{perfil?.rol}</p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Cerrar SesiÃ³n</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

