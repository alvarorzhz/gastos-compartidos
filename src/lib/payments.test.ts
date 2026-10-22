import { describe, expect, it } from 'vitest';
import { personalCategoryFor, prefillOf, type PendingPayment } from './payments';
import type { PersonalEntry } from './types';

const payment = (over: Partial<PendingPayment> = {}): PendingPayment => ({
  id: 'p1', user_id: 'u1', amount_cents: 2340, merchant: 'Mercadona', card: 'Visa', raw_amount: '23,40 €',
  paid_at: new Date(2026, 9, 21, 13, 5).toISOString(), ...over,
});

const entry = (note: string, category: string, kind: PersonalEntry['kind'] = 'expense'): PersonalEntry => ({
  id: note + category, user_id: 'u1', kind, amount_cents: 100, entry_on: '2026-10-01', category, note, recurring_id: null, created_at: '',
});

describe('pagos con Apple Pay', () => {
  it('rellena importe, tienda y la fecha local del pago', () => {
    expect(prefillOf(payment())).toEqual({ amountCents: 2340, note: 'Mercadona', date: '2026-10-21' });
    expect(prefillOf(payment({ amount_cents: null, merchant: null }))).toMatchObject({ amountCents: null, note: '' });
  });

  it('categoría personal: la de la última vez con esa tienda', () => {
    expect(personalCategoryFor('MERCADONA', [entry('Mercadona', 'Casa'), entry('Mercadona', 'Supermercado')])).toBe('Casa');
    expect(personalCategoryFor('Mercadona', [entry('Mercadona', 'Nómina', 'income')])).toBe('Supermercado');
  });

  it('categoría personal: la que se reconoce por la tienda, o ninguna', () => {
    expect(personalCategoryFor('Media Markt', [])).toBe('Electrónica');
    expect(personalCategoryFor('Tienda de Paco', [])).toBeNull();
    expect(personalCategoryFor('', [])).toBeNull();
  });
});
