export type ReservaPendingConflictComparable = {
  id: number;
  id_salon: number;
  estado?: string | null;
  fecha_inicio: string;
  fecha_fin: string;
};

type DayRange = {
  startKey: string;
  endKey: string;
};

const PENDIENTE_ESTADO = 'Pendiente';
const CANCELADO_ESTADO = 'Cancelado';

const parseDate = (value: string): Date | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toDayKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDayRange = (startValue: string, endValue: string): DayRange | null => {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return null;

  // Inclusive end-day comparison for date collisions.
  const endInclusive = new Date(end.getTime() - 1);
  const safeEnd = Number.isNaN(endInclusive.getTime()) || endInclusive < start ? end : endInclusive;

  const startKey = toDayKey(start);
  const endKey = toDayKey(safeEnd);

  return {
    startKey,
    endKey: endKey < startKey ? startKey : endKey,
  };
};

const hasDayOverlap = (a: DayRange, b: DayRange): boolean => (
  a.startKey <= b.endKey && b.startKey <= a.endKey
);

export const getReservaPendingConflictIds = (
  reserva: ReservaPendingConflictComparable,
  reservas: ReservaPendingConflictComparable[],
): number[] => {
  if (!reserva || reserva.estado === CANCELADO_ESTADO || !Number.isFinite(Number(reserva.id_salon))) {
    return [];
  }

  const reservaRange = getDayRange(reserva.fecha_inicio, reserva.fecha_fin);
  if (!reservaRange) return [];

  const targetSalonId = Number(reserva.id_salon);
  const conflictIds = reservas
    .filter((item) => item.id !== reserva.id)
    .filter((item) => Number(item.id_salon) === targetSalonId)
    .filter((item) => item.estado === PENDIENTE_ESTADO)
    .filter((item) => {
      const itemRange = getDayRange(item.fecha_inicio, item.fecha_fin);
      if (!itemRange) return false;
      return hasDayOverlap(reservaRange, itemRange);
    })
    .map((item) => item.id);

  return Array.from(new Set(conflictIds)).sort((a, b) => a - b);
};

export const getReservaPendingConflictText = (conflictIds: number[]): string => {
  if (!conflictIds.length) return '';
  const idsText = conflictIds.map((id) => `#${id}`).join(', ');
  return `Coincide con reserva(s) pendiente(s) del mismo salon y fecha: ${idsText}.`;
};
