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
