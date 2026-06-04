import type { Reserva } from './supabase/client';

export type ReservaEstado = Reserva['estado'];

const RESERVA_ESTADOS: ReservaEstado[] = [
  'Pendiente',
  'Validado Pendiente Seña',
  'Confirmado',
  'Pagado',
  'Cancelado',
];

export const getReservaEstados = (): ReservaEstado[] => RESERVA_ESTADOS;

export const isReservaEstadoTransitionAllowed = (
  estadoActual: ReservaEstado,
  estadoSiguiente: ReservaEstado,
): boolean => {
  if (estadoActual === estadoSiguiente) return true;

  if (estadoActual === 'Pagado') {
    return false;
  }

  if (estadoActual === 'Cancelado') {
    return false;
  }

  if (estadoActual === 'Pendiente') {
    return estadoSiguiente === 'Validado Pendiente Seña'
      || estadoSiguiente === 'Confirmado'
      || estadoSiguiente === 'Cancelado';
  }

  if (estadoActual === 'Validado Pendiente Seña') {
    return estadoSiguiente === 'Confirmado' || estadoSiguiente === 'Cancelado';
  }

  if (estadoActual === 'Confirmado') {
    return estadoSiguiente === 'Pagado' || estadoSiguiente === 'Cancelado';
  }

  return false;
};

export const getAllowedReservaEstadoTransitions = (estadoActual: ReservaEstado): ReservaEstado[] =>
  RESERVA_ESTADOS.filter((estado) => isReservaEstadoTransitionAllowed(estadoActual, estado));
