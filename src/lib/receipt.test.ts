import { describe, expect, it } from 'vitest';
import { bestReading, parseReceipt, type ReceiptGuess } from './receipt';
import { LECLERC_OCR, LECLERC_TEXT } from './receipt.leclerc.fixture';

const TODAY = '2026-10-13';

describe('parseReceipt', () => {
  it('lee un ticket de supermercado', () => {
    const text = `MERCADONA, S.A. A-46103834
C/ MAYOR 12 MADRID
TELEFONO: 912345678
11/10/2026 19:42  OP: 123456
FACTURA SIMPLIFICADA: 2345-011-123456
Descripción        P. Unit  Importe
1 LECHE ENTERA              5,40
2 PAN BARRA        0,60     1,20
1 ACEITE OLIVA              8,95
TOTAL (€)                  15,55
TARJETA BANCARIA           15,55
IVA  BASE IMPONIBLE  CUOTA
4%   12,50          0,50`;
    const r = parseReceipt(text, TODAY);
    expect(r).toMatchObject({ amountCents: 1555, date: '2026-10-11', merchant: 'Mercadona', categoryName: 'Supermercado', linesMatchTotal: true });
    expect(r.lines).toEqual([
      { name: 'LECHE ENTERA', cents: 540, quantity: 1 },
      { name: 'PAN BARRA', cents: 120, quantity: 2 },
      { name: 'ACEITE OLIVA', cents: 895, quantity: 1 },
    ]);
  });

  it('ignora subtotales, IVA y el cambio', () => {
    const text = `BAR LA ESQUINA
Mesa 4  Camarero: Luis
Fecha: 05-10-26
2 CAÑAS      4,00
1 RACION     12,50
SUBTOTAL     16,50
IVA 10%       1,50
TOTAL A PAGAR 18,00
ENTREGADO    20,00
CAMBIO        2,00`;
    const r = parseReceipt(text, TODAY);
    expect(r.amountCents).toBe(1800);
    expect(r.date).toBe('2026-10-05');
    expect(r.merchant).toBe('Bar la esquina');
    expect(r.categoryName).toBe('Restaurantes');
  });

  it('entiende miles y el total en la línea siguiente', () => {
    const text = `IKEA IBERICA
13.09.2026
SOFA 3 PLAZAS   1.199,00
TOTAL
1.234,50`;
    expect(parseReceipt(text, TODAY)).toMatchObject({ amountCents: 123450, date: '2026-09-13', merchant: 'IKEA', categoryName: 'Casa' });
  });

  it('descarta fechas imposibles o futuras y usa el importe mayor si no hay total', () => {
    const text = `Tienda Pepe
31/02/2026  25/12/2026  01/10/2026
Cosa 3,20
Otra 7,80`;
    expect(parseReceipt(text, TODAY)).toMatchObject({ amountCents: 780, date: '2026-10-01', merchant: 'Tienda Pepe', categoryName: null });
  });

  it('devuelve vacío si no entiende nada', () => {
    expect(parseReceipt('###\n@@', TODAY)).toMatchObject({ amountCents: null, date: null, merchant: null, categoryName: null, lines: [], linesMatchTotal: false });
  });

  it('no confunde una fecha con puntos con el importe', () => {
    const text = `BAR PEPE
CAFE 1,50
TOSTADA 2,30
FECHA 16.10.2026 12:30`;
    expect(parseReceipt(text, '2026-10-16').amountCents).toBe(230);
  });
});

