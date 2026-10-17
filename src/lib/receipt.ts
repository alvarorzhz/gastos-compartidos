import { normalize } from './search';

export interface ReceiptGuess {
  amountCents: number | null;
  date: string | null; // YYYY-MM-DD
  merchant: string | null;
  /** Nombre de categoría sugerido (de las que se crean por defecto), si se reconoce la tienda. */
  categoryName: string | null;
  /** Productos leídos del ticket, en orden. Los descuentos y devoluciones van en negativo. */
  lines: ReceiptLine[];
  /** La suma de los productos da el total: la lectura es de fiar. */
  linesMatchTotal: boolean;
  /** De dónde sale el total: 3 lo confirman dos sitios, 2 la línea del total, 1 el pago, 0 el importe mayor. */
  totalCertainty: number;
}

export interface ReceiptLine {
  /** Nombre tal y como sale en el ticket, limpio de cantidades y basura de la lectura. */
  name: string;
  /** Importe de la línea (cantidad × precio). */
  cents: number;
  quantity: number;
}

// Tiendas habituales y la categoría por defecto que les corresponde.
// El CIF sale en todos los tickets y se lee mejor que el logotipo (solo se miran sus dígitos).
const MERCHANTS: { match: RegExp; name: string; category: string }[] = [
  { match: /mercadona|6103834/, name: 'Mercadona', category: 'Supermercado' },
  { match: /hiper\s?dino|dinosol|1742565/, name: 'HiperDino', category: 'Supermercado' },
  { match: /super\s?dino/, name: 'SuperDino', category: 'Supermercado' },
  { match: /\bspar\b/, name: 'Spar', category: 'Supermercado' },
  { match: /carrefour/, name: 'Carrefour', category: 'Supermercado' },
  { match: /\blidl\b/, name: 'Lidl', category: 'Supermercado' },
  { match: /\baldi\b/, name: 'Aldi', category: 'Supermercado' },
  { match: /alcampo|8581882/, name: 'Alcampo', category: 'Supermercado' },
  { match: /eroski/, name: 'Eroski', category: 'Supermercado' },
  { match: /consum\b/, name: 'Consum', category: 'Supermercado' },
  { match: /hipercor/, name: 'Hipercor', category: 'Supermercado' },
  { match: /\bbonpreu\b/, name: 'Bonpreu', category: 'Supermercado' },
  { match: /\bdia\b.*(retail|distribucion|%)|supermercados dia|\bdia s\.?a/, name: 'Dia', category: 'Supermercado' },
  { match: /ahorramas/, name: 'Ahorramás', category: 'Supermercado' },
  { match: /el corte ingles/, name: 'El Corte Inglés', category: 'Otros' },
  { match: /\bikea\b/, name: 'IKEA', category: 'Casa' },
  { match: /leroy merlin/, name: 'Leroy Merlin', category: 'Casa' },
  { match: /\brepsol\b/, name: 'Repsol', category: 'Transporte' },
  { match: /\bcepsa\b|moeve/, name: 'Cepsa', category: 'Transporte' },
  { match: /\bgalp\b/, name: 'Galp', category: 'Transporte' },
  { match: /\bshell\b/, name: 'Shell', category: 'Transporte' },
  { match: /\bbp\b.*(oil|estacion)|estacion de servicio|gasolinera/, name: 'Gasolinera', category: 'Transporte' },
  { match: /farmacia/, name: 'Farmacia', category: 'Salud' },
];

const GENERIC_CATEGORY: { match: RegExp; category: string }[] = [
  { match: /restaurante|cafeteria|\bbar\b|taberna|pizzeria|burger|mesa \d|comensales|camarero/, category: 'Restaurantes' },
  { match: /farmacia|parafarmacia/, category: 'Salud' },
  { match: /gasoleo|gasolina|diesel|sin plomo|surtidor/, category: 'Transporte' },
];

// Un importe con dos decimales: 12,34 · 1.234,56 · 12.34. No vale un trozo de fecha u hora
// (16.10.2026, 16-10.20…): ni pegado detrás de un número con separador ni seguido de otro.
const AMOUNT = /(?<![\d.,/:-])(\d{1,3}(?:[.\s]\d{3})*|\d+)[,.](\d{2})(?![\d]|[.,/:-]\d)/g;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const euros = Number(m[1].replace(/[.\s]/g, ''));
    out.push(euros * 100 + Number(m[2]));
  }
  return out.filter((c) => c > 0 && c <= 100000000);
}

