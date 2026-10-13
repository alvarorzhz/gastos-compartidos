import { normalize } from './search';

export interface ReceiptGuess {
  amountCents: number | null;
  date: string | null; // YYYY-MM-DD
  merchant: string | null;
  /** Nombre de categoría sugerido (de las que se crean por defecto), si se reconoce la tienda. */
  categoryName: string | null;
}

// Tiendas habituales y la categoría por defecto que les corresponde.
const MERCHANTS: { match: RegExp; name: string; category: string }[] = [
  { match: /mercadona/, name: 'Mercadona', category: 'Supermercado' },
  { match: /carrefour/, name: 'Carrefour', category: 'Supermercado' },
  { match: /\blidl\b/, name: 'Lidl', category: 'Supermercado' },
  { match: /\baldi\b/, name: 'Aldi', category: 'Supermercado' },
  { match: /alcampo/, name: 'Alcampo', category: 'Supermercado' },
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

// Un importe con dos decimales: 12,34 · 1.234,56 · 12.34
const AMOUNT = /(\d{1,3}(?:[.\s]\d{3})*|\d+)[,.](\d{2})(?!\d)/g;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const euros = Number(m[1].replace(/[.\s]/g, ''));
    out.push(euros * 100 + Number(m[2]));
  }
  return out.filter((c) => c > 0 && c <= 100000000);
}

/** Busca el total del ticket: primero en las líneas que dicen "total", si no, el importe mayor. */
function findTotal(lines: string[]): number | null {
  const norm = lines.map(normalize);
  const skip = /subtotal|sub total|base imp|\biva\b|cuota|entregado|efectivo|cambio|devol|ahorro|descuento|puntos/;
  const strong = /total\s*(a\s*pagar|compra|ticket|eur|€)?|importe\s*total|a\s*pagar|total\s*\(?eur/;
  for (let i = 0; i < lines.length; i++) {
    if (!strong.test(norm[i]) || skip.test(norm[i])) continue;
    const here = amountsIn(lines[i]);
    if (here.length) return here[here.length - 1];
    // A veces el importe está en la línea siguiente.
    const next = lines[i + 1] ? amountsIn(lines[i + 1]) : [];
    if (next.length) return next[next.length - 1];
  }
  // Pago con tarjeta: "TARJETA 23,45" suele ser el total.
  for (let i = 0; i < lines.length; i++) {
    if (/tarjeta|visa|mastercard|importe/.test(norm[i]) && !skip.test(norm[i])) {
      const here = amountsIn(lines[i]);
      if (here.length) return here[here.length - 1];
    }
  }
  const all = lines.filter((_, i) => !skip.test(norm[i])).flatMap(amountsIn);
  return all.length ? Math.max(...all) : null;
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

/** Saca importe total, fecha y comercio del texto leído en un ticket. Todo es una sugerencia. */
export function parseReceipt(text: string, todayIso: string): ReceiptGuess {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const merchant = findMerchant(lines);
  return {
    amountCents: findTotal(lines),
    date: findDate(text, todayIso),
    merchant: merchant.name,
    categoryName: merchant.category,
  };
}
