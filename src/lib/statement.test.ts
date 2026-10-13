import { describe, expect, it } from 'vitest';
import { describe as describeMovement, guessCategory, parseAmount, parseCsv, parseDate, parseStatement, proposeImport } from './statement';
import type { Expense, PersonalEntry } from './types';

// Así viene el Excel del BBVA (con filas de título antes de la cabecera).
const BBVA = [
  [],
  ['', '', 'Movimientos'],
  ['', '', 'Fecha de generación del informe: 13/10/2026'],
  ['', 'Fecha valor', 'Fecha', 'Concepto', 'Movimiento', 'Importe', 'Divisa', 'Disponible', 'Divisa', 'Observaciones'],
  ['', '13/10/2026', '13/10/2026', 'Bizum', 'Recibido: entrada salamanca', '18.62', 'EUR', '8014.48', 'EUR', ''],
  ['', '13/10/2026', '13/10/2026', 'Ticket futbol            bilbao       es', 'Pago con tarjeta', '-55.85', 'EUR', '7995.86', 'EUR', ''],
  ['', '10/10/2026', '13/10/2026', 'Lidl salamanca sta marta', 'Pago con tarjeta', '-8.98', 'EUR', '8051.71', 'EUR', ''],
  ['', '10/10/2026', '13/10/2026', 'Bizum', 'ENVIADO: Gasolina', '-40', 'EUR', '8060.69', 'EUR', ''],
  ['', '29/09/2026', '29/09/2026', 'Abono de nómina', 'Transferencia nomina', '1565.2', 'EUR', '9625.89', 'EUR', ''],
];

describe('parseStatement', () => {
  it('lee el Excel del BBVA usando la fecha valor (día de la compra)', () => {
    expect(parseStatement(BBVA)).toEqual([
      { date: '2026-10-13', amountCents: 1862, description: 'Bizum: entrada salamanca' },
      { date: '2026-10-13', amountCents: -5585, description: 'Ticket futbol' },
      { date: '2026-10-10', amountCents: -898, description: 'Lidl salamanca sta marta' },
      { date: '2026-10-10', amountCents: -4000, description: 'Bizum: gasolina' },
      { date: '2026-09-29', amountCents: 156520, description: 'Nómina' },
    ]);
  });

  it('acepta columnas de cargo y abono separadas', () => {
    const rows = [['Fecha', 'Descripción', 'Cargo', 'Abono'], ['01/10/2026', 'MERCADONA', '12,30', ''], ['02/10/2026', 'Devolución', '', '5,00']];
    expect(parseStatement(rows)).toEqual([
      { date: '2026-10-01', amountCents: -1230, description: 'Mercadona' },
      { date: '2026-10-02', amountCents: 500, description: 'Devolución' },
    ]);
  });

  it('falla con un mensaje claro si no hay cabecera', () => {
    expect(() => parseStatement([['hola']])).toThrow('No encuentro las columnas');
  });
});

describe('limpieza', () => {
  it('quita códigos de operación y prefijos de pasarelas de pago', () => {
    expect(describeMovement(['Www.amazon*n42uw1364', 'Pago con tarjeta'])).toBe('Amazon');
    expect(describeMovement(['Glovo 29sep s8ntzwzp', 'Pago con tarjeta'])).toBe('Glovo');
    expect(describeMovement(['Sumup  *impero', 'Pago con tarjeta'])).toBe('Impero');
    expect(describeMovement(['Bk26285 plaza mayor salam', 'Pago con tarjeta'])).toBe('Burger King');
    expect(describeMovement(['Dia 7980', 'Pago con tarjeta'])).toBe('Dia');
    expect(describeMovement(['Bizum', 'Recibido: sin concepto'])).toBe('Bizum: recibido');
  });

  it('fechas e importes en varios formatos', () => {
    expect(parseDate('09/10/2026')).toBe('2026-10-09');
    expect(parseDate('9-10-26')).toBe('2026-10-09');
    expect(parseDate('46304')).toBe('2026-10-09');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseAmount('-1.234,56 €')).toBe(-123456);
    expect(parseAmount('-8.98')).toBe(-898);
    expect(parseAmount('54')).toBe(5400);
  });

  it('sugiere categoría por el comercio', () => {
    expect(guessCategory('Carref salamanca')).toBe('Supermercado');
    expect(guessCategory('Justeat')).toBe('Restaurantes');
    expect(guessCategory('Repsol waylet')).toBe('Transporte');
    expect(guessCategory('Farmacia bautista perez t')).toBe('Salud');
    expect(guessCategory('Revolut')).toBeNull();
  });

  it('lee CSV con punto y coma y comillas', () => {
    expect(parseCsv('Fecha;Concepto;Importe\r\n01/10/2026;"Bar; Pepe";-3,50\n')).toEqual([
      ['Fecha', 'Concepto', 'Importe'],
      ['01/10/2026', 'Bar; Pepe', '-3,50'],
    ]);
  });
});

describe('proposeImport', () => {
  const categories = [
    { id: 'super', name: 'Supermercado', archived: false },
    { id: 'otros', name: 'Otros', archived: false },
    { id: 'ocio', name: 'Ocio', archived: false },
  ];
  const expense = (p: Partial<Expense>): Expense => ({
    id: 'e1', household_id: 'h', amount_cents: 898, spent_on: '2026-10-11', category_id: 'super', paid_by: 'yo', owed_cents: null,
    note: null, recurring_id: null, created_by: 'yo', created_at: '', updated_at: '', ...p,
  });
  const personal = (p: Partial<PersonalEntry>): PersonalEntry => ({
    id: 'p1', user_id: 'yo', kind: 'expense', amount_cents: 100, entry_on: '2026-09-01', category: 'Ocio', note: null, recurring_id: null, created_at: '', ...p,
  });
  const movements = parseStatement(BBVA);

  it('por defecto no apunta nada y sugiere categoría', () => {
    const rows = proposeImport(movements, { me: 'yo', expenses: [], personal: [], categories });
    expect(rows.every((r) => r.destination === 'skip' && !r.duplicate)).toBe(true);
    expect(rows[2].categoryId).toBe('super');
    expect(rows[1].categoryId).toBe('ocio');
    expect(rows[4].personalCategory).toBe('Nómina');
  });

  it('marca como ya apuntado lo que tiene el mismo importe y fecha cercana (una sola vez)', () => {
    const rows = proposeImport([...movements, movements[2]], { me: 'yo', expenses: [expense({})], personal: [], categories });
    expect(rows.map((r) => r.duplicate)).toEqual([false, false, true, false, false, false]);
    // Lo que pagó la otra persona no cuenta como duplicado.
    expect(proposeImport(movements, { me: 'yo', expenses: [expense({ paid_by: 'pareja' })], personal: [], categories })[2].duplicate).toBe(false);
  });

  it('recuerda dónde se apuntó antes algo con la misma nota', () => {
    const rows = proposeImport(movements, {
      me: 'yo',
      expenses: [expense({ note: 'Lidl salamanca sta marta', spent_on: '2026-08-01', category_id: 'otros' })],
      personal: [personal({ note: 'Ticket futbol' }), personal({ id: 'p2', kind: 'income', note: 'Nómina', category: 'Nómina', amount_cents: 1 })],
      categories,
    });
    expect(rows[2]).toMatchObject({ destination: 'common', categoryId: 'otros' });
    expect(rows[1]).toMatchObject({ destination: 'personal', personalCategory: 'Ocio' });
    expect(rows[4]).toMatchObject({ destination: 'personal', personalCategory: 'Nómina' });
    expect(rows[0].destination).toBe('skip');
  });
});
