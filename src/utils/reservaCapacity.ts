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
    details.push(`excede la capacidad del salon (${warning.salonCapacidad})`);
  }
  if (warning.exceedsDistribucionCapacity && warning.distribucionCapacidad) {
    details.push(`excede la capacidad de la distribucion (${warning.distribucionCapacidad})`);
  }

  const suffix = details.length ? `: ${details.join(' y ')}` : '';
  return `Advertencia de capacidad${suffix}.`;
};
