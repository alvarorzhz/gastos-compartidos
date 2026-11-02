import { describe, expect, it } from 'vitest';
import { arrivals, easeOutCubic, monthStep, rememberOnce, shouldFadeOut, tweenCents } from './motion';

describe('easeOutCubic', () => {
  it('va de 0 a 1 y frena al final', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
  it('no se sale de 0 a 1', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe('tweenCents', () => {
  it('empieza en el valor de partida y acaba exacto en el final', () => {
    expect(tweenCents(0, 12345, 0)).toBe(0);
    expect(tweenCents(0, 12345, 1)).toBe(12345);
    expect(tweenCents(0, 12345, 1.2)).toBe(12345);
  });
  it('da siempre céntimos enteros, también bajando o en negativo', () => {
    for (const t of [0.1, 0.33, 0.5, 0.77]) {
      expect(Number.isInteger(tweenCents(0, 999, t))).toBe(true);
      const down = tweenCents(5000, -2000, t);
      expect(Number.isInteger(down)).toBe(true);
      expect(down).toBeLessThanOrEqual(5000);
      expect(down).toBeGreaterThanOrEqual(-2000);
    }
  });
});

describe('arrivals', () => {
  it('la primera carga no trae nada nuevo', () => {
    expect(arrivals(null, ['a', 'b'])).toEqual([]);
  });
  it('devuelve solo lo que no estaba', () => {
    expect(arrivals(new Set(['a']), ['c', 'a', 'b'])).toEqual(['c', 'b']);
  });
});

describe('monthStep', () => {
  it('sabe si se va hacia atrás o hacia delante, también entre años', () => {
    expect(monthStep('2026-11', '2026-10')).toBe(-1);
    expect(monthStep('2026-12', '2027-01')).toBe(1);
    expect(monthStep('2026-11', '2026-11')).toBe(0);
  });
});

describe('shouldFadeOut', () => {
  it('solo al quitar una o dos filas y quedar otras', () => {
    expect(shouldFadeOut(1, 5)).toBe(true);
    expect(shouldFadeOut(2, 1)).toBe(true);
    expect(shouldFadeOut(3, 5)).toBe(false);
    expect(shouldFadeOut(1, 0)).toBe(false);
    expect(shouldFadeOut(0, 4)).toBe(false);
  });
});

describe('rememberOnce', () => {
  it('la primera vez es nueva y la segunda ya no', () => {
    const a = rememberOnce([], 'x');
    expect(a).toEqual({ fresh: true, list: ['x'] });
    expect(rememberOnce(a.list, 'x').fresh).toBe(false);
  });
  it('se queda solo con las últimas', () => {
    expect(rememberOnce(['a', 'b', 'c'], 'd', 3).list).toEqual(['b', 'c', 'd']);
  });
});
