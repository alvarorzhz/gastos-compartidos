import { describe, expect, it } from 'vitest';
import { easeOutCubic, tweenCents } from './motion';

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
