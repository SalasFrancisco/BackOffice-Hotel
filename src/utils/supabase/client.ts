import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase = createClient(supabaseUrl, publicAnonKey);

export type Perfil = {
  user_id: string;
  nombre: string;
  rol: 'ADMIN' | 'OPERADOR';
  creado_en: string;
};

export type Salon = {
  id: number;
  nombre: string;
  capacidad: number;
  precio_base: number;
  descripcion?: string;
};

export type Distribucion = {
  id: number;
  id_salon: number;
  nombre: string;
  capacidad: number;
  creado_en: string;
  salon?: Salon;
};

export type CategoriaServicio = {
  id: number;
  nombre: string;
  descripcion?: string;
  orden?: number | null;
  creado_en: string;
};

export type Servicio = {
  id: number;
  id_categoria: number;
  nombre: string;
  descripcion?: string;
  precio: number;
  creado_en: string;
  categoria?: CategoriaServicio;
};

export type ReservaServicio = {
  id: number;
  id_reserva: number;
  id_servicio: number;
  cantidad: number;
  creado_en: string;
  servicio?: Servicio;
};

export type NotificacionTipo =
  | 'RESERVA_NUEVA'
  | 'RESERVA_EDITADA'
  | 'ESTADO_CAMBIADO'
  | 'RESERVA_ELIMINADA';

export type Notificacion = {
  id: number;
  tipo: NotificacionTipo;
  titulo: string;
  mensaje: string;
  reserva_id?: number | null;
  metadata?: Record<string, unknown> | null;
  creado_en: string;
};

export type NotificacionLeida = {
  id: number;
  id_notificacion: number;
  user_id: string;
  leido_en: string;
};

export type Reserva = {
  id: number;
  cliente_nombre?: string | null;
  cliente_email?: string | null;
  cliente_telefono?: string | null;
  id_salon: number;
  id_distribucion?: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'Pendiente' | 'Confirmado' | 'Pagado' | 'Cancelado';
  monto: number;
  cantidad_personas: number;
  observaciones?: string;
  creado_por?: string;
  creado_en: string;
  actualizado_en?: string;
  presupuesto_url?: string | null;
  salon?: Salon;
  distribucion?: Distribucion;
  reserva_servicios?: ReservaServicio[];
};
