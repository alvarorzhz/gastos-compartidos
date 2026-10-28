import { describe, expect, it } from 'vitest';
import {
  addDaysIso, addMonth, balanceSentence, budgetAlertText, expenseMessage, field, joinList, madridDate, monthName, parseBody,
  type NewExpense,
} from './index';

// Intl usa un espacio fino antes de «€».
const clean = (s: string | null) => s?.replace(/\s/g, ' ') ?? null;

function expense(id: string, amount_cents: number, note: string | null = null): NewExpense {
  return { id, amount_cents, spent_on: '2026-10-05', category_id: 'super', note };
}

describe('lo que manda quien llama', () => {
  it('lee JSON', () => {
    expect(parseBody('{"test":true}')).toEqual({ test: true });
  });
  it('lee el formulario del atajo del iPhone', () => {
    expect(parseBody('importe=12,30&tienda=Mercadona')).toEqual({ importe: '12,30', tienda: 'Mercadona' });
  });
  it('sin cuerpo, o con algo que no es un objeto, devuelve un objeto vacío', () => {
    expect(parseBody('')).toEqual({});
    expect(parseBody('null')).toEqual({});
    expect(parseBody('[1,2]')).toEqual({});
    expect(parseBody('42')).toEqual({});
  });
  it('los campos del atajo pueden llegar como número, texto o nada', () => {
    expect(field(12.3)).toBe('12.3');
    expect(field('12,30')).toBe('12,30');
    expect(field(undefined)).toBe('');
    expect(field({})).toBe('');
  });
});

describe('aviso a la pareja', () => {
  const name = (id: string) => (id === 'super' ? 'Supermercado' : undefined);

  it('un gasto: importe, concepto y categoría', () => {
    const m = expenseMessage('Ana', [expense('e1', 2340, 'Mercadona')], name);
    expect(clean(m.title)).toBe('Ana apuntó 23,40 €');
    expect(m.body).toBe('Mercadona · Supermercado');
    expect(m.tag).toBe('gasto-e1');
  });
  it('sin concepto, solo la categoría', () => {
    expect(expenseMessage('Ana', [expense('e1', 500)], name).body).toBe('Supermercado');
  });
  it('varios gastos: cuántos y el total', () => {
    const m = expenseMessage('Ana', [expense('e1', 1000), expense('e2', 250)], name);
    expect(m.title).toBe('Ana apuntó 2 gastos');
    expect(clean(m.body)).toBe('En total, 12,50 €');
  });
});

describe('avisos de presupuesto', () => {
  it('avisa al cruzar el % de aviso', () => {
    expect(clean(budgetAlertText(8000, 9200, 10000, 90))).toBe('Lleváis el 92 % del presupuesto: 92,00 € de 100,00 €.');
  });
  it('no repite si ya se había pasado el % de aviso', () => {
    expect(budgetAlertText(9100, 9500, 10000, 90)).toBeNull();
  });
  it('avisa al pasarse del límite, aunque a la vez cruce el % de aviso', () => {
    expect(clean(budgetAlertText(8000, 10500, 10000, 90))).toBe('Os habéis pasado del presupuesto: 105,00 € de 100,00 € (105 %).');
  });
  it('justo en el límite aún no se ha pasado', () => {
    expect(budgetAlertText(9500, 10000, 10000, 100)).toContain('100 %');
    expect(budgetAlertText(9500, 10000, 10000, 100)).not.toContain('pasado');
  });
  it('sin presupuesto no avisa', () => {
    expect(budgetAlertText(0, 5000, 0, 90)).toBeNull();
  });
});

describe('saldo en una frase', () => {
  const a = { user_id: 'a', display_name: 'Alvaro' };
  const b = { user_id: 'b', display_name: 'Patri' };

  it('a medias: quien no pagó debe la mitad', () => {
    expect(clean(balanceSentence(a, b, [{ amount_cents: 5000, owed_cents: null, paid_by: 'a' }], []))).toBe('Para quedar en paz, Patri le pasa 25,00 € a Alvaro.');
  });
  it('usa owed_cents cuando el reparto no es a medias', () => {
    expect(clean(balanceSentence(a, b, [{ amount_cents: 5000, owed_cents: 5000, paid_by: 'b' }], []))).toBe('Para quedar en paz, Alvaro le pasa 50,00 € a Patri.');
  });
  it('los reembolsos cuentan', () => {
    const expenses = [{ amount_cents: 5000, owed_cents: null, paid_by: 'a' }];
    expect(balanceSentence(a, b, expenses, [{ amount_cents: 2500, from_user: 'b', to_user: 'a' }])).toBe('Estáis en paz.');
  });
});

describe('fechas y textos', () => {
  it('suma meses y días cruzando el año', () => {
    expect(addMonth('2026-12-01')).toBe('2027-01-01');
    expect(addMonth('2026-02-01')).toBe('2026-03-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2026-12-28', 7)).toBe('2027-01-04');
  });
  it('la fecha de hoy es la de España', () => {
    expect(madridDate(new Date('2026-10-27T23:30:00Z'))).toBe('2026-10-28');
    expect(madridDate(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
  });
  it('nombre del mes con mayúscula', () => {
    expect(monthName('2026-10-01')).toBe('Octubre');
  });
  it('lista con «y»', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['Luz'])).toBe('Luz');
    expect(joinList(['Luz', 'Agua', 'Gas'])).toBe('Luz, Agua y Gas');
  });
});
