import { Reserva } from './supabase/client';

export type ReservaCapacityWarning = {
  hasWarning: boolean;
  exceedsSalonCapacity: boolean;
  exceedsDistribucionCapacity: boolean;
  cantidadPersonas: number;
  salonCapacidad: number | null;
  distribucionCapacidad: number | null;
};

const parsePositiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const getReservaCapacityWarning = (reserva: Reserva): ReservaCapacityWarning => {
  const cantidadPersonas = parsePositiveNumber(reserva.cantidad_personas) ?? 0;
  const salonCapacidad = parsePositiveNumber(reserva.salon?.capacidad);
  const distribucionCapacidad = parsePositiveNumber(reserva.distribucion?.capacidad);

  const exceedsSalonCapacity = Boolean(salonCapacidad && cantidadPersonas > salonCapacidad);
  const exceedsDistribucionCapacity = Boolean(
    reserva.id_distribucion && distribucionCapacidad && cantidadPersonas > distribucionCapacidad,
  );

  return {
    hasWarning: exceedsSalonCapacity || exceedsDistribucionCapacity,
    exceedsSalonCapacity,
    exceedsDistribucionCapacity,
    cantidadPersonas,
    salonCapacidad,
    distribucionCapacidad,
  };
};

export const getReservaCapacityWarningText = (reserva: Reserva): string => {
  const warning = getReservaCapacityWarning(reserva);
  if (!warning.hasWarning) return '';

  const details: string[] = [];
  if (warning.exceedsSalonCapacity && warning.salonCapacidad) {
    details.push(`la del salón (${warning.salonCapacidad})`);
  }
  if (warning.exceedsDistribucionCapacity && warning.distribucionCapacidad) {
    details.push(`la de la distribución (${warning.distribucionCapacidad})`);
  }

  const suffix = details.length ? `supera ${details.join(' y ')}` : 'supera la capacidad configurada';
  return `La cantidad de personas (${warning.cantidadPersonas}) ${suffix}. Verifique la capacidad antes de confirmar la reserva.`;
};
