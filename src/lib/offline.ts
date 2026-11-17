/** ¿El error es por falta de conexión (y no porque algo no sea válido)? */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message);
}
