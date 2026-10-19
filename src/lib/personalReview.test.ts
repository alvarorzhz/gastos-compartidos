import { describe, expect, it } from 'vitest';
import { conceptKey, personalReview, simulateSavings } from './personalReview';
import type { PersonalEntry, PersonalRecurring } from './types';

let seq = 0;
const e = (entry_on: string, amount_cents: number, note: string | null, category = 'Otros', extra: Partial<PersonalEntry> = {}): PersonalEntry => ({
  id: String(++seq), user_id: 'a', kind: 'expense', amount_cents, entry_on, category, note, recurring_id: null, created_at: entry_on, ...extra,
});
const TODAY = '2026-10-19';

describe('conceptKey', () => {
  it('quita números y signos que añade el banco', () => {
    expect(conceptKey('NETFLIX.COM 12345')).toBe(conceptKey('Netflix.com 99'));
    expect(conceptKey(null)).toBe('');
  });
});

describe('personalReview: pagos que se repiten', () => {
  it('detecta una suscripción mensual con su coste al mes y al año', () => {
    const r = personalReview([e('2026-07-05', 1299, 'Netflix'), e('2026-08-05', 1299, 'Netflix'), e('2026-09-05', 1299, 'Netflix'), e('2026-10-05', 1299, 'Netflix')], [], TODAY);
    expect(r.payments).toHaveLength(1);
    expect(r.payments[0]).toMatchObject({ name: 'Netflix', period: 'monthly', monthlyCents: 1299, yearlyCents: 15588, review: null });
    expect(r.monthlyCents).toBe(1299);
  });

  it('marca para revisar lo que solo se ha cobrado dos veces y no lo cuenta en el total', () => {
    const r = personalReview([e('2026-09-10', 999, 'Spotify'), e('2026-10-10', 999, 'Spotify')], [], TODAY);
    expect(r.payments[0].review).toMatch(/dos veces/);
    expect(r.monthlyCents).toBe(0);
    expect(r.reviewMonthlyCents).toBe(999);
  });

  it('una suscripción que sale una vez queda para revisar, sin coste inventado', () => {
    const r = personalReview([e('2026-03-01', 4990, 'Amazon Prime')], [], TODAY);
    expect(r.payments[0]).toMatchObject({ period: null, monthlyCents: null });
    expect(r.payments[0].review).toBeTruthy();
  });

  it('avisa de lo que no se cobra desde hace tiempo', () => {
    const r = personalReview([e('2026-03-01', 500, 'Gimnasio'), e('2026-04-01', 500, 'Gimnasio'), e('2026-05-01', 500, 'Gimnasio')], [], TODAY);
    expect(r.payments[0].review).toMatch(/cancelado/);
  });

  it('no confunde el súper (importes muy distintos) con una suscripción', () => {
    const r = personalReview([e('2026-08-01', 2000, 'Mercadona'), e('2026-09-01', 8000, 'Mercadona'), e('2026-10-01', 4500, 'Mercadona')], [], TODAY);
    expect(r.payments).toHaveLength(0);
  });

  it('incluye los fijos y no los cuenta dos veces', () => {
    const fixed: PersonalRecurring = {
      id: 'f1', user_id: 'a', kind: 'expense', amount_cents: 3000, category: 'Salud', note: 'Gimnasio', frequency: 'monthly',
      start_on: '2026-08-01', generated_count: 3, active: true, created_at: '',
    };
    const r = personalReview([
      e('2026-08-01', 3000, 'Gimnasio', 'Salud', { recurring_id: 'f1' }),
      e('2026-09-01', 3000, 'Gimnasio', 'Salud', { recurring_id: 'f1' }),
      e('2026-10-01', 3000, 'Gimnasio', 'Salud', { recurring_id: 'f1' }),
    ], [fixed], TODAY);
    expect(r.payments).toHaveLength(1);
    expect(r.payments[0]).toMatchObject({ fixed: true, monthlyCents: 3000, count: 3 });
  });
});