const SKIP = /subtotal|sub total|base imp|\biva\b|cuota|entregado|efectivo|cambio|devol|ahorro|descuento|puntos|promocion/;
const STRONG = /total\s*(a\s*pagar|compra|ticket|eur|€|\(?e\)?)?|importe\s*total|a\s*pagar|total\s*\(?eur|\btot\b/;
const PAYMENT = /tarjeta|visa|mastercard|importe|\beur\b|contactless/;

/**
 * Busca el total del ticket. Lo dice en varios sitios (la línea del total, el pago con tarjeta,
 * "Importe: …") y la suma de los productos debe dar lo mismo: como la lectura de una foto falla
 * a veces en algún número, gana el importe que más veces coincide.
 */
function findTotal(lines: string[], itemsSum: number | null): { cents: number | null; certainty: number } {
  const norm = lines.map(normalize);
  const strong: number[] = [];
  const payment: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (SKIP.test(norm[i]) && !/tarjeta|importe:/.test(norm[i])) continue;
    if (STRONG.test(norm[i]) && !/articulos|art\. vendidos|promociones/.test(norm[i])) {
      const here = amountsIn(lines[i]);
      // A veces el importe está en la línea siguiente.
      const value = here.length ? here[here.length - 1] : (lines[i + 1] ? amountsIn(lines[i + 1]).pop() : undefined);
      if (value != null) strong.push(value);
    } else if (PAYMENT.test(norm[i])) {
      const here = amountsIn(lines[i]);
      if (here.length) payment.push(here[here.length - 1]);
    }
  }
  const votes = new Map<number, number>();
  const vote = (v: number, w: number) => votes.set(v, (votes.get(v) ?? 0) + w);
  strong.forEach((v) => vote(v, 3));
  payment.forEach((v) => vote(v, 2));
  if (itemsSum != null && itemsSum > 0) vote(itemsSum, 2);
  const agreed = [...votes.entries()].filter(([v]) => strong.includes(v) || payment.includes(v));
  // Coinciden dos fuentes distintas: casi seguro que es el total.
  const confirmed = agreed.filter(([v, w]) => w >= 4 || (v === itemsSum && w > 2)).sort((a, b) => b[1] - a[1]);
  if (confirmed.length) return { cents: confirmed[0][0], certainty: 3 };
  if (strong.length) return { cents: strong[0], certainty: 2 };
  if (payment.length) return { cents: payment[0], certainty: 1 };
  const all = lines.filter((_, i) => !SKIP.test(norm[i])).flatMap(amountsIn);
  return { cents: all.length ? Math.max(...all) : null, certainty: 0 };
}

// Líneas que no son productos aunque lleven un importe.
const NOT_ITEM = /total|tarjeta|bancaria|efectivo|cambio|entregado|\biva\b|base|cuota|subtotal|importe|telefono|tel[eé]f|c\.?i\.?f|n\.?i\.?f|factura|fecha|hora|operacion|documento|articulos|vendidos|saldo|puntos|visa|mastercard|contactless|aut\b|\barc\b|\baid\b|promocion|ahorro|cuenta|tarj\b|eur\b|pago/;
const HEADER = /articulo|descripcion|p\.?\s?unit|importe|\bimp\.|\bcant\b|\buds?\b/;

/** Letras de verdad en una línea (no cuenta los números ni la basura de la lectura). */
const letters = (s: string) => s.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, '').length;

/**
 * Importes al final de una línea de producto. Además de lo normal, entiende ",12" (sin el cero)
 * y la letra del IVA pegada detrás que la lectura confunde con un 8 ("1,09 B" → "1,098").
 */
