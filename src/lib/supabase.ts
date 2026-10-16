import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Sesión guardada en el móvil, aunque esté caducada (para abrir la app sin conexión). */
export function storedSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const s = JSON.parse(localStorage.getItem(key) ?? 'null') as Session | null;
      if (s?.user?.id && s.access_token) return s;
    }
  } catch {
    // Sin almacenamiento.
  }
  return null;
}

/** Mensaje de error legible (en castellano) a partir de un error de Supabase o de la red. */
export function errorMessage(err: unknown): string {
  const e = (err && typeof err === 'object' ? err : {}) as { message?: unknown; code?: unknown };
  const message = e.message != null ? String(e.message) : '';
  const code = typeof e.code === 'string' ? e.code : '';
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return 'No hay conexión. Revisa internet e inténtalo de nuevo.';
  }
  if (code === '23505' || /duplicate key/i.test(message)) return 'Ya existe uno con ese nombre.';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return 'No tienes permiso para hacer esto.';
  if (code === '23514' || /violates check constraint/i.test(message)) return 'Algún dato no es válido. Revísalo e inténtalo de nuevo.';
  if (code === '23503' || /foreign key/i.test(message)) return 'Lo que has elegido ya no existe. Recarga e inténtalo de nuevo.';
  if (/jwt expired|invalid jwt|not authenticated/i.test(message)) return 'La sesión ha caducado. Vuelve a entrar.';
  return message || 'Algo ha fallado. Inténtalo de nuevo.';
}
