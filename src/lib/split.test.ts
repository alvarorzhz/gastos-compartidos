import { describe, expect, it } from 'vitest';
import { choiceOf, formatPercent, owedFromSplit, simpleSplit, splitForChoice, splitFromExpense } from './split';
import type { Expense } from './types';

const ME = 'me';
const OTHER = 'other';
const base: Expense = {
  id: '1', household_id: 'h', amount_cents: 10000, spent_on: '2026-10-13', category_id: 'c', paid_by: ME,
  owed_cents: null, note: null, recurring_id: null, created_by: ME, created_at: '', updated_at: '',
};

describe('owedFromSplit', () => {
  it('50/50 se guarda como null', () => {
    expect(owedFromSplit({ mode: 'equal', myShare: '' }, 10000, true)).toBeNull();
  });

  it('porcentaje: si pago yo, la otra persona debe su parte', () => {
    expect(owedFromSplit({ mode: 'percent', myShare: '60' }, 10000, true)).toBe(4000);
  });

  it('porcentaje: si paga la otra persona, debo mi parte', () => {
    expect(owedFromSplit({ mode: 'percent', myShare: '60' }, 10000, false)).toBe(6000);
  });

  it('todo mío pagado por la otra persona: lo debo entero', () => {
    expect(owedFromSplit({ mode: 'percent', myShare: '100' }, 2550, false)).toBe(2550);
  });

  it('importe: mi parte en euros', () => {
    expect(owedFromSplit({ mode: 'amount', myShare: '30,25' }, 10000, true)).toBe(6975);
    expect(owedFromSplit({ mode: 'amount', myShare: '0' }, 10000, false)).toBe(0);
  });

  it.each([
    { mode: 'percent' as const, myShare: '120' },
    { mode: 'percent' as const, myShare: '' },
    { mode: 'percent' as const, myShare: 'abc' },
    { mode: 'amount' as const, myShare: '150' },
    { mode: 'amount' as const, myShare: '' },
  ])('rechaza %o', (split) => {
    expect(owedFromSplit(split, 10000, true)).toBe('invalid');
  });
});

describe('splitFromExpense', () => {
  it('sin reparto propio vuelve a 50/50', () => {
    expect(splitFromExpense(base, ME).mode).toBe('equal');
    expect(splitFromExpense(null, ME).mode).toBe('equal');
  });

  it('recupera el porcentaje desde cualquiera de las dos cuentas', () => {
    const e = { ...base, owed_cents: 4000 };
    expect(splitFromExpense(e, ME)).toEqual({ mode: 'percent', myShare: '60' });
    expect(splitFromExpense(e, OTHER)).toEqual({ mode: 'percent', myShare: '40' });
  });

  it('usa euros si el porcentaje no es redondo', () => {
    expect(splitFromExpense({ ...base, amount_cents: 999, owed_cents: 333 }, ME)).toEqual({ mode: 'amount', myShare: '6,66' });
  });

  it('ida y vuelta conserva el reparto', () => {
    for (const owed of [0, 1, 4000, 6975, 10000]) {
      for (const who of [ME, OTHER]) {
        const e = { ...base, owed_cents: owed };
        expect(owedFromSplit(splitFromExpense(e, who), e.amount_cents, e.paid_by === who)).toBe(owed);
      }
    }
  });
});

describe('opciones del formulario', () => {
  it('reconoce a medias, todo mío y todo suyo', () => {
    expect(choiceOf({ mode: 'equal', myShare: '50' })).toBe('equal');
    expect(choiceOf({ mode: 'percent', myShare: '50' })).toBe('equal');
    expect(choiceOf({ mode: 'percent', myShare: '100' })).toBe('mine');
    expect(choiceOf({ mode: 'percent', myShare: '0' })).toBe('theirs');
    expect(choiceOf({ mode: 'percent', myShare: '60' })).toBe('custom');
    expect(choiceOf({ mode: 'amount', myShare: '6,66' })).toBe('custom');
  });

  it('todo de quien no pagó: lo debe entero; todo de quien pagó: nadie debe nada', () => {
    expect(owedFromSplit(splitForChoice('theirs'), 2550, true)).toBe(2550);
    expect(owedFromSplit(splitForChoice('mine'), 2550, false)).toBe(2550);
    expect(owedFromSplit(splitForChoice('mine'), 2550, true)).toBe(0);
    expect(owedFromSplit(splitForChoice('theirs'), 2550, false)).toBe(0);
    expect(owedFromSplit(splitForChoice('equal'), 2550, true)).toBeNull();
  });

  it('un gasto antiguo todo de uno se abre con su opción', () => {
    expect(choiceOf(splitFromExpense({ ...base, owed_cents: 10000 }, ME))).toBe('theirs');
    expect(choiceOf(splitFromExpense({ ...base, owed_cents: 10000 }, OTHER))).toBe('mine');
  });

  it('para gastos nuevos un reparto raro pasa a medias', () => {
    expect(simpleSplit({ mode: 'percent', myShare: '60' })).toEqual({ mode: 'equal', myShare: '50' });
    expect(simpleSplit({ mode: 'percent', myShare: '100' })).toEqual({ mode: 'percent', myShare: '100' });
  });
});

describe('formatPercent', () => {
  it('no enseña decimales raros', () => {
    expect(formatPercent(100 - 70.7)).toBe('29,3');
    expect(formatPercent(40)).toBe('40');
  });
});
