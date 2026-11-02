/**
 * Cuentas de las animaciones: cómo avanza una cifra que «sube» hasta su valor.
 * Sin interfaz, para poder probarlo; el componente que lo usa es CountUp (views/common.tsx).
 */

/** Curva que arranca rápido y frena al final (t de 0 a 1). */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Céntimos que se enseñan en el instante `t` (0 a 1) al ir de `from` a `to`. Siempre enteros. */
export function tweenCents(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  return Math.round(from + (to - from) * easeOutCubic(t));
}

/** Si quien usa la app ha pedido en el móvil «reducir movimiento». */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Ids que no estaban antes (lo recién apuntado). La primera vez (`known` vacío) no hay nada nuevo. */
export function arrivals(known: ReadonlySet<string> | null, ids: readonly string[]): string[] {
  if (!known) return [];
  return ids.filter((id) => !known.has(id));
}

/** Hacia dónde se va al pasar del mes `from` al `to` (aaaa-mm): -1 atrás, 1 adelante, 0 igual. */
export function monthStep(from: string, to: string): -1 | 0 | 1 {
  return to === from ? 0 : to < from ? -1 : 1;
}

/**
 * Si al quitar filas de una lista conviene enseñar cómo se van (una o dos y el resto se queda).
 * Si cambia casi todo (otro mes, un filtro) no: sería un baile.
 */
export function shouldFadeOut(removed: number, kept: number): boolean {
  return removed > 0 && removed <= 2 && kept > 0;
}

/**
 * Apunta `key` en la lista de cosas ya enseñadas (las últimas `max`).
 * `fresh` dice si era la primera vez, para que una animación salga una sola vez.
 */
export function rememberOnce(list: readonly string[], key: string, max = 80): { fresh: boolean; list: string[] } {
  if (list.includes(key)) return { fresh: false, list: [...list] };
  return { fresh: true, list: [...list, key].slice(-max) };
}
