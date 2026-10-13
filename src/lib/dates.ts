/** Fecha local de hoy en formato YYYY-MM-DD. */
export function today(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "2026-10-12" -> "2026-10-01" */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7) + '-01';
}

/** Suma (o resta) meses a un "YYYY-MM-01". */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toIsoDate(d);
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "2026-10-12" → "Hoy", "Ayer" o "Lunes, 12 de octubre" (con el año si no es el actual). */
export function formatDayHeading(isoDate: string, todayIso = today()): string {
  if (isoDate === todayIso) return 'Hoy';
  if (isoDate === addDays(todayIso, -1)) return 'Ayer';
  const [y, m, d] = isoDate.split('-').map(Number);
  const sameYear = isoDate.slice(0, 4) === todayIso.slice(0, 4);
  const s = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "2026-10-12" → "12 oct" (con el año si no es el actual). */
export function formatShortDay(isoDate: string, todayIso = today()): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const sameYear = isoDate.slice(0, 4) === todayIso.slice(0, 4);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Suma (o resta) días a un "YYYY-MM-DD". */
export function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1, d + delta));
}
