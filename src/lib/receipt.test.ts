import { describe, expect, it } from 'vitest';
import { parseReceipt } from './receipt';

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
    expect(parseReceipt(text, TODAY)).toEqual({ amountCents: 1555, date: '2026-10-11', merchant: 'Mercadona', categoryName: 'Supermercado' });
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
    expect(parseReceipt('###\n@@', TODAY)).toEqual({ amountCents: null, date: null, merchant: null, categoryName: null });
  });

  it('no confunde una fecha con puntos con el importe', () => {
    const text = `BAR PEPE
CAFE 1,50
TOSTADA 2,30
FECHA 16.10.2026 12:30`;
    expect(parseReceipt(text, '2026-10-16').amountCents).toBe(230);
  });
});
