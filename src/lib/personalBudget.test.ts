import { describe, expect, it } from 'vitest';
import { budgetAlerts, budgetRows, monthlyFlows, suggestedLimit, trend } from './personalBudget';
import type { PersonalBudget, PersonalEntry } from './types';

let seq = 0;
const e = (kind: PersonalEntry['kind'], amount_cents: number, entry_on: string, category = 'Supermercado'): PersonalEntry => ({
  id: String(++seq), user_id: 'a', kind, amount_cents, entry_on, category, note: null, recurring_id: null, created_at: '',
});
const b = (category: string, amount_cents: number): PersonalBudget => ({ user_id: 'a', category, amount_cents, updated_at: '' });

describe('budgetRows', () => {
  it('junta lo gastado del mes con su límite, primero lo que tiene límite', () => {
    const rows = budgetRows(
      [e('expense', 18500, '2026-10-03'), e('expense', 4000, '2026-10-05', 'Ocio'), e('expense', 9999, '2026-09-30')],
      [b('Supermercado', 20000), b('Ropa', 5000)],
      '2026-10-01',
    );
    expect(rows).toEqual([
      { category: 'Supermercado', spentCents: 18500, limitCents: 20000 },
      { category: 'Ropa', spentCents: 0, limitCents: 5000 },
      { category: 'Ocio', spentCents: 4000, limitCents: null },
    ]);
    expect(budgetAlerts(rows).map((r) => r.category)).toEqual(['Supermercado']);
  });
});

describe('suggestedLimit', () => {
  it('propone la media de los tres meses anteriores, redondeada a 5 €', () => {
    const list = [e('expense', 18000, '2026-07-10'), e('expense', 21000, '2026-08-10'), e('expense', 19900, '2026-09-10'), e('expense', 99999, '2026-10-01')];
    expect(suggestedLimit(list, 'Supermercado', '2026-10-01')).toBe(19500);
    expect(suggestedLimit(list, 'Ropa', '2026-10-01')).toBeNull();
  });
});

describe('monthlyFlows', () => {
  it('suma ingresos y gastos de cada mes, o solo una categoría', () => {
    const list = [e('income', 200000, '2026-09-28', 'Nómina'), e('expense', 5000, '2026-09-02'), e('expense', 3000, '2026-10-02', 'Ocio')];
    expect(monthlyFlows(list, '2026-10-01', 2)).toEqual([
      { month: '2026-09-01', incomeCents: 200000, expenseCents: 5000 },
      { month: '2026-10-01', incomeCents: 0, expenseCents: 3000 },
    ]);
    expect(monthlyFlows(list, '2026-10-01', 2, 'Ocio').map((f) => [f.incomeCents, f.expenseCents])).toEqual([[0, 0], [0, 3000]]);
  });
});

describe('trend', () => {
  it('sigue la subida de los últimos meses', () => {
    const t = trend([10000, 12000, 14000, 16000])!;
    expect(t).toMatchObject({ next: [18000, 20000, 22000], direction: 'up', months: 4 });
  });

  it('estable si casi no cambia', () => {
    expect(trend([200000, 201000, 199500])!.direction).toBe('flat');
  });

  it('no baja de cero', () => {
    expect(trend([3000, 2000, 1000])!.next).toEqual([0, 0, 0]);
  });

  it('sin tres meses con datos no inventa nada', () => {
    expect(trend([0, 0, 0, 5000, 6000])).toBeNull();
  });
});
