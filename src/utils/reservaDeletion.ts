import { Reserva, supabase } from './supabase/client';

const isMissingStorageFileError = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes('not found')
    || normalized.includes('does not exist')
    || normalized.includes('no such')
    || normalized.includes('404');
};

export const deletePresupuestoFile = async (presupuestoPath?: string | null) => {
  const normalizedPath = presupuestoPath?.trim();
  if (!normalizedPath) return;

  const { error: storageError } = await supabase.storage
    .from('presupuestos')
    .remove([normalizedPath]);

  if (
    storageError
    && !isMissingStorageFileError(storageError.message || String(storageError))
  ) {
    throw new Error(`No se pudo eliminar el presupuesto asociado: ${storageError.message}`);
  }
};

export const deleteReservaWithPresupuesto = async (
  reserva: Pick<Reserva, 'id' | 'presupuesto_url'>,
) => {
  await deletePresupuestoFile(reserva.presupuesto_url);

  const { error: deleteError } = await supabase
    .from('reservas')
    .delete()
    .eq('id', reserva.id);

  if (deleteError) {
    throw deleteError;
  }
};