// Tickets reales leídos por el lector del móvil (con sus fallos de lectura), recortados.
describe('productos del ticket', () => {
  it('HiperDino: cantidades en la línea de abajo, devoluciones y un total mal leído', () => {
    const text = `E Hiper Dino
DINOSOL SUPERMERCADOS, 56
CIF. 861742565
Centro Vend. Documento Fecha Hora
9380 701042 2026/938212-00048978 27/05/2026 19:18
ARTÍCULO ———]—EATE
o - SKITILES CARAMELO CRAZY_SOUR POUCH 1 3,14 ha
TÍRMA AMBROSIA CHOCOLATE=LECHE 14 UD 3,49
ALTOS IBERIA JAMON CEBO 50% RAZA TB - . » LA
E. 2 x 6,89 - .. 13,78 E - 4 a
- ALTOS IBERIA JAMON CEBO 50% RAZA IB . - Yy
_ -1x 6,89 - -6,89 E. — .
FIRGAS AGUA SABOR FRESH LIMONADA 500 0,73 E _
BOLSA ASA REUTILIZABLE 85% RECICLA 4 0,15 Ly
Total Artículos: 5 Z ,
TOTAL COMPRA: 16,00 —
Y EFECTIVO. 0.00 7
NE TARJETA CREDITO 19-20 y
CONTACTLESS: 14.40-EUR i`;
    const r = parseReceipt(text, TODAY);
    expect(r).toMatchObject({ amountCents: 1440, merchant: 'HiperDino', date: '2026-05-27', linesMatchTotal: true });
    expect(r.lines.map((l) => [l.name, l.cents, l.quantity])).toEqual([
      ['SKITILES CARAMELO CRAZY SOUR POUCH 1', 314, 1],
      ['TÍRMA AMBROSIA CHOCOLATE LECHE 14 UD', 349, 1],
      ['ALTOS IBERIA JAMON CEBO 50% RAZA TB', 1378, 2],
      ['ALTOS IBERIA JAMON CEBO 50% RAZA IB', -689, 1],
      ['FIRGAS AGUA SABOR FRESH LIMONADA 500', 73, 1],
      ['BOLSA ASA REUTILIZABLE 85% RECICLA 4', 15, 1],
    ]);
  });

  it('Mercadona: cantidad delante y precio por unidad', () => {
    const text = `A-46103834
AVDA. DE CANARIAS, 495
25/05/2026 20:48 0P:1082708
FACTURA SIMPLIFICADA: 4653-010-501162
Descripción P. Unit Imp.(€)
1 BOLSA PLASTICO 0,15
1 FONTEBIL P-6X1L 3,00
2 CLIPPER FRESA FRIO 1,45 2,90
1 BELLOTA TAPAS 12,87
TOTAL (€) 18,92
TARJETA BANCARIA 18,92`;
    const r = parseReceipt(text, TODAY);
    expect(r).toMatchObject({ amountCents: 1892, merchant: 'Mercadona', linesMatchTotal: true });
    expect(r.lines[2]).toEqual({ name: 'CLIPPER FRESA FRIO', cents: 290, quantity: 2 });
  });

  it('Alcampo: la letra del IVA pegada al precio y ",12" sin el cero', () => {
    const text = `ALCAMPO LEGANES
FACTURA SIMPLIFICADA
AGUA MINERAL 1,09 B
BOLSA 50X60CM ,12 A
REGALIZ TACO FRE 2,188
BEBIDA TE VERDE 1,32 A
€* TOT 4,71
€ TARJETA 4,71`;
    const r = parseReceipt(text, TODAY);
    expect(r.lines.map((l) => l.cents)).toEqual([109, 12, 218, 132]);
    expect(r).toMatchObject({ amountCents: 471, merchant: 'Alcampo', linesMatchTotal: true });
  });

  it('E.Leclerc: secciones ">>", cantidades "12 X 0.30€" y la columna del IVA', () => {
    const r = parseReceipt(LECLERC_TEXT, '2026-10-22');
    expect(r).toMatchObject({ amountCents: 5463, totalCertainty: 3, date: '2026-10-22', merchant: 'E.Leclerc', categoryName: 'Supermercado', linesMatchTotal: true });
    expect(r.lines).toHaveLength(15);
    expect(r.lines[0]).toEqual({ name: 'GALLO MAT 100% HELICE LEN 250G', cents: 221, quantity: 1 });
    expect(r.lines[2]).toEqual({ name: 'AGUA MINERAL 2L IFA', cents: 360, quantity: 12 });
    expect(r.lines[10]).toEqual({ name: 'KIWI', cents: 156, quantity: 1 });
    expect(r.lines.slice(-2)).toEqual([
      { name: 'LECHE ENTERA ASTURIA BOTEL 1.5L', cents: 1182, quantity: 6 },
      { name: 'LECHE SEMIDES ASTURIA BOTEL 1.5', cents: 1074, quantity: 6 },
    ]);
  });

  it('E.Leclerc leído por el móvil: total, tienda y fecha bien, y nada del pago, el IVA ni el bono', () => {
    const r = parseReceipt(LECLERC_OCR, '2026-10-22');
    expect(r).toMatchObject({ amountCents: 5463, date: '2026-10-22', merchant: 'E.Leclerc', categoryName: 'Supermercado' });
    const names = r.lines.map((l) => l.name);
    expect(names).toContain('KIWI');
    expect(r.lines.find((l) => l.name.startsWith('AGUA MINERAL'))).toMatchObject({ cents: 360, quantity: 12 });
    expect(r.lines.find((l) => l.name.startsWith('LECHE ENTERA'))).toMatchObject({ cents: 1182, quantity: 6 });
    // Ni secciones, ni la tabla del IVA, ni el pago con tarjeta, ni el bono de regalo.
    expect(names.join(' ')).not.toMatch(/>>|LIQUIDOS|FRUTER|TARJETA|IMPORTE|GRACIAS|BONO|VALE|TOTAL/i);
    expect(r.lines.every((l) => l.cents > 0 && l.cents < 2000)).toBe(true);
  });

  it('una fecha aaaa-mm-dd no se lee al revés', () => {
    expect(parseReceipt('TIENDA PEPE\nCaja 005-0160 2026-10-22 18:43\nTOTAL 3,00', '2026-10-22').date).toBe('2026-10-22');
  });

  it('se queda con la lectura que cuadra y, si ninguna cuadra, con el total más fiable', () => {
    const base: ReceiptGuess = { amountCents: null, date: null, merchant: null, categoryName: null, lines: [], linesMatchTotal: false, totalCertainty: 0 };
    const good = { ...base, amountCents: 500, linesMatchTotal: true, lines: [{ name: 'A', cents: 200, quantity: 1 }, { name: 'B', cents: 300, quantity: 1 }] };
    expect(bestReading([{ ...base, amountCents: 900 }, good])).toBe(good);
    const fromPayment = { ...base, amountCents: 981, totalCertainty: 1, date: '2026-05-26', merchant: 'Mercadona', categoryName: 'Supermercado' };
    const guessed = { ...base, amountCents: 270, totalCertainty: 0, merchant: 'A sa AN', lines: [{ name: 'ANACARDO', cents: 270, quantity: 1 }] };
    expect(bestReading([fromPayment, guessed])).toMatchObject({ amountCents: 981, date: '2026-05-26', merchant: 'Mercadona', lines: guessed.lines });
    expect(bestReading([])).toBeNull();
  });
});