function lineAmounts(line: string): { amounts: number[]; negative: boolean; rest: string } {
  // Lo que la lectura añade detrás del último importe (manchas, "E -", "NN") no cuenta.
  let l = line.replace(/(\d[,.]\d{2}[AB8]?)(?:\s+\S{1,3}|\s*[^\w\s]+)+\s*$/, '$1').replace(/\s+[AB]\s*$/, '').replace(/(\d[,.]\d{2})[8B]\s*$/, '$1').replace(/(^|\s)[,.](\d{2})\s*$/, '$10,$2');
  const negative = /-\s*\d+[,.]\d{2}\s*$/.test(l);
  const amounts = amountsIn(l);
  // Lo que queda antes del primer importe es el nombre.
  const first = l.search(/\d+[,.]\d{2}(?!\d)/);
  if (first >= 0) l = l.slice(0, first);
  return { amounts, negative, rest: l };
}

/** Quita la cantidad del principio, los restos de la lectura y espacios de sobra. */
function cleanName(raw: string): { name: string; quantity: number } {
  let s = raw.replace(/[|_—–=“”"'`´~^*¡!¿?<>{}[\]\\»«]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Restos de la lectura delante del nombre: signos y "palabras" de una o dos letras ("A", "DL").
  s = s.replace(/^(?:[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+|[A-Za-zÁÉÍÓÚÑáéíóúñ]{1,2}[.,:]?\s+(?=\S))+/, '');
  // Los tickets van en mayúsculas: una "palabra" con minúsculas en medio es una mancha mal leída.
  const caps = s.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length;
  if (caps >= 4 && caps / Math.max(1, letters(s)) >= 0.8) {
    s = s.split(' ').filter((w) => !/[a-záéíóúñ]/.test(w) || /^\d/.test(w)).join(' ');
  }
  // Desde una mancha (". -") hasta el final, si solo quedan trocitos sueltos, es basura.
  s = s.replace(/\s+[^\sA-Za-z0-9ÁÉÍÓÚÑ%€]+(?:\s+(?:\S{1,2}|[^\sA-Za-z0-9]+))*$/, '');
  let quantity = 1;
  const q = s.match(/^(\d{1,2})\s+(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/);
  if (q) {
    quantity = Number(q[1]) || 1;
    s = s.slice(q[0].length);
  }
  s = s.replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, '').replace(/[\s\-.:,;+]+$/, '').trim();
  return { name: s.slice(0, 60), quantity };
}

/**
 * Productos del ticket: las líneas con nombre e importe entre la cabecera y el total.
 * "2 x 1,15   2,30" debajo de un nombre es la cantidad de ese producto; una línea en negativo
 * es una devolución o un descuento.
 */
function findLines(lines: string[]): ReceiptLine[] {
  const norm = lines.map(normalize);
  let start = norm.findIndex((l) => HEADER.test(l) && !NOT_ITEM.test(l.replace(/importe|\bimp\./g, '')));
  if (start < 0) start = norm.findIndex((l) => /factura simplificada|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(l));
  const end = norm.findIndex((l, i) => i > start && STRONG.test(l) && !/articulos|art\. vendidos/.test(l));
  const out: ReceiptLine[] = [];
  let pendingName: string | null = null;
  for (let i = start + 1; i < (end < 0 ? lines.length : end); i++) {
    if (NOT_ITEM.test(norm[i])) {
      pendingName = null;
      continue;
    }
    const { amounts, negative, rest } = lineAmounts(lines[i]);
    const { name, quantity } = cleanName(rest);
    const qtyLine = rest.match(/^\s*-?\s*(\d+(?:[,.]\d+)?)\s*[xX×*]\s*$/) || (letters(rest) < 3 && /[xX×*]/.test(rest));
    if (amounts.length === 0) {
      // Nombre largo cuyo importe va en la línea siguiente (con "2 x 1,15").
      pendingName = letters(rest) >= 3 ? name : null;
      continue;
    }
    const cents = amounts[amounts.length - 1] * (negative ? -1 : 1);
    if ((qtyLine || letters(name) < 3) && pendingName) {
      const m = lines[i].match(/(-?\d+(?:[,.]\d+)?)\s*[xX×*]/);
      const qty = m ? Math.abs(Number(m[1].replace(',', '.'))) || 1 : 1;
      out.push({ name: pendingName, cents, quantity: qty });
      pendingName = null;
      continue;
    }
    pendingName = null;
    if (letters(name) < 3) continue;
    // Con dos importes, el primero es el precio por unidad y el último el de la línea.
    const qty = amounts.length >= 2 && amounts[0] > 0 ? Math.max(quantity, Math.round(amounts[amounts.length - 1] / amounts[0])) : quantity;
    out.push({ name, cents, quantity: qty });
  }
  return out;
}

/** Primera fecha válida del ticket que no sea futura (dd/mm/aa, dd-mm-aaaa, dd.mm.aaaa). */
function findDate(text: string, todayIso: string): string | null {
  const re = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})(?!\d)/g;
  for (const m of text.matchAll(re)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const date = new Date(y, mo - 1, d);
    if (date.getMonth() !== mo - 1) continue; // 31/02 no existe
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (iso > todayIso || y < 2000) continue;
    return iso;
  }
  return null;
}

/** Tienda conocida en un texto ya normalizado (minúsculas y sin tildes). */
export function knownMerchant(normalized: string): { name: string; category: string } | null {
  return MERCHANTS.find((m) => m.match.test(normalized)) ?? null;
}

/** Categoría por palabras sueltas (restaurante, farmacia, gasolina…) en un texto normalizado. */
export function genericCategory(normalized: string): string | null {
  return GENERIC_CATEGORY.find((g) => g.match.test(normalized))?.category ?? null;
}

function findMerchant(lines: string[]): { name: string | null; category: string | null } {
  const all = normalize(lines.join('\n'));
  const known = knownMerchant(all);
  if (known) return { name: known.name, category: known.category };
  const category = genericCategory(all);
  // Si no es una tienda conocida, la primera línea con texto suele ser el nombre del comercio.
  const first = lines.find((l) => {
    const letters = l.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, '');
    return letters.length >= 3 && letters.length / l.trim().length > 0.6 && !/ticket|factura|simplificada/i.test(l);
  });
  return { name: first ? tidy(first) : null, category };
}

