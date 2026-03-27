import { projectId } from './supabase/info';
import { Reserva, supabase } from './supabase/client';

const PRESUPUESTOS_BUCKET = 'presupuestos';

const DELETE_RESERVA_ENDPOINTS = [
  `https://${projectId}.supabase.co/functions/v1/server/delete-reserva`,
  `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/delete-reserva`,
  `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/delete-reserva`,
];

const isMissingStorageFileError = (message: string) => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('not found')
    || normalized.includes('does not exist')
    || normalized.includes('no such')
    || normalized.includes('404');
};

const normalizePresupuestoStoragePath = (rawPath?: string | null) => {
  let path = String(rawPath || '').trim();
  if (!path) return null;

  if (/^https?:\/\//i.test(path)) {
    try {
      const parsedUrl = new URL(path);
      path = parsedUrl.pathname || '';
    } catch {
      // ignore malformed URL and keep original path
    }
  }

  path = path.split('?')[0]?.split('#')[0] || path;

  try {
    path = decodeURIComponent(path);
  } catch {
    // ignore malformed URI sequence
  }

  const marker = '/presupuestos/';
  const markerIndex = path.toLowerCase().indexOf(marker);
  if (markerIndex >= 0) {
    path = path.slice(markerIndex + marker.length);
  }

  path = path
    .replace(/^\/+/, '')
    .replace(/^storage\/v1\/object\/(?:public|sign|authenticated)\/presupuestos\//i, '')
    .replace(/^object\/(?:public|sign|authenticated)\/presupuestos\//i, '')
    .replace(/^presupuestos\//i, '')
    .trim();

  return path || null;
};

const buildPresupuestoStorageCandidates = (rawPath?: string | null) => {
  const candidates = new Set<string>();
  const raw = String(rawPath || '').trim();
  if (!raw) return [];

  const normalized = normalizePresupuestoStoragePath(raw);
  if (normalized) {
    candidates.add(normalized);
  }

  const rawWithoutQuery = raw.split('?')[0]?.split('#')[0] || raw;
  if (rawWithoutQuery && !/^https?:\/\//i.test(rawWithoutQuery)) {
    candidates.add(rawWithoutQuery.replace(/^\/+/, '').replace(/^presupuestos\//i, ''));
  }

  return Array.from(candidates).filter(Boolean);
};

const parseServerResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const tryDeleteReservaViaServerEndpoint = async (
  reservaId: number,
  presupuestoPath?: string | null,
) => {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return { handled: false as const };
  }

  for (const url of DELETE_RESERVA_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          reservaId,
          presupuestoPath: presupuestoPath || null,
        }),
      });

      const payload = await parseServerResponse(response);

      if (response.ok) {
        return { handled: true as const, ok: true as const };
      }

      const errorMessage = String(payload?.error || `HTTP ${response.status} en ${url}`);
      const isNotFound = response.status === 404 || /not found|404/i.test(errorMessage);

      if (isNotFound) {
        continue;
      }

      return {
        handled: true as const,
        ok: false as const,
        error: new Error(errorMessage),
      };
    } catch {
      // ignore network errors and keep trying alternate endpoints
    }
  }

  return { handled: false as const };
};

export const deletePresupuestoFile = async (presupuestoPath?: string | null) => {
  const storagePaths = buildPresupuestoStorageCandidates(presupuestoPath);
  if (!storagePaths.length) return;

  for (const storagePath of storagePaths) {
    const { error: storageError } = await supabase.storage
      .from(PRESUPUESTOS_BUCKET)
      .remove([storagePath]);

    if (!storageError) {
      return;
    }

    const message = storageError.message || String(storageError);
    if (isMissingStorageFileError(message)) {
      continue;
    }

    throw new Error(`No se pudo eliminar el presupuesto asociado: ${message}`);
  }
};

export const deleteReservaWithPresupuesto = async (
  reserva: Pick<Reserva, 'id' | 'presupuesto_url'>,
) => {
  const serverDeleteResult = await tryDeleteReservaViaServerEndpoint(
    reserva.id,
    reserva.presupuesto_url,
  );

  if (serverDeleteResult.handled) {
    if (!serverDeleteResult.ok) {
      throw serverDeleteResult.error;
    }
    return;
  }

  await deletePresupuestoFile(reserva.presupuesto_url);

  const { error: deleteError } = await supabase
    .from('reservas')
    .delete()
    .eq('id', reserva.id);

  if (deleteError) {
    throw deleteError;
  }
};
