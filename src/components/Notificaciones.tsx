import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Check, CheckCheck, ChevronDown, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Notificacion, Perfil, supabase } from '../utils/supabase/client';
import { ModuleInfoBanner } from './ModuleInfoBanner';
import { ConfirmDialog } from './ConfirmDialog';
import {
  getNotificationVisual,
  isNotificationVisibleToUser,
  type NotificationTone,
} from '../utils/notifications';

type NotificacionesProps = {
  perfil: Perfil;
  onNavigate: (page: string, options?: { reservaId?: number | null }) => void;
};

type StatusFilter = 'todas' | 'no-leidas' | 'leidas';
type TypeFilter = 'todos' | NotificationTone;

const NOTIFICATIONS_LIMIT = 100;

// Chips de filtro por tipo (con su color) + orden en que se muestran.
const TYPE_FILTERS: Array<{ key: TypeFilter; label: string; color?: string }> = [
  { key: 'todos', label: 'Todos los tipos' },
  { key: 'nueva', label: 'Nueva reserva', color: '#16a34a' },
  { key: 'vencimiento', label: 'Vencimiento', color: '#d97706' },
  { key: 'estado', label: 'Cambio de estado', color: '#2563eb' },
  { key: 'editada', label: 'Reserva editada', color: '#4f46e5' },
  { key: 'eliminada', label: 'Reserva eliminada', color: '#dc2626' },
];

