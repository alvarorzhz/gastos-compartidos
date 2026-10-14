import { describe, expect, it } from 'vitest';
import { readXlsx } from './xlsx';
import { buildXlsx } from './xlsxWrite';

describe('buildXlsx', () => {
  it('genera un Excel que se puede volver a leer', async () => {
    const bytes = buildXlsx([
      { name: 'Gastos', headers: ['Fecha', 'Concepto', 'Importe'], rows: [[{ date: '2026-10-14' }, 'Café & <bollo>', { cents: 1250 }], [null, 'Sin fecha', 3]] },
      { name: 'Otra/hoja', headers: ['A'], rows: [] },
    ]);
    const rows = await readXlsx(bytes.slice().buffer);
    expect(rows).toEqual([
      ['Fecha', 'Concepto', 'Importe'],
      ['46309', 'Café & <bollo>', '12.5'],
      ['', 'Sin fecha', '3'],
    ]);
  });
});
