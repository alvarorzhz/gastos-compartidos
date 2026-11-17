import { describe, expect, it } from 'vitest';
import { buildXlsx } from './xlsxWrite';
import { exportSheets } from './exportData';
import type { Expense } from './types';
import type { HouseholdData } from './useHousehold';

const exp = (id: string, spent_on: string, amount_cents: number, extra: Partial<Expense> = {}): Expense => ({
  id, household_id: 'h', amount_cents, spent_on, category_id: 'c', paid_by: 'a',
  owed_cents: null, note: 'Mercadona', recurring_id: null, created_by: 'b', created_at: '', updated_at: '', ...extra,
});

function data(extra: Partial<HouseholdData> = {}): HouseholdData {
  return {
    household: { id: 'h', name: 'Casa', currency: 'EUR', default_split_user: null, default_split_percent: null },
    members: [{ household_id: 'h', user_id: 'a', display_name: 'Ana' }, { household_id: 'h', user_id: 'b', display_name: 'Bea' }],
    invitation: null,
    categories: [{ id: 'c', household_id: 'h', name: 'Súper', archived: false, alert_percent: 90 }],
    expenses: [],
    settlements: [],
    budgets: [],
    recurring: [],
    personal: [],
    personalRecurring: [],
    personalBudgets: [],
    goals: [],
    contributions: [],
    events: [],
    reactions: [],
    challenges: [],
    wishes: [],
    wishVotes: [],
    ...extra,
  };
}

const sheet = (sheets: ReturnType<typeof exportSheets>, name: string) => sheets.find((s) => s.name === name)!;

describe('exportSheets', () => {
  it('sin datos, saca las hojas vacías y con sus cabeceras', () => {
    const sheets = exportSheets(data(), '2026-11-17');
    expect(sheets.map((s) => s.name)).toEqual(['Gastos', 'Reembolsos', 'Presupuestos', 'Huchas', 'Movimientos de huchas', 'Personal (solo tuyo)']);
    for (const s of sheets) {
      expect(s.rows).toEqual([]);
      expect(s.headers.length).toBeGreaterThan(0);
      if (s.widths) expect(s.widths).toHaveLength(s.headers.length);
    }
  });

  it('cada gasto sale con su categoría, quién pagó, la parte del otro y quién lo apuntó', () => {
    const sheets = exportSheets(data({ expenses: [exp('1', '2026-11-03', 3000), exp('2', '2026-11-04', 1000, { owed_cents: 1000, paid_by: 'b', note: null, created_by: null })] }), '2026-11-17');
    const rows = sheet(sheets, 'Gastos').rows;
    expect(rows[0]).toEqual([{ date: '2026-11-03' }, 'Mercadona', 'Súper', { cents: 3000 }, 'Ana', { cents: 1500 }, 'A medias', '', '', 'Bea']);
    expect(rows[1]).toEqual([{ date: '2026-11-04' }, null, 'Súper', { cents: 1000 }, 'Bea', { cents: 1000 }, 'Personalizado', '', '', '']);
  });

  it('el presupuesto va mes a mes desde el primero con datos hasta hoy', () => {
    const sheets = exportSheets(
      data({ expenses: [exp('1', '2026-09-10', 2500)], budgets: [{ household_id: 'h', category_id: 'c', month: '2026-10-01', amount_cents: 10000 }] }),
      '2026-11-17',
    );
    const rows = sheet(sheets, 'Presupuestos').rows;
    expect(rows.map((r) => r[0])).toEqual(['Noviembre de 2026', 'Octubre de 2026', 'Septiembre de 2026']);
    expect(rows[2]).toEqual(['Septiembre de 2026', 'Súper', null, { cents: 2500 }, null]);
  });

  it('lo personal solo lleva lo de quien exporta', () => {
    const personal = [{ id: 'p', user_id: 'a', kind: 'income', category: 'Nómina', amount_cents: 200000, entry_on: '2026-11-01', note: null, recurring_id: null, created_at: '' }];
    const rows = sheet(exportSheets(data({ personal } as never), '2026-11-17'), 'Personal (solo tuyo)').rows;
    expect(rows).toEqual([[{ date: '2026-11-01' }, 'Ingreso', 'Nómina', { cents: 200000 }, null]]);
  });

  it('el Excel se puede montar con todas las hojas', () => {
    const bytes = buildXlsx(exportSheets(data({ expenses: [exp('1', '2026-11-03', 3000)] }), '2026-11-17'));
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  });
});
