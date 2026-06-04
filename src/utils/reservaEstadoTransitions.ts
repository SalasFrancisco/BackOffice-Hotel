import type { Reserva } from './supabase/client';

export type ReservaEstado = Reserva['estado'];

export const RESERVA_ESTADO_PENDIENTE_VALIDACION: ReservaEstado = 'Pendiente validación';
export const RESERVA_ESTADO_VALIDADO_PENDIENTE_SENA: ReservaEstado = 'Validado Pendiente de Seña';
export const RESERVA_ESTADO_CONFIRMADO: ReservaEstado = 'Confirmado';
export const RESERVA_ESTADO_PAGADO: ReservaEstado = 'Pagado';
export const RESERVA_ESTADO_CANCELADO: ReservaEstado = 'Cancelado';

const RESERVA_ESTADOS: ReservaEstado[] = [
  RESERVA_ESTADO_PENDIENTE_VALIDACION,
  RESERVA_ESTADO_VALIDADO_PENDIENTE_SENA,
  RESERVA_ESTADO_CONFIRMADO,
  RESERVA_ESTADO_PAGADO,
  RESERVA_ESTADO_CANCELADO,
];

const RESERVA_TRANSICIONES: Record<ReservaEstado, ReservaEstado[]> = {
  [RESERVA_ESTADO_PENDIENTE_VALIDACION]: [
    RESERVA_ESTADO_VALIDADO_PENDIENTE_SENA,
    RESERVA_ESTADO_CONFIRMADO,
    RESERVA_ESTADO_PAGADO,
    RESERVA_ESTADO_CANCELADO,
  ],
  [RESERVA_ESTADO_VALIDADO_PENDIENTE_SENA]: [
    RESERVA_ESTADO_CONFIRMADO,
    RESERVA_ESTADO_PAGADO,
    RESERVA_ESTADO_CANCELADO,
  ],
  [RESERVA_ESTADO_CONFIRMADO]: [
    RESERVA_ESTADO_PAGADO,
    RESERVA_ESTADO_CANCELADO,
  ],
  [RESERVA_ESTADO_PAGADO]: [],
  [RESERVA_ESTADO_CANCELADO]: [],
};

export const RESERVA_ESTADO_WEB_INICIAL = RESERVA_ESTADO_PENDIENTE_VALIDACION;
export const RESERVA_ESTADO_BACKOFFICE_INICIAL = RESERVA_ESTADO_VALIDADO_PENDIENTE_SENA;

export const RESERVA_ESTADOS_PENDIENTES_GESTION: ReservaEstado[] = [
  RESERVA_ESTADO_PENDIENTE_VALIDACION,
  RESERVA_ESTADO_VALIDADO_PENDIENTE_SENA,
];

export const RESERVA_ESTADOS_BLOQUEANTES: ReservaEstado[] = [
  RESERVA_ESTADO_CONFIRMADO,
  RESERVA_ESTADO_PAGADO,
];

export const RESERVA_ESTADOS_FINALES: ReservaEstado[] = [
  RESERVA_ESTADO_PAGADO,
  RESERVA_ESTADO_CANCELADO,
];

export const RESERVA_ESTADO_COLORS: Record<ReservaEstado, string> = {
  [RESERVA_ESTADO_PENDIENTE_VALIDACION]: '#F7C948',
  [RESERVA_ESTADO_VALIDADO_PENDIENTE_SENA]: '#8B5CF6',
  [RESERVA_ESTADO_CONFIRMADO]: '#4C7AF2',
  [RESERVA_ESTADO_PAGADO]: '#35B679',
  [RESERVA_ESTADO_CANCELADO]: '#B0B7C3',
};

export const RESERVA_ESTADO_TRANSITION_ERROR_MESSAGE =
  'Transición no permitida. Pendiente validación puede pasar a Validado Pendiente de Seña, Confirmado, Pagado o Cancelado; Validado Pendiente de Seña puede pasar a Confirmado, Pagado o Cancelado; Confirmado solo puede pasar a Pagado o Cancelado; Pagado y Cancelado son estados finales.';

export const getReservaEstados = (): ReservaEstado[] => [...RESERVA_ESTADOS];

export const isReservaEstadoPendienteGestion = (estado?: string | null): boolean =>
  RESERVA_ESTADOS_PENDIENTES_GESTION.includes(estado as ReservaEstado);

export const isReservaEstadoFinal = (estado?: string | null): boolean =>
  RESERVA_ESTADOS_FINALES.includes(estado as ReservaEstado);

export const isReservaEstadoTransitionAllowed = (
  estadoActual: ReservaEstado,
  estadoSiguiente: ReservaEstado,
): boolean => {
  if (estadoActual === estadoSiguiente) return true;
  return (RESERVA_TRANSICIONES[estadoActual] || []).includes(estadoSiguiente);
};

export const getAllowedReservaEstadoTransitions = (estadoActual: ReservaEstado): ReservaEstado[] =>
  RESERVA_ESTADOS.filter((estado) => isReservaEstadoTransitionAllowed(estadoActual, estado));
