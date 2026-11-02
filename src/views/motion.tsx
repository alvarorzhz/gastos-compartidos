import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { reportError } from '../lib/errorLog';
import { arrivals, monthStep, prefersReducedMotion, rememberOnce, shouldFadeOut } from '../lib/motion';

/*
 * Animaciones que responden a algo que pasa (apuntar, borrar, votar, cambiar de mes…).
 * Cortas y una sola vez. Con «reducir movimiento» en el móvil no se ve ninguna.
 * Los estilos están en styles.css (sección «Animaciones de lo que pasa»).
 */

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const canAnimate = (el: Element): boolean => typeof (el as HTMLElement).animate === 'function' && !prefersReducedMotion();

/* ───────────── Listas que se recolocan sin saltos ───────────── */

interface Spot { top: number; left: number; width: number; height: number; parent: HTMLElement }

/**
 * Cuando una lista cambia (se borra una fila, entra otra, se reordena), las filas que siguen
 * se deslizan a su nuevo sitio en vez de saltar, y la que se va se desvanece encogiéndose.
 * `selector` dice qué elementos dentro del contenedor se siguen (p. ej. "li").
 */
export function useListMotion<T extends HTMLElement>(selector: string) {
  const ref = useRef<T>(null);
  const spots = useRef(new Map<HTMLElement, Spot>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<HTMLElement, Spot>();
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (el.dataset.leaving) return; // la copia de una fila que se está yendo
      const parent = el.parentElement;
      if (!parent) return;
      const r = el.getBoundingClientRect();
      const p = parent.getBoundingClientRect();
      next.set(el, { top: r.top - p.top, left: r.left - p.left, width: r.width, height: r.height, parent });
    });
    const before = spots.current;
    spots.current = next;
    if (before.size === 0 || prefersReducedMotion()) return;

    const vh = window.innerHeight;
    let kept = 0;
    next.forEach((spot, el) => {
      const old = before.get(el);
      if (!old) return;
      kept++;
      const dy = old.top - spot.top;
      if (Math.abs(dy) < 1 || !canAnimate(el)) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 300, easing: EASE });
    });

    const gone = [...before].filter(([el]) => !el.isConnected && before.get(el)!.parent.isConnected);
    if (!shouldFadeOut(gone.length, kept)) return;
    for (const [el, spot] of gone) fadeOut(el, spot);
  });
  return ref;
}

/** Vuelve a poner un momento la fila borrada donde estaba y la desvanece encogiéndose. */
function fadeOut(el: HTMLElement, spot: Spot) {
  try {
    const { parent } = spot;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    Object.assign(el.style, {
      position: 'absolute', top: `${spot.top}px`, left: `${spot.left}px`, width: `${spot.width}px`, height: `${spot.height}px`,
      margin: '0', pointerEvents: 'none', animation: 'none', zIndex: '0',
    });
    el.dataset.leaving = '1';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('inert', '');
    parent.appendChild(el);
    if (!canAnimate(el)) return el.remove();
    const a = el.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96) translateX(12px)' }],
      { duration: 240, easing: 'ease-in', fill: 'forwards' },
    );
    a.onfinish = () => el.remove();
    a.oncancel = () => el.remove();
  } catch (e) {
    el.remove();
    reportError(e, 'animar fila borrada');
  }
}

/* ───────────── Lo recién apuntado brilla un momento ───────────── */

const arrivedAt = new Map<string, number>();
let knownIds: Set<string> | null = null;
const FRESH_MS = 6000;

/** Se llama con los gastos cada vez que llegan datos: apunta cuáles son nuevos (míos o de la pareja). */
export function noteExpenses(ids: readonly string[]) {
  const now = Date.now();
  for (const id of arrivals(knownIds, ids)) arrivedAt.set(id, now);
  knownIds = new Set(ids);
}

/** Si el gasto acaba de aparecer (hace menos de unos segundos). */
export function isFresh(id: string): boolean {
  const t = arrivedAt.get(id);
  return t != null && Date.now() - t < FRESH_MS;
}

/* ───────────── Una sola vez ───────────── */

const ONCE_KEY = 'gastos.animacionesVistas';

function claimOnce(key: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(ONCE_KEY) ?? '[]') as string[];
    const r = rememberOnce(Array.isArray(list) ? list : [], key);
    if (r.fresh) localStorage.setItem(ONCE_KEY, JSON.stringify(r.list));
    return r.fresh;
  } catch {
    return false; // sin almacenamiento, mejor no repetir la animación cada vez
  }
}

/** true solo la primera vez que se ve `key` en este móvil (p. ej. «noviembre: súper pasado»). */
export function useOnce(key: string | null | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (key && !prefersReducedMotion() && claimOnce(key)) setOn(true);
  }, [key]);
  return on;
}

/* ───────────── Cambio de mes: la pantalla se desliza hacia ese lado ───────────── */

/** Desliza lo que hay debajo de `el` (sus hermanos siguientes) hacia el lado del mes nuevo. */
export function useMonthSlide<T extends HTMLElement>(month: string) {
  const ref = useRef<T>(null);
  const prev = useRef(month);
  useEffect(() => {
    const from = prev.current;
    prev.current = month;
    const dir = monthStep(from, month);
    const el = ref.current;
    if (!dir || !el || prefersReducedMotion()) return;
    const vh = window.innerHeight;
    for (let s = el.nextElementSibling; s; s = s.nextElementSibling) {
      if (!(s instanceof HTMLElement) || !canAnimate(s) || s.classList.contains('sheet-backdrop')) continue;
      const r = s.getBoundingClientRect();
      if (r.top > vh) break;
      s.animate(
        [{ opacity: 0.2, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 280, easing: EASE },
      );
    }
  }, [month]);
  return ref;
}
