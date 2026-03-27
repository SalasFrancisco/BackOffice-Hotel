import { Reserva } from './supabase/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export const RESERVA_AUTO_CANCEL_DAYS = 7;
export const RESERVA_EXPIRATION_WARNING_DAYS = 3;
export const RESERVA_START_WARNING_DAYS = 3;

export type ReservaExpirationWarningInfo = {
  daysRemaining: number;
  expiresAt: Date;
};

export type ReservaStartWarningInfo = {
  daysRemaining: number;
  startAt: Date;
};

const toValidDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (date: Date) => {
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getReservaExpirationBaseDate = (
  reserva: Pick<Reserva, 'creado_en' | 'actualizado_en'>,
) => toValidDate(reserva.actualizado_en) || toValidDate(reserva.creado_en);

export const getReservaExpirationWarningInfo = (
  reserva: Pick<Reserva, 'estado' | 'creado_en' | 'actualizado_en'>,
  now: Date = new Date(),
): ReservaExpirationWarningInfo | null => {
  if (reserva.estado !== 'Pendiente') return null;

  const baseDate = getReservaExpirationBaseDate(reserva);
  if (!baseDate) return null;

  const expiresAt = new Date(baseDate.getTime() + (RESERVA_AUTO_CANCEL_DAYS * DAY_MS));
  const remainingMs = expiresAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return {
      daysRemaining: 0,
      expiresAt,
    };
  }

  const daysRemaining = Math.ceil(remainingMs / DAY_MS);
  if (daysRemaining > RESERVA_EXPIRATION_WARNING_DAYS) {
    return null;
  }

  return {
    daysRemaining,
    expiresAt,
  };
};

export const getReservaStartWarningInfo = (
  reserva: Pick<Reserva, 'estado' | 'fecha_inicio'>,
  now: Date = new Date(),
): ReservaStartWarningInfo | null => {
  if (reserva.estado !== 'Pendiente') return null;

  const startAt = toValidDate(reserva.fecha_inicio);
  if (!startAt) return null;

  const remainingMs = startAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return {
      daysRemaining: 0,
      startAt,
    };
  }

  const daysRemaining = Math.ceil(remainingMs / DAY_MS);
  if (daysRemaining > RESERVA_START_WARNING_DAYS) {
    return null;
  }

  return {
    daysRemaining,
    startAt,
  };
};

export const getReservaExpirationWarningText = (
  reserva: Pick<Reserva, 'estado' | 'creado_en' | 'actualizado_en'>,
) => {
  const warningInfo = getReservaExpirationWarningInfo(reserva);
  if (!warningInfo) return '';

  if (warningInfo.daysRemaining <= 0) {
    return 'La reserva ya supero el plazo de 7 dias en estado Pendiente y se cancelara automaticamente.';
  }

  if (warningInfo.daysRemaining === 1) {
    return `Ultimo dia para confirmar o modificar la reserva antes de su cancelacion automatica por inactividad (${formatDateTime(warningInfo.expiresAt)}).`;
  }

  return `Quedan ${warningInfo.daysRemaining} dias para confirmar o modificar la reserva antes de su cancelacion automatica por inactividad (${formatDateTime(warningInfo.expiresAt)}).`;
};

export const getReservaStartWarningText = (
  reserva: Pick<Reserva, 'estado' | 'fecha_inicio'>,
) => {
  const warningInfo = getReservaStartWarningInfo(reserva);
  if (!warningInfo) return '';

  if (warningInfo.daysRemaining <= 0) {
    return `La fecha de inicio (${formatDateTime(warningInfo.startAt)}) ya fue alcanzada y la reserva se cancelara automaticamente si sigue en estado Pendiente.`;
  }

  if (warningInfo.daysRemaining === 1) {
    return `Ultimo dia antes de la fecha de inicio (${formatDateTime(warningInfo.startAt)}). Si no se confirma la reserva, se cancelara automaticamente.`;
  }

  return `Quedan ${warningInfo.daysRemaining} dias para la fecha de inicio (${formatDateTime(warningInfo.startAt)}). Si llega la fecha y la reserva sigue pendiente, se cancelara automaticamente.`;
};
