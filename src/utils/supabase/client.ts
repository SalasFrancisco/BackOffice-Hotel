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

export type Cliente = {
  id: number;
  nombre: string;
  empresa?: string;
  telefono?: string;
  email?: string;
  cuit?: string;
};

export type CategoriaServicio = {
  id: number;
  nombre: string;
  descripcion?: string;
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

export type Reserva = {
  id: number;
  id_cliente: number;
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
  cliente?: Cliente;
  salon?: Salon;
  distribucion?: Distribucion;
  reserva_servicios?: ReservaServicio[];
};
