import { addDays } from './dates';
import { formatEuros } from './money';
import type { ReceiptGuess } from './receipt';

/*
 * Lo dudoso de un ticket escaneado: la lectura (sobre todo con foto) se equivoca en cifras,
 * fechas y nombres. Aquí se decide qué conviene mirar antes de guardar y por qué, para
 * marcarlo en el formulario. Cada motivo es una frase corta para enseñarla tal cual.
 */

export interface ReceiptDoubts {
  total: string | null;
  date: string | null;
  merchant: string | null;
  /** Por línea del ticket (su posición en guess.lines). */
  lines: Map<number, string>;
}

/** Un importe así en un ticket suele ser una coma mal leída. */
const VERY_HIGH = 100_000;
/** Más antigua que esto, la fecha probablemente está mal leída. */
const OLD_DAYS = 60;

export function receiptDoubts(g: ReceiptGuess, todayIso: string): ReceiptDoubts {
  const priced = g.lines.filter((l) => l.cents > 0);
  const sum = g.lines.reduce((s, l) => s + l.cents, 0);

  let total: string | null = null;
  if (g.amountCents == null) total = 'No he encontrado el total: escríbelo tú.';
  else if (g.linesMatchTotal) total = null;
  else if (g.lines.length >= 2 && sum > 0) total = `Los productos suman ${formatEuros(sum)} y el total leído es ${formatEuros(g.amountCents)}: mira cuál está bien.`;
  else if (g.totalCertainty === 0) total = 'No he visto la palabra «total»: he puesto el importe más alto del ticket.';
  else if (g.totalCertainty === 1) total = 'Lo he sacado de la línea del pago, no del total: compruébalo.';
  else if (g.amountCents >= VERY_HIGH) total = 'Es mucho para un ticket: comprueba que la coma de los céntimos está bien.';

  let date: string | null = null;
  if (!g.date) date = 'No he leído la fecha del ticket: comprueba que es la de la compra.';
  else if (g.date < addDays(todayIso, -OLD_DAYS)) date = `La fecha leída es de hace más de ${OLD_DAYS} días: puede estar mal leída.`;

  // Una tienda conocida trae su categoría; si no, el nombre sale de la primera línea del ticket.
  const merchant = g.merchant && !g.categoryName ? 'El nombre de la tienda sale tal cual del ticket: puede tener letras cambiadas.' : null;

  const lines = new Map<number, string>();
  g.lines.forEach((l, i) => {
    if (l.cents <= 0) return; // descuentos y devoluciones
    const letters = l.name.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, '').length;
    const compact = l.name.replace(/\s/g, '').length || 1;
    // Si la suma cuadra con el total, los precios están bien: solo se miran los nombres.
    if (!g.linesMatchTotal && g.amountCents != null && l.cents > g.amountCents) lines.set(i, 'Cuesta más que el total: precio mal leído');
    else if (!g.linesMatchTotal && priced.length >= 3 && g.amountCents != null && l.cents > g.amountCents * 0.5) lines.set(i, 'Precio muy alto para un solo producto');
    else if (l.quantity > 24) lines.set(i, `¿${l.quantity} unidades? Cantidad rara`);
    else if (letters < 3) lines.set(i, 'Nombre muy corto: puede estar mal leído');
    else if (letters / compact < 0.55) lines.set(i, 'Nombre con símbolos raros: revísalo');
  });

  return { total, date, merchant, lines };
}

/** Cuántas cosas hay que mirar. */
export function doubtCount(d: ReceiptDoubts): number {
  return [d.total, d.date, d.merchant].filter(Boolean).length + d.lines.size;
}
