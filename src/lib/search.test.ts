import { describe, expect, it } from 'vitest';
import { filterExpenses } from './search';
import type { Expense } from './types';

const exp = (note: string | null, category_id: string, amount_cents: number, paid_by = 'a'): Expense => ({
  id: note ?? category_id, household_id: 'h', amount_cents, spent_on: '2026-10-01', category_id, paid_by,
  owed_cents: null, note, recurring_id: null, created_by: 'a', created_at: '', updated_at: '',
});

const names: Record<string, string> = { super: 'Supermercado', ocio: 'Ocio', a: 'Ana', b: 'Bea' };
const list = [exp('Café con Bea', 'ocio', 350), exp('Mercadona', 'super', 4520, 'b'), exp(null, 'super', 1000)];
const run = (text: string, categoryId = '') => filterExpenses(list, { text, categoryId }, (id) => names[id], (id) => names[id]).map((e) => e.id);

describe('filterExpenses', () => {
  it('busca sin importar tildes ni mayúsculas', () => {
    expect(run('cafe')).toEqual(['Café con Bea']);
    expect(run('MERCADONA')).toEqual(['Mercadona']);
  });
  it('busca en categoría, quién pagó e importe', () => {
    expect(run('supermercado')).toEqual(['Mercadona', 'super']);
    expect(run('bea')).toEqual(['Café con Bea', 'Mercadona']);
    expect(run('45,20')).toEqual(['Mercadona']);
  });
  it('combina palabras y filtro de categoría', () => {
    expect(run('bea super')).toEqual(['Mercadona']);
    expect(run('', 'ocio')).toEqual(['Café con Bea']);
    expect(run('mercadona', 'ocio')).toEqual([]);
  });
});
