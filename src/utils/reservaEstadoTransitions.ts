import type { Reserva } from './supabase/client';

export type ReservaEstado = Reserva['estado'];

const RESERVA_ESTADOS: ReservaEstado[] = ['Pendiente', 'Confirmado', 'Pagado', 'Cancelado'];

export const getReservaEstados = (): ReservaEstado[] => RESERVA_ESTADOS;

export const isReservaEstadoTransitionAllowed = (
  estadoActual: ReservaEstado,
  estadoSiguiente: ReservaEstado,
): boolean => {
  if (estadoActual === estadoSiguiente) return true;

  if (estadoActual === 'Pagado') {
    return false;
  }

  if (estadoActual === 'Pendiente') {
    return estadoSiguiente === 'Confirmado' || estadoSiguiente === 'Cancelado';
  }

  if (estadoSiguiente === 'Pagado') {
    return estadoActual === 'Confirmado';
  }

  return true;
};

export const getAllowedReservaEstadoTransitions = (estadoActual: ReservaEstado): ReservaEstado[] =>
  RESERVA_ESTADOS.filter((estado) => isReservaEstadoTransitionAllowed(estadoActual, estado));