describe('personalReview: avisos', () => {
  it('cobro anual que se renueva solo, con la fecha de la próxima renovación', () => {
    const r = personalReview([e('2025-03-02', 4990, 'Amazon Prime'), e('2026-03-02', 4990, 'Amazon Prime')], [], TODAY);
    const a = r.alerts.find((x) => x.kind === 'annual')!;
    expect(a).toMatchObject({ date: '2027-03-02', amountCents: 4990, review: false });
    expect(r.payments[0]).toMatchObject({ period: 'yearly', monthlyCents: 416 });
  });

  it('cobro duplicado del mismo pago', () => {
    const r = personalReview([
      e('2026-08-05', 1299, 'Netflix'), e('2026-09-05', 1299, 'Netflix'), e('2026-10-05', 1299, 'Netflix'), e('2026-10-06', 1299, 'Netflix'),
    ], [], TODAY);
    const dup = r.alerts.filter((x) => x.kind === 'duplicate');
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ date: '2026-10-06', amountCents: 1299, review: true });
    // El duplicado no cambia la frecuencia.
    expect(r.payments[0].period).toBe('monthly');
  });

  it('no toma por duplicado dos cafés el mismo día', () => {
    const cafes = ['2026-10-01', '2026-10-01', '2026-10-03', '2026-10-06', '2026-10-08', '2026-10-10'].map((d) => e(d, 150, 'Café'));
    expect(personalReview(cafes, [], TODAY).alerts.filter((x) => x.kind === 'duplicate')).toHaveLength(0);
  });

  it('prueba de 0,99 € que pasa a ser de pago', () => {
    const r = personalReview([e('2026-07-01', 99, 'Disney plus'), e('2026-08-01', 899, 'Disney plus'), e('2026-09-01', 899, 'Disney plus'), e('2026-10-01', 899, 'Disney plus')], [], TODAY);
    const t = r.alerts.find((x) => x.kind === 'trial')!;
    expect(t).toMatchObject({ date: '2026-08-01', amountCents: 899, review: true });
  });

  it('comisiones del banco con su fecha e importe', () => {
    const r = personalReview([e('2026-10-02', 1500, 'Comision mantenimiento'), e('2026-09-02', 300, 'Cuota tarjeta')], [], TODAY);
    const fees = r.alerts.filter((x) => x.kind === 'fee');
    expect(fees.map((f) => [f.date, f.amountCents, f.review])).toEqual([['2026-10-02', 1500, false], ['2026-09-02', 300, true]]);
    expect(r.feesYearCents).toBe(1500);
  });
});

describe('personalReview: gastos hormiga', () => {
  it('suma lo pequeño que se repite y calcula el año a este ritmo', () => {
    const cafes = Array.from({ length: 12 }, (_, i) => e(`2026-09-${String(i * 2 + 1).padStart(2, '0')}`, 150, 'Café'));
    const r = personalReview([e('2026-07-21', 5000, 'Ropa'), ...cafes], [], TODAY);
    expect(r.habits).toHaveLength(1);
    expect(r.habits[0]).toMatchObject({ name: 'Café', count: 12, averageCents: 150, totalCents: 1800 });
    // 1.800 en 91 días → al año.
    expect(r.habits[0].yearlyCents).toBe(Math.round((1800 * 365) / 91));
  });

  it('lo agrupado sin nota queda para revisar', () => {
    const list = Array.from({ length: 6 }, (_, i) => e(`2026-10-${String(i + 1).padStart(2, '0')}`, 300, null, 'Comida fuera'));
    const r = personalReview(list, [], TODAY);
    expect(r.habits[0].review).toMatch(/sin nota/);
  });

  it('no cuenta lo grande ni lo que se repite poco', () => {
    const r = personalReview([e('2026-08-01', 5000, 'Cena'), e('2026-08-15', 5000, 'Cena'), e('2026-09-01', 5000, 'Cena'), e('2026-10-01', 5000, 'Cena'), e('2026-10-10', 200, 'Kiosko')], [], TODAY);
    expect(r.habits).toHaveLength(0);
  });
});

describe('simulateSavings', () => {
  it('suma lo marcado al mes y al año', () => {
    const cafes = Array.from({ length: 12 }, (_, i) => e(`2026-09-${String(i * 2 + 1).padStart(2, '0')}`, 150, 'Café'));
    const netflix = ['07', '08', '09', '10'].map((m) => e(`2026-${m}-05`, 1299, 'Netflix'));
    const r = personalReview([e('2026-07-21', 5000, 'Ropa'), ...cafes, ...netflix], [], TODAY);
    const s = simulateSavings(r, new Set([r.payments[0].key, r.habits[0].key]));
    expect(s.monthlyCents).toBe(1299 + r.habits[0].monthlyCents);
    expect(s.yearlyCents).toBe(15588 + r.habits[0].yearlyCents);
    expect(simulateSavings(r, new Set())).toEqual({ monthlyCents: 0, yearlyCents: 0 });
  });
});
