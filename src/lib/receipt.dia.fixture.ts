// Tickets de Dia (Salamanca) para las pruebas de receipt.test.ts. La app de Dia da un PDF hecho de
// imágenes, así que pasa por el lector de fotos: esto es lo que leyó Tesseract (sin los datos de la tarjeta).
// El recuadro gris detrás del total de cada producto hace que se pierda la coma ("4,14 €" → "414€").

/** 12/11/2026, 4,14 €: leche y un pack de agua con descuentos en rojo. */
export const DIA_OCR_1 = `Compra en CL ISLAS CANARIAS 13
12/11/2026 17:22 N” de Tienda 7980
Factura simplificada N* 0798003-00737940
N? de caja: 3. N? de empleado 7798004
ID: ES-07980-03-00737940-20261112-162228
Resumen de la compra
Total sin promociones ....................................—— 5,43 €
Ofertas y cupones -1,29 €
Total a pagar.............................——.————————————————. 414€
Forma de pago
Tarjeta Tef ...........................————— anna nnann en nanees 4,14 €
Productos vendidos por Dia
DESCRIPCIÓN CANTIDAD PRECIOKG TOTAL
LECHE ENTERA AST 1L 1 ud 1,29 € 1,29€ A
LECHE ENTE ASTURIANA -0,05 €
AGUA MINER. AQUABONA 6 ud 0,69 € 414€ B
30% AQUABONA -1,24 €
Total venta Dia ..............................—.——.... a 4,14 €
Desglose de IVA
Productos vendidos por Dia
TIPO IVA BASE CUOTA
A 4% 1,719€ 0,05 €
B 10% 2,04 € 0,26 €
QR Tributario
Factura verificable en la sede electrónica de la AEAT
Datos de la operación
VENTA - OPERACION CONTACTLESS
IMPORTE: 4,714 EUROS
FECHA: 12/11/2026 HORA: 17:22
CP:37006 Salamanca
OPERACION CONTACTLESS
FIRMA NO NECESARIA`;

/** 26/03/2026, 14,08 €: leche y cerveza con descuentos. */
export const DIA_OCR_2 = `Compra en CL ISLAS CANARIAS 13
26/03/2026 17:48 N” de Tienda 7980
Factura simplificada N* 0798002-00376876
N? de caja: 2. N”? de empleado 7798003
ID: ES-07980-02-00376876-20260326-1 64834
Resumen de la compra
Total sin promociones ..............................————..—.—.——— 16,57 €
Ofertas y cupones eS
Total a pagar.....................................—.——.——.——.——. 14,08 €
Forma de pago
Tarjeta Tef ..........................—.————.. anne arena 14,08 €
Productos vendidos por Dia
DESCRIPCIÓN CANTIDAD PRECIOKG TOTAL
LCH ENT S/LAC ASTU 1 6 ud 1,38 € 828€ A
10% LECHE ASTURIANA +6 -0,83 €
MAHOU S5ESTREL PACK12 1ud 8,29 € 829€ B
MAHOU 5 ESTRELLAS -1,66 €
Total venta Dia .............................—.—... ana 14,08 €
Desglose de IVA
Productos vendidos por Dia
TIPO IVA BASE CUOTA
A 4% 716€ 0,29 €
B 21% 5,48 € 1,15€
IVA incluido
SOLUCIONES ARMIVAX, S.L. B37547502
Este ticket es imprescindible para cambios o devoluciones, excepto
artículos refrigerados y congelados
Dispone de 15 días. Esta facultad de desistimiento es adicional, y no
afecta alas garantías legales ante la falta de conformidad conforme
legislación vigente
Datos de la operación
VENTA - OPERACION CONTACTLESS
IMPORTE: 14,08 EUROS
FECHA: 26/03/2026 HORA: 18:28
CP:37006 Salamanca
OPERACION CONTACTLESS
FIRMA NO NECESARIA`;
