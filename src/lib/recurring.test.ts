import { describe, expect, it } from 'vitest';
import { monthlyEquivalent, recurringDate } from './recurring';

describe('recurringDate', () => {
  it('suma semanas', () => {
    expect(recurringDate('2026-12-28', 'weekly', 1)).toBe('2027-01-04');
  });
  it('conserva el día del mes y ajusta al último día cuando no existe', () => {
    expect(recurringDate('2026-01-31', 'monthly', 1)).toBe('2026-02-28');
    expect(recurringDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(recurringDate('2026-11-15', 'monthly', 3)).toBe('2027-02-15');
  });
  it('suma años, también desde el 29 de febrero', () => {
    expect(recurringDate('2024-02-29', 'yearly', 1)).toBe('2025-02-28');
    expect(recurringDate('2024-02-29', 'yearly', 4)).toBe('2028-02-29');
  });
});

describe('monthlyEquivalent', () => {
  it('pasa cada frecuencia a euros al mes', () => {
    expect(monthlyEquivalent({ amount_cents: 1200, frequency: 'monthly' })).toBe(1200);
    expect(monthlyEquivalent({ amount_cents: 1200, frequency: 'yearly' })).toBe(100);
    expect(monthlyEquivalent({ amount_cents: 1200, frequency: 'weekly' })).toBe(5200);
  });
});