function tidy(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, 40);
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

/** Saca importe total, fecha, comercio y productos del texto leído en un ticket. Todo es una sugerencia. */
export function parseReceipt(text: string, todayIso: string): ReceiptGuess {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const merchant = findMerchant(lines);
  const items = findLines(lines);
  const sum = items.length >= 2 ? items.reduce((a, l) => a + l.cents, 0) : null;
  const { cents: total, certainty } = findTotal(lines, sum);
  return {
    amountCents: total,
    totalCertainty: certainty,
    date: findDate(text, todayIso),
    merchant: merchant.name,
    categoryName: merchant.category,
    lines: items,
    linesMatchTotal: sum != null && sum === total,
  };
}

/**
 * De varias lecturas del mismo ticket (con la foto preparada de distintas formas), la mejor:
 * la que cuadra con su total y, si no, la que más productos ha sacado. El total que más
 * lecturas repiten gana aunque venga de otra.
 */
export function bestReading(readings: ReceiptGuess[]): ReceiptGuess | null {
  if (readings.length === 0) return null;
  const score = (r: ReceiptGuess) => (r.linesMatchTotal ? 1000 : 0) + r.lines.length * 10 + (r.amountCents != null ? 5 : 0) + (r.date ? 1 : 0);
  const best = [...readings].sort((a, b) => score(b) - score(a))[0];
  if (best.linesMatchTotal) return best;
  // El total: el que más lecturas repiten y, si no, el que se leyó de un sitio más fiable.
  const votes = new Map<number, number>();
  for (const r of readings) if (r.amountCents != null) votes.set(r.amountCents, (votes.get(r.amountCents) ?? 0) + 10 + r.totalCertainty);
  const [total] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [best.amountCents];
  return {
    ...best,
    amountCents: total,
    totalCertainty: Math.max(...readings.filter((r) => r.amountCents === total).map((r) => r.totalCertainty)),
    date: best.date ?? readings.find((r) => r.date)?.date ?? null,
    // Mejor una tienda reconocida (trae su categoría) que la primera línea de texto.
    merchant: (best.categoryName ? best.merchant : readings.find((r) => r.categoryName)?.merchant) ?? best.merchant ?? readings.find((r) => r.merchant)?.merchant ?? null,
    categoryName: best.categoryName ?? readings.find((r) => r.categoryName)?.categoryName ?? null,
  };
}
