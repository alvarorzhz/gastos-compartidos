import { describe, expect, it } from 'vitest';
import { parseReceipt } from './receipt';
import { pdfTextLines, type PdfTextItem } from './pdfText';

const item = (str: string, x: number, y: number): PdfTextItem => ({ str, x, y, width: str.length * 6, height: 10 });

describe('pdfTextLines', () => {
  it('junta los trozos de cada línea, de arriba abajo y de izquierda a derecha', () => {
    const lines = pdfTextLines([
      item('2.21', 210, 700),
      item('GALLO NAT 100% HELICE LEN 250G', 0, 700.4),
      item('1', 250, 699.8),
      item('>> ALIMENTACION SECA', 0, 712),
      item('TOTAL', 186, 724),
      item('IVA', 240, 724),
      item(' ', 0, 690),
      item('12 X 0.30€', 48, 688),
      item('3.60', 210, 688),
    ]);
    expect(lines).toEqual(['TOTAL IVA', '>> ALIMENTACION SECA', 'GALLO NAT 100% HELICE LEN 250G 2.21 1', '12 X 0.30€ 3.60']);
  });

  it('no mete espacios dentro de una palabra partida en trozos', () => {
    expect(pdfTextLines([item('Lec', 0, 10), item('lerc', 18, 10)])).toEqual(['Leclerc']);
  });

  it('un ticket en PDF de E.Leclerc se lee entero y cuadra con el total', () => {
    const rows = [
      ['E.Leclerc'], ['Caja 005-0160 2026-10-22 18:43'], ['TOTAL', 'IVA'], ['>> LIQUIDOS'],
      ['FRIZZ FIZZY VERD 5.5 LATA 33CL', '1.14', '2'], ['AGUA MINERAL 2L IFA'], ['12 X 0.30€', '3.60', '1'],
      ['Total 36 Artículos', '4.74'], ['************9320 Tarjeta', '4.74'], ['IMPORTE:', '4,74 EUR'],
    ];
    const items = rows.flatMap((parts, row) => parts.map((p, i) => item(p, i * 200, 1000 - row * 12)));
    const r = parseReceipt(pdfTextLines(items).join('\n'), '2026-10-23');
    expect(r).toMatchObject({ amountCents: 474, date: '2026-10-22', merchant: 'E.Leclerc', linesMatchTotal: true });
    expect(r.lines).toEqual([
      { name: 'FRIZZ FIZZY VERD 5.5 LATA 33CL', cents: 114, quantity: 1 },
      { name: 'AGUA MINERAL 2L IFA', cents: 360, quantity: 12 },
    ]);
  });
});
