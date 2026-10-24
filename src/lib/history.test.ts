import { describe, expect, it } from 'vitest';
import { describeChange, groupByDay, type ExpenseChange } from './history';
import type { Category, Member } from './types';

/** Intl separa el importe del € con un espacio duro. */
const plain = (s: string) => s.replace(/ /g, ' ');

const cats: Category[] = [
  { id: 'casa', household_id: 'h', name: 'Casa', archived: false, alert_percent: 90 },
  { id: 'ocio', household_id: 'h', name: 'Ocio', archived: false, alert_percent: 90 },
];
const members: Member[] = [
  { household_id: 'h', user_id: 'a', display_name: 'Ana' },
  { household_id: 'h', user_id: 'b', display_name: 'Bea' },
];
const row = { amount_cents: 1250, category_id: 'casa', note: 'Súper', paid_by: 'a', spent_on: '2026-10-20', owed_cents: null };
const change = (extra: Partial<ExpenseChange>): ExpenseChange => ({
  id: 1, household_id: 'h', expense_id: 'e', action: 'insert', changed_by: 'a', changed_at: '2026-10-24T10:00:00Z',
  old_row: null, new_row: row, ...extra,
});

describe('describeChange', () => {
  it('cuenta quién apuntó o borró qué', () => {
    expect(plain(describeChange(change({}), members, cats, 'a').title)).toBe('Tú apuntaste 12,50 € · Súper');
    expect(plain(describeChange(change({ action: 'delete', changed_by: 'b', old_row: row, new_row: null }), members, cats, 'a').title))
      .toBe('Bea borró 12,50 € · Súper');
  });

  it('usa la categoría si no hay concepto y avisa de lo apuntado solo', () => {
    const line = describeChange(change({ changed_by: null, new_row: { ...row, note: null } }), members, cats, 'a');
    expect(plain(line.title)).toBe('La app apuntó 12,50 € · Casa');
    expect(line.meta).toMatch(/solo/);
  });

  it('en una edición dice qué cambió', () => {
    const line = describeChange(
      change({ action: 'update', old_row: row, new_row: { ...row, amount_cents: 1500, category_id: 'ocio', paid_by: 'b', owed_cents: 500 } }),
      members, cats, 'b',
    );
    expect(line.details.map(plain)).toEqual(['Importe: 12,50 € → 15,00 €', 'Categoría: Casa → Ocio', 'Pagó: Ana → Tú', 'Cambió el reparto']);
  });

  it('una cuenta borrada sale como tal', () => {
    expect(describeChange(change({ changed_by: 'x' }), members, cats, 'a').title).toMatch(/^Cuenta borrada apuntó/);
  });
});

describe('groupByDay', () => {
  it('agrupa en hoy, ayer y fechas', () => {
    const now = new Date(2026, 9, 24, 20);
    const at = (d: number, h = 12) => ({ changed_at: new Date(2026, 9, d, h).toISOString() });
    const groups = groupByDay([at(24, 18), at(24, 9), at(23), at(12)], now);
    expect(groups.map((g) => [g.day, g.items.length])).toEqual([['Hoy', 2], ['Ayer', 1], ['12 de octubre', 1]]);
  });
});
