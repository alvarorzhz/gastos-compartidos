import { APP_VERSION } from '../changelog';
import { isOfflineError } from './expenseOutbox';
import { supabase } from './supabase';

/*
 * Errores de la app.
 *
 * Si algo falla en el móvil de alguno de los dos (un error que nadie esperaba), se apunta en
 * la tabla app_errors y se ve en Ajustes → Tus datos → Errores de la app. Así se sabe qué ha
 * fallado aunque nadie lo cuente. No se apuntan los fallos por falta de conexión, y como mucho
 * unos pocos por sesión para no llenar la tabla si algo se repite en bucle.
 */

export interface AppError {
  id: number;
  household_id: string | null;
  user_id: string;
  happened_at: string;
  message: string;
  detail: string | null;
  place: string | null;
  app_version: string | null;
  device: string | null;
}

type NewAppError = Pick<AppError, 'household_id' | 'message' | 'detail' | 'place' | 'app_version' | 'device'>;

const MAX_PER_SESSION = 10;

/** Errores del navegador que no dicen nada útil o no son de la app. */
const NOISE = [/^ResizeObserver loop/i, /^Script error\.?$/i, /AbortError/i, /The operation was aborted/i];

const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

/** Mensaje y detalle (dónde, en el código) de cualquier cosa que se lance. */
export function describeError(err: unknown): { message: string; detail: string | null } {
  if (err instanceof Error) {
    return { message: cut(err.message || err.name, 500), detail: err.stack ? cut(err.stack, 4000) : null };
  }
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    if (e.message != null) {
      const extra = [e.code, e.details, e.hint].filter((x) => x != null && x !== '').map(String);
      return { message: cut(String(e.message), 500), detail: extra.length ? cut(extra.join(' · '), 4000) : null };
    }
    try {
      return { message: cut(JSON.stringify(err), 500), detail: null };
    } catch {
      return { message: 'Error desconocido', detail: null };
    }
  }
  const text = String(err ?? '').trim();
  return { message: cut(text || 'Error desconocido', 500), detail: null };
}

/** ¿Merece la pena apuntarlo? */
export function worthReporting(err: unknown, message: string): boolean {
  if (isOfflineError(err) || isOfflineError({ message })) return false;
  return !NOISE.some((r) => r.test(message));
}

let context: { userId: string | null; householdId: string | null } = { userId: null, householdId: null };
let pending: NewAppError[] = [];
const seen = new Set<string>();
let count = 0;

/** Quién usa la app ahora: hasta saberlo, los errores esperan (sin sesión no se pueden guardar). */
export function setErrorContext(userId: string | null, householdId: string | null) {
  const wasAnonymous = context.userId == null;
  context = { userId, householdId };
  if (wasAnonymous && userId) {
    // Los de antes de entrar se guardan con el espacio que se acaba de conocer.
    pending = pending.map((p) => ({ ...p, household_id: p.household_id ?? householdId }));
  }
  void flush();
}

/** Apunta un error. `place`: dónde estaba la persona (por defecto, la sección abierta). */
export function reportError(err: unknown, place?: string) {
  const { message, detail } = describeError(err);
  if (!worthReporting(err, message)) return;
  const where = cut(place ?? (typeof location !== 'undefined' ? location.hash.slice(1) || 'inicio' : ''), 200);
  const key = where + '|' + message;
  if (seen.has(key) || count >= MAX_PER_SESSION) return;
  seen.add(key);
  count++;
  pending.push({
    household_id: context.householdId,
    message,
    detail,
    place: where || null,
    app_version: cut(APP_VERSION, 20),
    device: typeof navigator !== 'undefined' ? cut(navigator.userAgent, 300) : null,
  });
  void flush();
}

let flushing = false;

async function flush() {
  if (flushing || !context.userId || pending.length === 0) return;
  flushing = true;
  const rows = pending;
  pending = [];
  try {
    // Si no se puede guardar (sin conexión, o el servidor aún no tiene la tabla), se pierde:
    // un error al apuntar errores no se apunta, para no entrar en bucle.
    await supabase.from('app_errors').insert(rows);
  } catch {
    // Nada.
  } finally {
    flushing = false;
  }
  if (pending.length) void flush();
}

/** Escucha los errores que nadie ha capturado. Se llama una vez al arrancar. */
export function installErrorLog() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}

/** Solo para las pruebas: empieza de cero. */
export function resetErrorLog() {
  context = { userId: null, householdId: null };
  pending = [];
  seen.clear();
  count = 0;
  flushing = false;
}
