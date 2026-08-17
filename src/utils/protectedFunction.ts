import { supabase } from './supabase/client';
import { projectId } from './supabase/info';

/**
 * Variantes de ruta bajo las que puede quedar publicado el Edge Function según
 * cómo se lo invoque. Sólo las que llevan el prefijo `server/` corresponden a
 * la función desplegada; las otras dos existirían si alguna vez se separan las
 * rutas en funciones propias, y hoy responden 404.
 */
export const buildProtectedFunctionEndpoints = (path: string) => [
  `https://${projectId}.supabase.co/functions/v1/server/${path}`,
  `https://${projectId}.supabase.co/functions/v1/${path}`,
  `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/${path}`,
  `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/${path}`,
];

const parseServerResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

/**
 * Invoca una ruta protegida del Edge Function probando las variantes de ruta en
 * orden y devolviendo la primera que responda bien.
 *
 * Sobre los errores: antes se reportaba el error del ÚLTIMO intento, y como las
 * dos últimas variantes apuntan a funciones inexistentes (404 del gateway, que
 * llega sin cabeceras CORS y el navegador convierte en "Failed to fetch"), ese
 * mensaje tapaba el error real de la primera variante. Ahora se conserva el
 * primer error informativo: el que dio el servidor.
 */
export const invokeProtectedFunction = async (
  path: string,
  body: Record<string, unknown>,
) => {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('No se pudo obtener la sesión actual.');
  }

  // El servidor contestó, aunque con error: es el diagnóstico que sirve.
  let serverError: string | null = null;
  // Ni siquiera se pudo leer la respuesta (conexión, CORS, bloqueo del navegador).
  let networkError: string | null = null;

  for (const endpoint of buildProtectedFunctionEndpoints(path)) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const payload = await parseServerResponse(response);
      if (response.ok) {
        return payload;
      }

      // Un 404 sólo dice que esa variante de ruta no existe; no es el problema.
      if (response.status !== 404 && !serverError) {
        serverError = payload?.error || `HTTP ${response.status}`;
      }
    } catch (error: any) {
      if (!networkError) {
        networkError = error?.message || String(error);
      }
    }
  }

  if (serverError) {
    throw new Error(serverError);
  }

  if (networkError) {
    throw new Error(
      `No se pudo contactar al servidor (${networkError}). Puede ser la conexión, `
      + 'una extensión del navegador bloqueando la petición, o que este dominio no '
      + 'esté habilitado en ALLOWED_ORIGINS del Edge Function.',
    );
  }

  throw new Error(`No se pudo completar la operación solicitada (${path}).`);
};
