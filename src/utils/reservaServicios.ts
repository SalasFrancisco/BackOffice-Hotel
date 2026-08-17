import type { ReservaServicio } from './supabase/client';

export const getReservaServicioUnitPrice = (
  reservaServicio?: Pick<ReservaServicio, 'precio_unitario' | 'servicio'> | null,
) => {
  const snapshotPrice = reservaServicio?.precio_unitario;
  if (snapshotPrice !== null && snapshotPrice !== undefined) {
    const parsedSnapshotPrice = Number(snapshotPrice);
    if (Number.isFinite(parsedSnapshotPrice)) return parsedSnapshotPrice;
  }

  const catalogPrice = Number(reservaServicio?.servicio?.precio);
  return Number.isFinite(catalogPrice) ? catalogPrice : 0;
};
