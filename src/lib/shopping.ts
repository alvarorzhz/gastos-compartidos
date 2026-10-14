import { normalize } from './search';

/*
 * Lista de la compra: datos y reglas que no dependen de la pantalla (para poder probarlas).
 * Cada producto es una fila de shopping_items. Comprar no lo borra: pasa a "comprado" y queda
 * como historial para "Recientes y habituales". Volver a necesitarlo apunta una fila nueva.
 */

export type ShopCategory = 'fruta' | 'carne' | 'lacteos' | 'panaderia' | 'despensa' | 'bebidas' | 'congelados' | 'limpieza' | 'higiene' | 'otros';
export type ShopUnit = 'ud' | 'kg' | 'g' | 'l' | 'ml' | 'paquete';

export interface ShoppingItem {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: ShopUnit | null;
  category: ShopCategory;
  important: boolean;
  /** Precio aproximado, opcional. No crea gastos ni cuenta en el presupuesto. */
  estimated_cents: number | null;
  status: 'pending' | 'bought';
  bought_at: string | null;
  bought_by: string | null;
  /** Cuándo se terminó la compra en la que se compró: ya no sale en "Comprados", solo en el historial. */
  cleared_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Iconos de src/views/icons.tsx usados por las categorías. */
export type ShopIcon = 'apple' | 'fish' | 'milk' | 'bread' | 'jar' | 'bottle' | 'snowflake' | 'spray' | 'droplet' | 'tag';

/** Categorías en el orden habitual de un súper (es el orden de la vista agrupada). */
export const SHOP_CATEGORIES: { id: ShopCategory; label: string; icon: ShopIcon; tone: number }[] = [
  { id: 'fruta', label: 'Frutas y verduras', icon: 'apple', tone: 9 },
  { id: 'carne', label: 'Carne y pescado', icon: 'fish', tone: 4 },
  { id: 'lacteos', label: 'Lácteos y huevos', icon: 'milk', tone: 2 },
  { id: 'panaderia', label: 'Panadería', icon: 'bread', tone: 11 },
  { id: 'despensa', label: 'Despensa', icon: 'jar', tone: 6 },
  { id: 'bebidas', label: 'Bebidas', icon: 'bottle', tone: 1 },
  { id: 'congelados', label: 'Congelados', icon: 'snowflake', tone: 8 },
  { id: 'limpieza', label: 'Limpieza', icon: 'spray', tone: 7 },
  { id: 'higiene', label: 'Higiene y cuidado personal', icon: 'droplet', tone: 3 },
  { id: 'otros', label: 'Otros', icon: 'tag', tone: 10 },
];

export const shopCategory = (id: ShopCategory) => SHOP_CATEGORIES.find((c) => c.id === id) ?? SHOP_CATEGORIES[SHOP_CATEGORIES.length - 1];

export const SHOP_UNITS: { id: ShopUnit; label: string; one: string; many: string }[] = [
  { id: 'ud', label: 'ud', one: 'ud', many: 'ud' },
  { id: 'kg', label: 'kg', one: 'kg', many: 'kg' },
  { id: 'g', label: 'g', one: 'g', many: 'g' },
  { id: 'l', label: 'litros', one: 'l', many: 'l' },
  { id: 'ml', label: 'ml', one: 'ml', many: 'ml' },
  { id: 'paquete', label: 'paquetes', one: 'paquete', many: 'paquetes' },
];

export const MAX_NAME = 60;
export const MAX_QUANTITY = 9999;

/** "1,5 kg", "2 paquetes", "×3"; vacío si es una sola unidad sin medida. */
export function formatQuantity(quantity: number, unit: ShopUnit | null): string {
  const q = Number(quantity);
  const n = q.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  if (!unit) return q === 1 ? '' : `×${n}`;
  const u = SHOP_UNITS.find((x) => x.id === unit)!;
  return `${n} ${q === 1 ? u.one : u.many}`;
}

/** Lee una cantidad escrita ("2", "1,5", "0.5"); null si no vale. */
export function parseQuantity(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= MAX_QUANTITY ? n : null;
}

const UNIT_WORDS: Record<string, ShopUnit> = {
  ud: 'ud', uds: 'ud', u: 'ud', unidad: 'ud', unidades: 'ud',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ml: 'ml',
  paq: 'paquete', paquete: 'paquete', paquetes: 'paquete',
};
const NUM = '(\\d+(?:[.,]\\d{1,2})?)';
const UNIT = `(${Object.keys(UNIT_WORDS).sort((a, b) => b.length - a.length).join('|')})`;

/**
 * Entiende lo que se escribe en el campo rápido: "Leche", "2 leche", "1,5 kg patatas",
 * "500g queso", "2 paquetes de galletas", "leche x2" o "patatas 2 kg".
 * quantity/unit son null si no se han escrito (se usan los de por defecto).
 */
export function parseQuickAdd(text: string): { name: string; quantity: number | null; unit: ShopUnit | null } {
  const t = text.trim().replace(/\s+/g, ' ');
  const tries: [RegExp, (m: RegExpMatchArray) => [string, string, string | undefined]][] = [
    [new RegExp(`^${NUM}\\s*${UNIT}\\s+(?:de\\s+)?(.+)$`, 'i'), (m) => [m[3], m[1], m[2]]],
    [new RegExp(`^${NUM}\\s+(?:de\\s+)?(.+)$`, 'i'), (m) => [m[2], m[1], undefined]],
    [new RegExp(`^(.+?)\\s*[x×]\\s*${NUM}$`, 'i'), (m) => [m[1], m[2], undefined]],
    [new RegExp(`^(.+?)\\s+${NUM}\\s*${UNIT}$`, 'i'), (m) => [m[1], m[2], m[3]]],
  ];
  for (const [re, pick] of tries) {
    const m = t.match(re);
    if (!m) continue;
    const [name, qty, unit] = pick(m);
    const quantity = parseQuantity(qty);
    if (quantity == null || !name.trim()) continue;
    return { name: capitalizeFirst(name.trim()), quantity, unit: unit ? UNIT_WORDS[unit.toLowerCase()] : null };
  }
  return { name: capitalizeFirst(t), quantity: null, unit: null };
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mismo producto aunque cambien mayúsculas, tildes o espacios. */
export const sameProduct = (a: string, b: string) => normalize(a).replace(/\s+/g, ' ') === normalize(b).replace(/\s+/g, ' ');

// Frases que se miran antes que las palabras sueltas ("tomate frito" no es verdura).
const PHRASES: [string, ShopCategory][] = [
  ['tomate frito', 'despensa'], ['tomate triturado', 'despensa'], ['tomate natural', 'despensa'],
  ['patatas fritas', 'despensa'], ['frutos secos', 'despensa'], ['pan rallado', 'despensa'],
  ['papel higienico', 'higiene'], ['pasta de dientes', 'higiene'], ['hilo dental', 'higiene'], ['gel de ducha', 'higiene'], ['jabon de manos', 'higiene'],
  ['papel de cocina', 'limpieza'], ['papel cocina', 'limpieza'], ['papel aluminio', 'limpieza'], ['papel de aluminio', 'limpieza'], ['bolsas de basura', 'limpieza'],
  ['leche de avena', 'bebidas'], ['leche de almendra', 'bebidas'], ['bebida de avena', 'bebidas'],
];

// Palabras clave por categoría: valen al principio de una palabra (las cortas, enteras o en plural).
const WORDS: [ShopCategory, string[]][] = [
  ['congelados', ['congelad', 'helado', 'hielo', 'pizza', 'croqueta', 'varitas']],
  ['limpieza', ['lejia', 'detergente', 'suavizante', 'friegasuelos', 'lavavajillas', 'fregona', 'bayeta', 'estropajo', 'limpia', 'limpiador', 'amoniaco', 'lavadora', 'servilleta', 'ambientador', 'insecticida', 'basura', 'film', 'quitagrasas', 'pastillas']],
  ['higiene', ['champu', 'gel', 'jabon', 'desodorante', 'dentifrico', 'cepillo', 'compresa', 'tampon', 'panal', 'toallita', 'crema', 'colonia', 'maquinilla', 'cuchilla', 'algodon', 'bastoncillo', 'enjuague', 'colutorio', 'acondicionador', 'protector', 'panuelo', 'mascarilla', 'tiritas']],
  ['bebidas', ['agua', 'cerveza', 'vino', 'refresco', 'coca', 'cola', 'zumo', 'fanta', 'tonica', 'gaseosa', 'cava', 'sidra', 'bebida', 'aquarius', 'nestea', 'licor', 'ron', 'ginebra', 'whisky', 'vermut', 'sangria', 'tinto']],
  ['lacteos', ['leche', 'yogur', 'queso', 'mantequilla', 'nata', 'huevo', 'kefir', 'cuajada', 'natillas', 'flan', 'requeson', 'margarina']],
  ['carne', ['carne', 'pollo', 'ternera', 'cerdo', 'cordero', 'pavo', 'jamon', 'chorizo', 'salchicha', 'salchichon', 'hamburguesa', 'filete', 'lomo', 'costilla', 'pescado', 'salmon', 'merluza', 'bacalao', 'gamba', 'langostino', 'mejillon', 'calamar', 'sepia', 'dorada', 'lubina', 'sardina', 'boqueron', 'embutido', 'fiambre', 'bacon', 'beicon', 'pechuga', 'muslo', 'albondiga', 'picada', 'pulpo', 'conejo', 'chuleta', 'morcilla', 'fuet', 'mortadela', 'rape', 'trucha']],
  ['fruta', ['fruta', 'verdura', 'manzana', 'platano', 'naranja', 'limon', 'pera', 'uva', 'fresa', 'melon', 'sandia', 'kiwi', 'tomate', 'lechuga', 'cebolla', 'ajo', 'patata', 'zanahoria', 'pimiento', 'calabacin', 'berenjena', 'pepino', 'aguacate', 'espinaca', 'brocoli', 'champinon', 'seta', 'mandarina', 'melocoton', 'pina', 'puerro', 'coliflor', 'perejil', 'cilantro', 'ensalada', 'rucula', 'canonigo', 'calabaza', 'alcachofa', 'cereza', 'mango', 'arandano', 'frambuesa', 'nectarina', 'albaricoque', 'ciruela', 'apio', 'judia verde', 'judias verdes', 'lima', 'jengibre', 'batata', 'boniato']],
  ['panaderia', ['pan', 'barra', 'baguette', 'chapata', 'bolleria', 'croissant', 'cruasan', 'magdalena', 'bizcocho', 'tostada', 'picos', 'molde', 'donut', 'napolitana', 'tortilla de trigo', 'colines']],
  ['despensa', ['arroz', 'pasta', 'macarron', 'espagueti', 'fideo', 'harina', 'azucar', 'sal', 'aceite', 'vinagre', 'legumbre', 'lenteja', 'garbanzo', 'alubia', 'judia', 'atun', 'conserva', 'lata', 'cereal', 'galleta', 'cafe', 'te', 'cacao', 'colacao', 'chocolate', 'mermelada', 'miel', 'especia', 'pimienta', 'oregano', 'caldo', 'sopa', 'salsa', 'mayonesa', 'ketchup', 'mostaza', 'almendra', 'nuez', 'nueces', 'cacahuete', 'snack', 'aceituna', 'avena', 'quinoa', 'levadura', 'pure', 'tomate frito', 'gazpacho', 'infusion', 'manzanilla', 'cuscus']],
];

/**
 * Categoría probable de un producto. Primero lo que ya se eligió otras veces para ese mismo
 * nombre (si lo corregisteis, se recuerda); si no, por palabras clave; si no, "Otros".
 */
export function guessCategory(name: string, history: ShoppingItem[] = []): ShopCategory {
  const previous = history
    .filter((i) => sameProduct(i.name, name))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (previous) return previous.category;
  const n = normalize(name).replace(/\s+/g, ' ');
  if (!n) return 'otros';
  for (const [phrase, cat] of PHRASES) if (n.includes(phrase)) return cat;
  const words = n.split(/[^a-z0-9]+/).filter(Boolean);
  for (const [cat, keys] of WORDS) {
    for (const k of keys) {
      if (k.includes(' ') ? n.includes(k) : words.some((w) => matchesWord(w, k))) return cat;
    }
  }
  return 'otros';
}

function matchesWord(word: string, key: string): boolean {
  // Las claves cortas ("pan", "sal", "te", "ron") solo valen como palabra entera o en plural,
  // para que "pantalón" no sea pan ni "salsa" sea sal.
  if (key.length <= 4) return word === key || word === key + 's' || word === key + 'es';
  return word.startsWith(key);
}

/** Productos pendientes con el mismo nombre (para avisar antes de apuntarlo otra vez). */
export function pendingMatch(items: ShoppingItem[], name: string): ShoppingItem | undefined {
  return items.find((i) => i.status === 'pending' && sameProduct(i.name, name));
}

/** Pendientes: primero los importantes y después los últimos apuntados. */
export function sortPending(items: ShoppingItem[]): ShoppingItem[] {
  return items
    .filter((i) => i.status === 'pending')
    .sort((a, b) => Number(b.important) - Number(a.important) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

/** Comprados de la compra en curso (aún sin terminar), el último arriba. */
export function currentBought(items: ShoppingItem[]): ShoppingItem[] {
  return items
    .filter((i) => i.status === 'bought' && !i.cleared_at)
    .sort((a, b) => (b.bought_at ?? '').localeCompare(a.bought_at ?? ''));
}

/** Todo lo comprado alguna vez, lo último arriba. */
export function boughtHistory(items: ShoppingItem[]): ShoppingItem[] {
  return items
    .filter((i) => i.status === 'bought')
    .sort((a, b) => (b.bought_at ?? '').localeCompare(a.bought_at ?? ''));
}

/** Cuántos quedan y cuántos se han comprado en la compra en curso. */
export function tripProgress(items: ShoppingItem[]): { pending: number; bought: number; total: number } {
  const pending = items.filter((i) => i.status === 'pending').length;
  const bought = items.filter((i) => i.status === 'bought' && !i.cleared_at).length;
  return { pending, bought, total: pending + bought };
}

export interface KnownProduct {
  /** Nombre tal y como se escribió la última vez. */
  name: string;
  key: string;
  /** Veces que se ha comprado. */
  count: number;
  lastBoughtAt: string;
  /** La última vez que se compró: de aquí salen cantidad, unidad y categoría al volver a añadirlo. */
  last: ShoppingItem;
}

/** Productos comprados alguna vez, uno por nombre. */
export function knownProducts(items: ShoppingItem[]): KnownProduct[] {
  const map = new Map<string, KnownProduct>();
  for (const i of boughtHistory(items)) {
    const key = normalize(i.name).replace(/\s+/g, ' ');
    const p = map.get(key);
    if (p) p.count++;
    else map.set(key, { name: i.name, key, count: 1, lastBoughtAt: i.bought_at ?? i.updated_at, last: i });
  }
  return [...map.values()];
}

/**
 * Habituales: comprados al menos dos veces, por número de compras y después los más recientes.
 * Recientes: el resto de lo comprado, del último al más antiguo (sin repetir los habituales).
 */
export function frequentAndRecent(items: ShoppingItem[], limits = { frequent: 18, recent: 10 }): { frequent: KnownProduct[]; recent: KnownProduct[] } {
  const known = knownProducts(items);
  const frequent = known
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastBoughtAt.localeCompare(a.lastBoughtAt))
    .slice(0, limits.frequent);
  const shown = new Set(frequent.map((p) => p.key));
  const recent = known
    .filter((p) => !shown.has(p.key))
    .sort((a, b) => b.lastBoughtAt.localeCompare(a.lastBoughtAt))
    .slice(0, limits.recent);
  return { frequent, recent };
}

/** Nombres ya comprados que encajan con lo que se está escribiendo (para no escribirlo entero). */
export function suggestNames(items: ShoppingItem[], text: string, max = 5): KnownProduct[] {
  const q = normalize(text).replace(/\s+/g, ' ');
  if (!q) return [];
  return knownProducts(items)
    .filter((p) => p.key !== q && p.key.includes(q))
    .sort((a, b) => Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)) || b.count - a.count || b.lastBoughtAt.localeCompare(a.lastBoughtAt))
    .slice(0, max);
}

/** Filtro de la búsqueda: todas las palabras en el nombre y, si se elige, la categoría. */
export function matchesFilter(name: string, category: ShopCategory, filter: { text: string; category: ShopCategory | '' }): boolean {
  if (filter.category && category !== filter.category) return false;
  const n = normalize(name);
  return normalize(filter.text).split(/\s+/).filter(Boolean).every((w) => n.includes(w));
}

/** Sugerencias para empezar cuando todavía no hay historial. */
export const STARTER_PRODUCTS = ['Leche', 'Pan', 'Huevos', 'Fruta', 'Agua', 'Café', 'Aceite', 'Papel higiénico'];
