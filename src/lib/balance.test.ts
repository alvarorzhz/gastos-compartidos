import { describe, expect, it } from 'vitest';
import { balanceFor, expenseEffect, settlementEffect, shareOf } from './balance';
import type { Expense, Settlement } from './types';

const A = 'user-a';
const B = 'user-b';

function expense(id: string, paid_by: string, amount_cents: number): Expense {
  return {
    id, household_id: 'h', amount_cents, spent_on: '2026-10-01', category_id: 'c', paid_by,
    owed_cents: null, note: null, created_by: paid_by, created_at: '', updated_at: '',
  };
}

function settlement(id: string, from_user: string, to_user: string, amount_cents: number): Settlement {
  return { id, household_id: 'h', amount_cents, paid_on: '2026-10-02', from_user, to_user, note: null, created_by: from_user, created_at: '' };
}

describe('reparto personalizado', () => {
  it('usa owed_cents en vez de la mitad', () => {
    const e = { ...expense('1', A, 10000), owed_cents: 7000 };
    expect(balanceFor(A, [e], [])).toBe(7000);
    expect(balanceFor(B, [e], [])).toBe(-7000);
  });

  it('un gasto pagado por uno pero solo del otro se debe entero', () => {
    const e = { ...expense('1', B, 2500), owed_cents: 2500 };
    expect(balanceFor(A, [e], [])).toBe(-2500);
  });

  it('un gasto con owed_cents 0 no mueve el saldo', () => {
    const e = { ...expense('1', A, 2500), owed_cents: 0 };
    expect(balanceFor(A, [e, expense('2', B, 1000)], [])).toBe(-500);
  });

  it('shareOf suma la parte de cada uno y cuadra con el total', () => {
    const expenses = [{ ...expense('1', A, 10000), owed_cents: 7000 }, expense('2', B, 999)];
    expect(shareOf(A, expenses)).toBe(3000 + 499.5);
    expect(shareOf(A, expenses) + shareOf(B, expenses)).toBe(10999);
  });
});

describe('balanceFor', () => {
  it('es cero sin movimientos', () => {
    expect(balanceFor(A, [], [])).toBe(0);
  });

  it('reparte cada gasto al 50 %', () => {
    const expenses = [expense('1', A, 10000)];
    expect(balanceFor(A, expenses, [])).toBe(5000);
    expect(balanceFor(B, expenses, [])).toBe(-5000);
  });

  it('compensa gastos de ambas personas', () => {
    const expenses = [expense('1', A, 10000), expense('2', B, 4000)];
    expect(balanceFor(A, expenses, [])).toBe(3000);
  });

  it('se recalcula al editar y borrar un gasto', () => {
    let expenses = [expense('1', A, 10000), expense('2', B, 4000)];
    expenses = expenses.map((e) => (e.id === '2' ? { ...e, amount_cents: 6000 } : e));
    expect(balanceFor(A, expenses, [])).toBe(2000);
    expenses = expenses.map((e) => (e.id === '2' ? { ...e, paid_by: A } : e));
    expect(balanceFor(A, expenses, [])).toBe(8000);
    expenses = expenses.filter((e) => e.id !== '1');
    expect(balanceFor(A, expenses, [])).toBe(3000);
  });

  it('un reembolso salda la deuda', () => {
    const expenses = [expense('1', A, 10000)];
    const settlements = [settlement('s', B, A, 5000)];
    expect(balanceFor(A, expenses, settlements)).toBe(0);
    expect(balanceFor(B, expenses, settlements)).toBe(0);
  });

  it('un reembolso de más invierte el saldo', () => {
    const settlements = [settlement('s', B, A, 7000)];
    expect(balanceFor(A, [expense('1', A, 10000)], settlements)).toBe(-2000);
  });

  it('admite importes impares sin perder céntimos', () => {
    const expenses = [expense('1', A, 999)];
    expect(balanceFor(A, expenses, [])).toBe(499.5);
    expect(balanceFor(A, expenses, []) + balanceFor(B, expenses, [])).toBe(0);
  });

  it('los efectos individuales suman el saldo', () => {
    const expenses = [expense('1', A, 1000), expense('2', B, 300)];
    const settlements = [settlement('s', B, A, 200)];
    const sum = expenses.reduce((t, e) => t + expenseEffect(A, e), 0) + settlements.reduce((t, s) => t + settlementEffect(A, s), 0);
    expect(sum).toBe(balanceFor(A, expenses, settlements));
  });
});