const startOfDay = (value: string | number | Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const getDateGroup = (dateStr: string): 'Hoy' | 'Ayer' | 'Anteriores' => {
  const today = startOfDay(new Date());
  const target = startOfDay(dateStr);
  if (target === today) return 'Hoy';
  if (target === today - 86_400_000) return 'Ayer';
  return 'Anteriores';
};

const GROUP_ORDER: Array<'Hoy' | 'Ayer' | 'Anteriores'> = ['Hoy', 'Ayer', 'Anteriores'];

const formatFullDate = (dateStr: string) =>
  new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Notificaciones({ perfil, onNavigate }: NotificacionesProps) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [readSet, setReadSet] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Por defecto se abre en "No leídas" (lo que requiere atención).
  const [filter, setFilter] = useState<StatusFilter>('no-leidas');
  // Filtro por tipo multi-selección: un conjunto vacío = todos los tipos.
  const [typeFilters, setTypeFilters] = useState<Set<NotificationTone>>(new Set());
  // Secciones del acordeón por tipo expandidas (solo aplica con 2+ tipos elegidos).
  const [expandedTypeSections, setExpandedTypeSections] = useState<Set<NotificationTone>>(new Set());
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; notification: Notificacion | null }>({
    open: false,
    notification: null,
  });
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const knownIdsRef = useRef<Set<number>>(new Set());
  // Ids que este usuario ocultó ("eliminó"): el borrado es por usuario, no
  // afecta a los demás (ver migración *_notificaciones_ocultas.sql).
  const hiddenIdsRef = useRef<Set<number>>(new Set());

  const loadNotificaciones = async (options?: { withLoading?: boolean }) => {
    const withLoading = options?.withLoading ?? true;
    try {
      if (withLoading) setLoading(true);
      setError('');

      // Las tres consultas en paralelo para cargar más rápido.
      const [notifRes, leidasRes, ocultasRes] = await Promise.all([
        supabase
          .from('notificaciones')
          .select('*')
          .order('creado_en', { ascending: false })
          .limit(NOTIFICATIONS_LIMIT),
        supabase
          .from('notificaciones_leidas')
          .select('id_notificacion')
          .eq('user_id', perfil.user_id),
        supabase
          .from('notificaciones_ocultas')
          .select('id_notificacion')
          .eq('user_id', perfil.user_id),
      ]);

      if (notifRes.error) throw notifRes.error;
      if (leidasRes.error) throw leidasRes.error;
      // No es fatal: si la tabla aún no existe (migración sin aplicar), seguimos
      // con el set vacío para no romper la carga de notificaciones.
      if (ocultasRes.error) {
        console.warn('No se pudieron cargar las notificaciones ocultas:', ocultasRes.error);
      }

      const hiddenSet = new Set((ocultasRes.data || []).map((item) => item.id_notificacion));
      hiddenIdsRef.current = hiddenSet;

      const list = (notifRes.data || []).filter(
        (item) => isNotificationVisibleToUser(item, perfil) && !hiddenSet.has(item.id),
      );
      knownIdsRef.current = new Set(list.map((item) => item.id));
      setNotificaciones(list);
      setReadSet(new Set((leidasRes.data || []).map((item) => item.id_notificacion)));
    } catch (err: any) {
      console.error('Error loading notificaciones:', err);
      setError(err?.message || 'No se pudieron cargar las notificaciones.');
    } finally {
      if (withLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadNotificaciones({ withLoading: true });

    // Respaldo por polling silencioso: aunque el realtime esté deshabilitado en la
    // tabla, el módulo se mantiene actualizado (cada 60 s, sin spinner).
    const refreshInterval = window.setInterval(() => {
      void loadNotificaciones({ withLoading: false });
    }, 60000);

    const channel = supabase
      .channel(`notificaciones-modulo-${perfil.user_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => {
          const nueva = payload.new as Notificacion;
          if (
            !isNotificationVisibleToUser(nueva, perfil) ||
            knownIdsRef.current.has(nueva.id) ||
            hiddenIdsRef.current.has(nueva.id)
          )
            return;
          knownIdsRef.current.add(nueva.id);
          setNotificaciones((prev) => [nueva, ...prev].slice(0, NOTIFICATIONS_LIMIT));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones_leidas',
          filter: `user_id=eq.${perfil.user_id}`,
        },
        (payload) => {
          const row = payload.new as { id_notificacion: number };
          setReadSet((prev) => new Set(prev).add(row.id_notificacion));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones_ocultas',
          filter: `user_id=eq.${perfil.user_id}`,
        },
        (payload) => {
          // El usuario ocultó ("eliminó") una notificación en otra pestaña/dispositivo.
          const row = payload.new as { id_notificacion: number };
          hiddenIdsRef.current.add(row.id_notificacion);
          knownIdsRef.current.delete(row.id_notificacion);
          setNotificaciones((prev) => prev.filter((item) => item.id !== row.id_notificacion));
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.user_id]);

  const markAsRead = async (id: number) => {
    if (readSet.has(id)) return;
    try {
      const { error: upsertError } = await supabase
        .from('notificaciones_leidas')
        .upsert([{ id_notificacion: id, user_id: perfil.user_id }], {
          onConflict: 'id_notificacion,user_id',
          ignoreDuplicates: true,
        });
      if (upsertError) throw upsertError;
      setReadSet((prev) => new Set(prev).add(id));
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
      setError(err?.message || 'No se pudo marcar la notificación como leída.');
    }
  };

  const unmarkAsRead = async (id: number) => {
    if (!readSet.has(id)) return;
    try {
      const { error: deleteError } = await supabase
        .from('notificaciones_leidas')
        .delete()
        .eq('id_notificacion', id)
        .eq('user_id', perfil.user_id);
      if (deleteError) throw deleteError;
      setReadSet((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      console.error('Error unmarking notification as read:', err);
      setError(err?.message || 'No se pudo marcar la notificación como no leída.');
    }
  };

  const confirmDeleteAllNotifications = async () => {
    const ids = notificaciones.map((item) => item.id);
    if (ids.length === 0) {
      setConfirmDeleteAll(false);
      return;
    }
    try {
      // Ocultar sólo para este usuario (no se borra la fila compartida).
      const { error: hideError } = await supabase
        .from('notificaciones_ocultas')
        .upsert(
          ids.map((id) => ({ id_notificacion: id, user_id: perfil.user_id })),
          { onConflict: 'id_notificacion,user_id', ignoreDuplicates: true },
        );
      if (hideError) throw hideError;
      ids.forEach((id) => {
        hiddenIdsRef.current.add(id);
        knownIdsRef.current.delete(id);
      });
      setNotificaciones([]);
      setReadSet(new Set());
      setConfirmDeleteAll(false);
    } catch (err: any) {
      console.error('Error hiding all notifications:', err);
      setError(err?.message || 'No se pudieron eliminar las notificaciones.');
      setConfirmDeleteAll(false);
    }
  };

  const markAllAsRead = async () => {
    const unread = notificaciones.filter((item) => !readSet.has(item.id));
    if (unread.length === 0) return;
    try {
      const { error: upsertError } = await supabase
        .from('notificaciones_leidas')
        .upsert(
          unread.map((item) => ({ id_notificacion: item.id, user_id: perfil.user_id })),
          { onConflict: 'id_notificacion,user_id', ignoreDuplicates: true },
        );
      if (upsertError) throw upsertError;
      setReadSet((prev) => {
        const next = new Set(prev);
        unread.forEach((item) => next.add(item.id));
        return next;
      });
    } catch (err: any) {
      console.error('Error marking all as read:', err);
      setError(err?.message || 'No se pudieron marcar las notificaciones como leídas.');
    }
  };

  const handleRowClick = (item: Notificacion) => {
    void markAsRead(item.id);
    onNavigate('reservas', { reservaId: item.reserva_id ?? null });
  };

  const confirmDeleteNotification = async () => {
    const target = confirmDelete.notification;
    if (!target) return;
    try {
      // Ocultar sólo para este usuario (no se borra la fila compartida).
      const { error: hideError } = await supabase
        .from('notificaciones_ocultas')
        .upsert([{ id_notificacion: target.id, user_id: perfil.user_id }], {
          onConflict: 'id_notificacion,user_id',
          ignoreDuplicates: true,
        });
      if (hideError) throw hideError;
      hiddenIdsRef.current.add(target.id);
      knownIdsRef.current.delete(target.id);
      setNotificaciones((prev) => prev.filter((item) => item.id !== target.id));
      setReadSet((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setConfirmDelete({ open: false, notification: null });
    } catch (err: any) {
      console.error('Error hiding notification:', err);
      setError(err?.message || 'No se pudo eliminar la notificación.');
      setConfirmDelete({ open: false, notification: null });
    }
  };

  const unreadCount = useMemo(
    () => notificaciones.filter((item) => !readSet.has(item.id)).length,
    [notificaciones, readSet],
  );
  const readCount = notificaciones.length - unreadCount;

  const searchQuery = search.trim().toLowerCase();
  const hasActiveExtraFilters = Boolean(searchQuery || dateFrom || dateTo);

  const clearExtraFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  const visibleNotificaciones = useMemo(() => {
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return notificaciones.filter((item) => {
      const isRead = readSet.has(item.id);
      if (filter === 'no-leidas' && isRead) return false;
      if (filter === 'leidas' && !isRead) return false;
      if (typeFilters.size > 0 && !typeFilters.has(getNotificationVisual(item).tone)) return false;

      if (searchQuery) {
        const haystack = `${item.titulo} ${item.mensaje}`.toLowerCase();
        if (!haystack.includes(searchQuery)) return false;
      }

      if (fromTime !== null || toTime !== null) {
        const created = new Date(item.creado_en).getTime();
        if (fromTime !== null && created < fromTime) return false;
        if (toTime !== null && created > toTime) return false;
      }

      return true;
    });
  }, [notificaciones, readSet, filter, typeFilters, searchQuery, dateFrom, dateTo]);

  const groupedNotificaciones = useMemo(() => {
    const groups: Record<string, Notificacion[]> = {};
    visibleNotificaciones.forEach((item) => {
      const group = getDateGroup(item.creado_en);
      (groups[group] ||= []).push(item);
    });
    return GROUP_ORDER.filter((group) => groups[group]?.length).map((group) => ({
      group,
      items: groups[group],
    }));
  }, [visibleNotificaciones]);

  // Con 2+ tipos seleccionados mostramos un acordeón por tipo (colapsable) para
  // que la lista no se haga muy larga.
  const isTypeAccordion = typeFilters.size >= 2;
  const typeSections = useMemo(() => {
    if (!isTypeAccordion) return [];
    return TYPE_FILTERS.filter((t) => t.key !== 'todos' && typeFilters.has(t.key as NotificationTone))
      .map((t) => ({
        tone: t.key as NotificationTone,
        label: t.label,
        color: t.color,
        items: visibleNotificaciones.filter((item) => getNotificationVisual(item).tone === t.key),
      }))
      .filter((section) => section.items.length > 0);
  }, [isTypeAccordion, typeFilters, visibleNotificaciones]);

  const toggleTypeSection = (tone: NotificationTone) => {
    setExpandedTypeSections((prev) => {
      const next = new Set(prev);
      if (next.has(tone)) next.delete(tone);
      else next.add(tone);
      return next;
    });
  };

  const renderNotifRow = (item: Notificacion) => {
    const visual = getNotificationVisual(item);
    const VisualIcon = visual.Icon;
    const isUnread = !readSet.has(item.id);
    return (
      <div
        key={item.id}
        className={`bo-notif-item${isUnread ? ' is-unread' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => handleRowClick(item)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleRowClick(item);
          }
        }}
      >
        <span className={`bo-notif-icon bo-notif-icon--${visual.tone}`} aria-hidden="true">
          <VisualIcon className="h-4 w-4" />
        </span>
        <div className="bo-notif-item-body">
          <div className="bo-notif-item-top">
            <span className="bo-notif-item-label">{visual.label}</span>
            <span className="bo-notif-item-date">{formatFullDate(item.creado_en)}</span>
          </div>
          <p className="bo-notif-item-title">{item.titulo}</p>
          <p className="bo-notif-item-msg">{item.mensaje}</p>
        </div>
        <div className="bo-notif-item-actions">
          {isUnread ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void markAsRead(item.id);
              }}
              className="bo-notif-item-check"
              title="Marcar como leída"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void unmarkAsRead(item.id);
              }}
              className="bo-notif-item-unread-btn"
              title="Marcar como no leída"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setConfirmDelete({ open: true, notification: item });
            }}
            className="bo-notif-item-delete"
            title="Eliminar notificación"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bo-page">
      <div className="bo-page-header mb-4">
        <div className="bo-module-heading">
          <h2 className="bo-module-title text-gray-900">
            <span className="bo-module-title-icon">
              <Bell className="h-6 w-6" />
            </span>
            Notificaciones
          </h2>
          <p className="bo-module-subtitle">Historial de avisos del sistema</p>
        </div>
        <div className="bo-page-actions flex items-center gap-2">
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="bo-action-button flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCheck className="w-5 h-5" />
            Marcar todas como leídas
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteAll(true)}
            disabled={notificaciones.length === 0}
            className="bo-notif-deleteall flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-5 h-5" />
            Borrar todas
          </button>
        </div>
      </div>

      <div className="mb-6">
        <ModuleInfoBanner>
          Historial completo de avisos: reservas nuevas (públicas o del back-office), cambios de
          estado, ediciones, eliminaciones y vencimientos automáticos. Cada tipo tiene su ícono y
          color. Filtre por estado (todas / no leídas / leídas) y por tipo, haga clic en una para ir
          a la reserva, o elimínela de forma permanente con el ícono de papelera.
        </ModuleInfoBanner>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="mb-4">
        <div className="bo-status-segment" role="tablist" aria-label="Filtrar por estado de lectura">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'todas'}
            onClick={() => setFilter('todas')}
            className={`bo-status-segment-btn${filter === 'todas' ? ' is-active' : ''}`}
          >
            Todas
            <span className="bo-status-segment-count">{notificaciones.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'no-leidas'}
            onClick={() => setFilter('no-leidas')}
            className={`bo-status-segment-btn${filter === 'no-leidas' ? ' is-active' : ''}`}
          >
            No leídas
            <span className="bo-status-segment-count">{unreadCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'leidas'}
            onClick={() => setFilter('leidas')}
            className={`bo-status-segment-btn${filter === 'leidas' ? ' is-active' : ''}`}
          >
            Leídas
            <span className="bo-status-segment-count">{readCount}</span>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="bo-notif-typebar" role="group" aria-label="Filtrar por tipo">
          {TYPE_FILTERS.map((type) => {
            const isTodos = type.key === 'todos';
            const active = isTodos ? typeFilters.size === 0 : typeFilters.has(type.key as NotificationTone);
            return (
            <button
              key={type.key}
              type="button"
              onClick={() => {
                if (isTodos) {
                  setTypeFilters(new Set());
                  return;
                }
                setTypeFilters((prev) => {
                  const next = new Set(prev);
                  const tone = type.key as NotificationTone;
                  if (next.has(tone)) next.delete(tone);
                  else next.add(tone);
                  return next;
                });
              }}
              className={`bo-notif-typechip${active ? ' is-active' : ''}`}
              aria-pressed={active}
            >
              {type.color && (
                <span
                  className="bo-notif-typechip-dot"
                  style={{ backgroundColor: type.color }}
                  aria-hidden="true"
                />
              )}
              {type.label}
            </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6 bo-notif-filters">
        <div className="bo-notif-search">
          <Search className="bo-notif-search-icon" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por texto (cliente, N° de reserva, estado…)"
            className="bo-notif-search-input"
            aria-label="Buscar notificaciones por texto"
          />
        </div>
        <label className="bo-notif-date-label">
          Desde
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
            className="bo-notif-date"
            aria-label="Fecha desde"
          />
        </label>
        <label className="bo-notif-date-label">
          Hasta
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
            className="bo-notif-date"
            aria-label="Fecha hasta"
          />
        </label>
        {hasActiveExtraFilters && (
          <button type="button" onClick={clearExtraFilters} className="bo-notif-clear">
            <X className="w-3.5 h-3.5" />
            Limpiar
          </button>
        )}
      </div>

      <div className="bo-notif-panel-full">
        {loading ? (
          <div className="bo-notif-empty">Cargando notificaciones...</div>
        ) : visibleNotificaciones.length === 0 ? (
          <div className="bo-notif-empty">
            <BellOff className="h-8 w-8 bo-notif-empty-icon" />
            {hasActiveExtraFilters || typeFilters.size > 0
              ? 'No hay notificaciones con estos filtros'
              : filter === 'no-leidas'
                ? 'No tiene notificaciones sin leer'
                : filter === 'leidas'
                  ? 'No hay notificaciones leídas'
                  : 'No hay notificaciones'}
          </div>
        ) : isTypeAccordion ? (
          typeSections.map((section) => {
            const open = expandedTypeSections.has(section.tone);
            return (
              <div key={section.tone} className="bo-notif-acc-section">
                <button
                  type="button"
                  className={`bo-notif-acc-head${open ? ' is-open' : ''}`}
                  onClick={() => toggleTypeSection(section.tone)}
                  aria-expanded={open}
                >
                  {section.color && (
                    <span
                      className="bo-notif-typechip-dot"
                      style={{ backgroundColor: section.color }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="bo-notif-acc-label">{section.label}</span>
                  <span className="bo-notif-acc-count">{section.items.length}</span>
                  <ChevronDown className="bo-notif-acc-chevron h-4 w-4" aria-hidden="true" />
                </button>
                {open && <div>{section.items.map(renderNotifRow)}</div>}
              </div>
            );
          })
        ) : (
          groupedNotificaciones.map(({ group, items }) => (
            <div key={group}>
              <div className="bo-notif-group-head">{group}</div>
              {items.map(renderNotifRow)}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete.open}
        onOpenChange={(open) =>
          setConfirmDelete({ open, notification: open ? confirmDelete.notification : null })
        }
        onConfirm={confirmDeleteNotification}
        title="Eliminar notificación"
        description="¿Está seguro de eliminar esta notificación de forma permanente? Se quitará para todos los usuarios y no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        onOpenChange={setConfirmDeleteAll}
        onConfirm={confirmDeleteAllNotifications}
        title="Borrar todas las notificaciones"
        description={`¿Está seguro de eliminar las ${notificaciones.length} notificaciones de forma permanente? Se quitarán para todos los usuarios y no se puede deshacer.`}
        confirmText="Borrar todas"
        cancelText="Cancelar"
        variant="destructive"
      />
    </div>
  );
}
