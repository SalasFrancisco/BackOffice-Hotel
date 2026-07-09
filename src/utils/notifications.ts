import {
  CalendarPlus,
  AlarmClockOff,
  RefreshCw,
  PencilLine,
  Trash2,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { supabase, type Notificacion, type NotificacionTipo, type Perfil } from './supabase/client';

// Orígenes de notificación (guardados en metadata.origen) que pertenecen al
// back-office y por lo tanto se muestran en la campana / módulo.
export const SALONES_NOTIFICATION_ORIGIN = 'salones_form';
export const RESERVA_EXPIRATION_NOTIFICATION_ORIGIN = 'reserva_vencimiento_auto';
// Origen de los avisos generados por acciones internas del back-office
// (crear/editar/cambiar estado/eliminar una reserva desde el admin).
export const BACKOFFICE_INTERNAL_ORIGIN = 'backoffice_interno';

const BACKOFFICE_ORIGINS = new Set([
  SALONES_NOTIFICATION_ORIGIN,
  RESERVA_EXPIRATION_NOTIFICATION_ORIGIN,
  BACKOFFICE_INTERNAL_ORIGIN,
]);

export const getNotificationOrigin = (notification: Notificacion): string | null => {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const origin = (metadata as Record<string, unknown>).origen;
  return typeof origin === 'string' ? origin : null;
};

export const isNotificationFromSalonesForm = (notification: Notificacion): boolean =>
  getNotificationOrigin(notification) === SALONES_NOTIFICATION_ORIGIN;

export const isNotificationFromReservaExpiration = (notification: Notificacion): boolean =>
  getNotificationOrigin(notification) === RESERVA_EXPIRATION_NOTIFICATION_ORIGIN;

export const isBackofficeNotification = (notification: Notificacion): boolean => {
  const origin = getNotificationOrigin(notification);
  return origin !== null && BACKOFFICE_ORIGINS.has(origin);
};

const getMetadataRecord = (notification: Notificacion): Record<string, unknown> => {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
};

// Decide si una notificación debe mostrarse a un usuario concreto:
// - solo notificaciones del back-office;
// - no te notificás tus propias acciones (actor_user_id === vos);
// - respeta la audiencia (audiencia: 'admin' solo la ven los ADMIN).
export const isNotificationVisibleToUser = (
  notification: Notificacion,
  viewer: Pick<Perfil, 'user_id' | 'rol'> | null | undefined,
): boolean => {
  if (!isBackofficeNotification(notification)) return false;

  const metadata = getMetadataRecord(notification);

  const actorUserId = metadata.actor_user_id;
  if (typeof actorUserId === 'string' && viewer?.user_id && actorUserId === viewer.user_id) {
    return false;
  }

  const audiencia = metadata.audiencia;
  if (audiencia === 'admin' && String(viewer?.rol || '').toUpperCase() !== 'ADMIN') {
    return false;
  }

  return true;
};

type InternalNotificationInput = {
  tipo: NotificacionTipo;
  titulo: string;
  mensaje: string;
  reservaId?: number | null;
  audiencia?: 'todos' | 'admin';
  actor: Pick<Perfil, 'user_id' | 'nombre'>;
  extraMetadata?: Record<string, unknown>;
};

// Inserta una notificación por una acción interna del back-office. Es "best
// effort": si falla no rompe la acción principal (solo lo loguea).
export const createInternalNotification = async (
  input: InternalNotificationInput,
): Promise<void> => {
  try {
    await supabase.from('notificaciones').insert([
      {
        tipo: input.tipo,
        titulo: input.titulo,
        mensaje: input.mensaje,
        reserva_id: input.reservaId ?? null,
        metadata: {
          origen: BACKOFFICE_INTERNAL_ORIGIN,
          audiencia: input.audiencia ?? 'todos',
          actor_user_id: input.actor.user_id,
          actor_nombre: input.actor.nombre ?? null,
          ...input.extraMetadata,
        },
      },
    ]);
  } catch (err) {
    console.warn('No se pudo registrar la notificación interna:', err);
  }
};

// Identidad visual (ícono + color + etiqueta) según el tipo de notificación,
// para distinguirlas de un vistazo. El "tone" se usa como sufijo de clase CSS
// (.bo-notif-icon--<tone>) y está definido en notifications.css para ambos modos.
export type NotificationTone =
  | 'nueva'
  | 'vencimiento'
  | 'estado'
  | 'editada'
  | 'eliminada'
  | 'default';

export type NotificationVisual = {
  tone: NotificationTone;
  Icon: LucideIcon;
  label: string;
};

export const getNotificationVisual = (notification: Notificacion): NotificationVisual => {
  if (isNotificationFromReservaExpiration(notification)) {
    return { tone: 'vencimiento', Icon: AlarmClockOff, label: 'Vencimiento' };
  }

  switch (notification.tipo) {
    case 'RESERVA_NUEVA':
      return { tone: 'nueva', Icon: CalendarPlus, label: 'Nueva reserva' };
    case 'RESERVA_EDITADA':
      return { tone: 'editada', Icon: PencilLine, label: 'Reserva editada' };
    case 'RESERVA_ELIMINADA':
      return { tone: 'eliminada', Icon: Trash2, label: 'Reserva eliminada' };
    case 'ESTADO_CAMBIADO':
      return { tone: 'estado', Icon: RefreshCw, label: 'Cambio de estado' };
    default:
      return { tone: 'default', Icon: Bell, label: 'Notificación' };
  }
};
