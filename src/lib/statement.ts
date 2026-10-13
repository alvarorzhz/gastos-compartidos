import { genericCategory, knownMerchant } from './receipt';
import { normalize } from './search';
import type { Expense, PersonalEntry } from './types';

/** Un movimiento del extracto. Importe en céntimos: negativo = cargo, positivo = ingreso. */
export interface BankMovement {
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
}

/**
 * Saca los movimientos de la tabla de un extracto (Excel o CSV).
 * Busca la fila de cabecera con una columna de fecha y otra de importe; probado con el
 * Excel del BBVA (Fecha valor, Fecha, Concepto, Movimiento, Importe…), pero vale para
 * cualquier banco con columnas parecidas.
 */
export function parseStatement(rows: string[][]): BankMovement[] {
  const headerAt = rows.findIndex((r) => findColumns(r) != null);
  if (headerAt < 0) throw new Error('No encuentro las columnas de fecha e importe en el archivo.');
  const cols = findColumns(rows[headerAt])!;
  const out: BankMovement[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const date = parseDate(r[cols.date] ?? '');
    let amount = parseAmount(r[cols.amount ?? -1] ?? '');
    if (amount == null && cols.debit != null) {
      const debit = parseAmount(r[cols.debit] ?? '');
      const credit = parseAmount(r[cols.credit ?? -1] ?? '');
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (!date || !amount) continue;
    const texts = cols.texts.map((c) => (r[c] ?? '').trim());
    out.push({ date, amountCents: amount, description: describe(texts) });
  }
  return out;
}

interface Columns {
  date: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  /** Columnas de texto en orden: concepto, movimiento, observaciones… */
  texts: number[];
}

function findColumns(row: string[]): Columns | null {
  const h = row.map((c) => normalize(c ?? ''));
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = h.findIndex((c) => c === n);
      if (i >= 0) return i;
    }
    for (const n of names) {
      const i = h.findIndex((c) => c.startsWith(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  // La fecha valor del BBVA es el día de la compra; la "fecha" es cuando se carga en cuenta.
  const date = find('fecha operacion', 'fecha valor', 'f. valor', 'fecha');
  const amount = find('importe', 'cantidad');
  const debit = find('cargo', 'debe');
  const credit = find('abono', 'haber');
  if (date < 0 || (amount < 0 && debit < 0)) return null;
  const texts = ['concepto', 'descripcion', 'movimiento', 'detalle', 'observaciones', 'beneficiario']
    .map((n) => h.findIndex((c) => c.startsWith(n)))
    .filter((i, k, all) => i >= 0 && all.indexOf(i) === k);
  return { date, amount: amount >= 0 ? amount : null, debit: debit >= 0 ? debit : null, credit: credit >= 0 ? credit : null, texts };
}

/** "13/10/2026", "13-10-26", "2026-10-13" o un número de fecha de Excel. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else if (/^\d{5}(\.\d+)?$/.test(t)) {
    // Fecha guardada como número de Excel (días desde el 30/12/1899).
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || y < 2000) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "-8.98" (Excel), "-1.234,56" o "1234,56 €" a céntimos con signo. */
export function parseAmount(s: string): number | null {
  let t = s.trim().replace(/\s|€|eur/gi, '');
  if (!t) return null;
  const negative = t.startsWith('-') || /^\(.*\)$/.test(t);
  t = t.replace(/^[-+(]|\)$/g, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    t = t.split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    t = t.replace(',', '.');
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const cents = Math.round(parseFloat(t) * 100);
  return negative ? -cents : cents;
}

// Textos del banco que no dicen nada del comercio.
const GENERIC = /^(pago con tarjeta|compra con tarjeta|otros|transferencia|recibo|adeudo)$/;

/** Convierte "Bizum" + "Enviado: cena" o "Lidl salamanca   sta marta  es" en algo legible. */
export function describe(texts: string[]): string {
  const [concept = '', movement = '', ...rest] = texts;
  const m = movement.trim();
  if (/^bizum$/i.test(concept.trim())) {
    const what = m.replace(/^(enviado|recibido)\s*:\s*/i, '').trim();
    return 'Bizum: ' + (what && !/^sin concepto$/i.test(what) ? what.toLowerCase() : (/^recibido/i.test(m) ? 'recibido' : 'enviado'));
  }
  if (/nomina/.test(normalize(concept + ' ' + m))) return 'Nómina';
  const main = cleanMerchant(concept) || cleanMerchant(GENERIC.test(normalize(m)) ? '' : m) || rest.map(cleanMerchant).find(Boolean) || concept.trim() || m || 'Movimiento';
  return main.slice(0, 200);
}

function cleanMerchant(raw: string): string {
  // El BBVA rellena con espacios: "Ticket futbol            bilbao       es". Lo primero es el comercio.
  let s = raw.trim().replace(/\s*\*\s*/g, '*').split(/\s{2,}/)[0] ?? '';
  if (/^bk\d+/i.test(s)) return 'Burger King';
  s = s
    .replace(/^(sumup|sum up|zettle|izettle|paypal|tpv)\s*\*?\s*/i, '')
    .replace(/^www\./i, '')
    .replace(/\.(com|es)\b/gi, '')
    .replace(/\*/g, ' ')
    .split(/\s+/)
    // Fuera códigos de operación ("n42uw1364", "29sep", "7980").
    .filter((w) => !(/\d/.test(w) && /[a-z]/i.test(w) && w.length >= 5) && !/^\d{3,}$/.test(w) && !/^\d{1,2}[a-z]{3}$/i.test(w))
    .join(' ')
    .trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Comercios habituales en extractos (los nombres salen recortados) → categoría común por defecto.
const RULES: { match: RegExp; category: string }[] = [
  { match: /carref|leclerc|alcampo|mercadona|\blidl\b|^dia\b|\bdia \d|eroski|ahorramas|hipercor|supercor|gadis|froiz|\bbm\b|consum|caprabo|bonarea/, category: 'Supermercado' },
  { match: /just ?eat|glovo|uber ?eats|deliveroo|mc ?donalds|burger king|taco bell|telepizza|domino|kfc|\bvips\b|restaurante|restauracion|\bbar\b|cafe|cafeteria|taberna|pizzeria|poke|sushi|kebab|bocadillo|empanader/, category: 'Restaurantes' },
  { match: /waylet|repsol|cepsa|moeve|galp|\bshell\b|petronor|ballenoil|plenoil|gasolinera|telpark|parking|aparcamiento|tunel de lavado|lavado|renfe|\balsa\b|cabify|\buber\b|bolt|autopista|peaje|itv/, category: 'Transporte' },
  { match: /farmacia|parafarmacia|optica|clinica|dentista|fisioterap|hospital/, category: 'Salud' },
  { match: /iberdrola|endesa|naturgy|\btotal ?energies|holaluz|repsol luz|vodafone|movistar|orange|\bdigi\b|yoigo|masmovil|\bpepephone|aguas|\bseguro|mapfre|mutua|\bline(a|a) directa|comunidad de propietarios|alquiler/, category: 'Facturas' },
  { match: /ikea|leroy|bricomart|bauhaus|maisons du monde|\bzara home|\bjysk\b|\bbrico/, category: 'Casa' },
  { match: /ticket|entradas|fever|cine|cinesa|yelmo|teatro|concierto|plaza toros|museo|netflix|spotify|hbo|disney|prime video|steam|playstation/, category: 'Ocio' },
];

/** Nombre de categoría común sugerido para un movimiento, si se reconoce. */
export function guessCategory(description: string): string | null {
  const n = normalize(description);
  return RULES.find((r) => r.match.test(n))?.category ?? knownMerchant(n)?.category ?? genericCategory(n);
}

// Categorías comunes → la más parecida de las personales.
const TO_PERSONAL: Record<string, string> = {
  Restaurantes: 'Comida fuera',
  Transporte: 'Transporte',
  Ocio: 'Ocio',
  Salud: 'Salud',
};

/** Categoría personal sugerida. */
export function guessPersonalCategory(m: BankMovement): string {
  const n = normalize(m.description);
  if (m.amountCents > 0) {
    if (/nomina/.test(n)) return 'Nómina';
    if (/cashback|promocion|interes/.test(n)) return /interes/.test(n) ? 'Intereses' : 'Extra';
    return 'Otros';
  }
  if (/netflix|spotify|hbo|disney|prime|icloud|google play/.test(n)) return 'Suscripciones';
  return TO_PERSONAL[guessCategory(m.description) ?? ''] ?? 'Otros';
}

export type Destination = 'skip' | 'common' | 'personal';

export interface ImportRow {
  movement: BankMovement;
  destination: Destination;
  /** Categoría común (id) y personal (nombre) propuestas; se usa la del destino elegido. */
  categoryId: string;
  personalCategory: string;
  note: string;
  /** Parece que ya está apuntado (mismo importe y fecha cercana). */
  duplicate: boolean;
}

/** Días entre dos fechas YYYY-MM-DD. */
function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
}

/**
 * Propuesta inicial para cada movimiento: nada se importa salvo lo que ya se clasificó antes
 * igual (misma nota), y se marca lo que parece ya apuntado para no duplicarlo.
 */
export function proposeImport(
  movements: BankMovement[],
  ctx: { me: string; expenses: Expense[]; personal: PersonalEntry[]; categories: { id: string; name: string; archived: boolean }[] },
): ImportRow[] {
  const active = ctx.categories.filter((c) => !c.archived);
  const byName = new Map(active.map((c) => [normalize(c.name), c.id]));
  const fallbackCategory = byName.get('otros') ?? active[0]?.id ?? '';

  // Lo que ya se apuntó con la misma nota enseña dónde va (lo más reciente manda).
  const learned = new Map<string, { destination: Destination; categoryId?: string; personalCategory?: string; date: string }>();
  const keyOf = (note: string, income: boolean) => normalize(note) + (income ? '+' : '-');
  const learn = (note: string | null, income: boolean, date: string, v: { destination: Destination; categoryId?: string; personalCategory?: string }) => {
    if (!note) return;
    const key = keyOf(note, income);
    const prev = learned.get(key);
    if (!prev || prev.date < date) learned.set(key, { ...v, date });
  };
  for (const e of ctx.expenses) {
    if (e.paid_by === ctx.me && active.some((c) => c.id === e.category_id)) learn(e.note, false, e.spent_on, { destination: 'common', categoryId: e.category_id });
  }
  for (const p of ctx.personal) learn(p.note, p.kind === 'income', p.entry_on, { destination: 'personal', personalCategory: p.category });

  // Candidatos a duplicado: cada apunte existente solo puede "tapar" un movimiento.
  const used = new Set<string>();
  const findDuplicate = (m: BankMovement): boolean => {
    const cents = Math.abs(m.amountCents);
    const candidates: { id: string; date: string }[] = m.amountCents < 0
      ? [
          ...ctx.expenses.filter((e) => e.paid_by === ctx.me && e.amount_cents === cents).map((e) => ({ id: e.id, date: e.spent_on })),
          ...ctx.personal.filter((p) => p.kind === 'expense' && p.amount_cents === cents).map((p) => ({ id: p.id, date: p.entry_on })),
        ]
      : ctx.personal.filter((p) => p.kind === 'income' && p.amount_cents === cents).map((p) => ({ id: p.id, date: p.entry_on }));
    const best = candidates
      .filter((c) => !used.has(c.id) && daysBetween(c.date, m.date) <= 3)
      .sort((a, b) => daysBetween(a.date, m.date) - daysBetween(b.date, m.date))[0];
    if (!best) return false;
    used.add(best.id);
    return true;
  };

  return movements.map((m): ImportRow => {
    const duplicate = findDuplicate(m);
    const prior = learned.get(keyOf(m.description, m.amountCents > 0));
    const guessed = guessCategory(m.description);
    return {
      movement: m,
      destination: duplicate || !prior ? 'skip' : prior.destination,
      categoryId: prior?.categoryId ?? (guessed ? byName.get(normalize(guessed)) : undefined) ?? fallbackCategory,
      personalCategory: prior?.personalCategory ?? guessPersonalCategory(m),
      note: m.description,
      duplicate,
    };
  });
}

/** CSV con ; o , y comillas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
