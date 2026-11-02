import { describe, expect, it } from 'vitest';
import type { ReceiptGuess } from './receipt';
import { doubtCount, receiptDoubts } from './receiptDoubts';

const guess = (over: Partial<ReceiptGuess> = {}): ReceiptGuess => ({
  amountCents: 1000,
  date: '2026-11-01',
  merchant: 'Mercadona',
  categoryName: 'Supermercado',
  lines: [
    { name: 'LECHE ENTERA', cents: 600, quantity: 1 },
    { name: 'PAN BARRA', cents: 400, quantity: 1 },
  ],
  linesMatchTotal: true,
  totalCertainty: 3,
  ...over,
});

describe('receiptDoubts', () => {
  it('nada que mirar si todo cuadra', () => {
    const d = receiptDoubts(guess(), '2026-11-02');
    expect(doubtCount(d)).toBe(0);
  });

  it('el total: falta, no cuadra con los productos o sale de un sitio poco fiable', () => {
    expect(receiptDoubts(guess({ amountCents: null, linesMatchTotal: false }), '2026-11-02').total).toContain('No he encontrado');
    expect(receiptDoubts(guess({ amountCents: 1900, linesMatchTotal: false }), '2026-11-02').total).toMatch(/suman 10,00.€ y el total leído es 19,00.€/);
    expect(receiptDoubts(guess({ lines: [], linesMatchTotal: false, totalCertainty: 0 }), '2026-11-02').total).toContain('importe más alto');
    expect(receiptDoubts(guess({ lines: [], linesMatchTotal: false, totalCertainty: 1 }), '2026-11-02').total).toContain('pago');
    expect(receiptDoubts(guess({ lines: [], linesMatchTotal: false, totalCertainty: 2, amountCents: 125000 }), '2026-11-02').total).toContain('coma');
    expect(receiptDoubts(guess({ lines: [], linesMatchTotal: false, totalCertainty: 2 }), '2026-11-02').total).toBeNull();
  });

  it('la fecha: falta o es muy antigua', () => {
    expect(receiptDoubts(guess({ date: null }), '2026-11-02').date).toContain('No he leído');
    expect(receiptDoubts(guess({ date: '2025-11-01' }), '2026-11-02').date).toContain('60 días');
    expect(receiptDoubts(guess({ date: '2026-10-01' }), '2026-11-02').date).toBeNull();
  });

  it('la tienda solo si no es una conocida', () => {
    expect(receiptDoubts(guess({ merchant: 'Fruteria Pepi', categoryName: null }), '2026-11-02').merchant).toContain('tal cual');
    expect(receiptDoubts(guess({ merchant: null, categoryName: null }), '2026-11-02').merchant).toBeNull();
  });

  it('marca productos con nombre o precio raros', () => {
    const d = receiptDoubts(
      guess({
        amountCents: 2000,
        linesMatchTotal: false,
        lines: [
          { name: 'LECHE', cents: 300, quantity: 1 },
          { name: 'X1', cents: 200, quantity: 1 },
          { name: '%$#·· 12 ACE', cents: 150, quantity: 1 },
          { name: 'JAMON SERRANO', cents: 2500, quantity: 1 },
          { name: 'TOMATE', cents: 1100, quantity: 1 },
          { name: 'HUEVOS', cents: 100, quantity: 40 },
          { name: 'DESCUENTO', cents: -100, quantity: 1 },
        ],
      }),
      '2026-11-02',
    );
    expect([...d.lines.keys()]).toEqual([1, 2, 3, 4, 5]);
    expect(d.lines.get(3)).toContain('más que el total');
    expect(d.lines.get(4)).toContain('muy alto');
    expect(d.lines.get(5)).toContain('40 unidades');
  });

  it('si la suma cuadra, no duda de los precios', () => {
    const d = receiptDoubts(guess({ amountCents: 1000, lines: [{ name: 'TELE', cents: 900, quantity: 1 }, { name: 'PILAS', cents: 50, quantity: 1 }, { name: 'CABLE', cents: 50, quantity: 1 }] }), '2026-11-02');
    expect(d.lines.size).toBe(0);
  });
});
