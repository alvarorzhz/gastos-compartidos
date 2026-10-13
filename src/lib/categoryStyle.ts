import { normalize } from './search';

/** Nombres de los iconos de categoría (ver src/views/icons.tsx). */
export type CategoryIconName =
  | 'cart' | 'home' | 'bolt' | 'wifi' | 'car' | 'utensils' | 'coffee' | 'ticket' | 'health' | 'suitcase'
  | 'shirt' | 'gift' | 'paw' | 'book' | 'dumbbell' | 'sparkles' | 'coins' | 'percent' | 'repeat' | 'users' | 'tag';

export interface CategoryStyle {
  icon: CategoryIconName;
  /** Tono de color 1..11 (variables --cat-N de styles.css). */
  tone: number;
}

/**
 * Las categorías solo tienen nombre, así que el icono y el color salen de palabras clave del nombre.
 * Si no reconoce ninguna, usa una etiqueta con un color fijo para ese nombre (siempre el mismo).
 */
const RULES: { words: string[]; style: CategoryStyle }[] = [
  { words: ['super', 'compra', 'mercado', 'aliment', 'fruta', 'carnic', 'panader'], style: { icon: 'cart', tone: 9 } },
  { words: ['casa', 'hogar', 'alquiler', 'hipoteca', 'mueble', 'comunidad', 'limpieza'], style: { icon: 'home', tone: 2 } },
  { words: ['factura', 'luz', 'agua', 'gas', 'recibo', 'suministro', 'electric'], style: { icon: 'bolt', tone: 6 } },
  { words: ['internet', 'movil', 'telefon', 'wifi', 'fibra', 'suscrip', 'netflix', 'spotify', 'streaming'], style: { icon: 'wifi', tone: 8 } },
  { words: ['transporte', 'coche', 'gasolina', 'parking', 'aparcamiento', 'metro', 'bus', 'tren', 'taxi', 'peaje'], style: { icon: 'car', tone: 1 } },
  { words: ['cafe', 'desayuno', 'merienda'], style: { icon: 'coffee', tone: 11 } },
  { words: ['restaurante', 'comida fuera', 'comer fuera', 'cena', 'bar', 'delivery', 'pedido'], style: { icon: 'utensils', tone: 5 } },
  { words: ['ocio', 'cine', 'concierto', 'entrada', 'fiesta', 'plan', 'teatro', 'juego'], style: { icon: 'ticket', tone: 3 } },
  { words: ['salud', 'farmacia', 'medic', 'dentista', 'seguro', 'optica'], style: { icon: 'health', tone: 4 } },
  { words: ['viaje', 'vacacion', 'hotel', 'vuelo', 'escapada'], style: { icon: 'suitcase', tone: 7 } },
  { words: ['ropa', 'moda', 'zapat', 'calzado'], style: { icon: 'shirt', tone: 3 } },
  { words: ['regalo'], style: { icon: 'gift', tone: 4 } },
  { words: ['mascota', 'perro', 'gato', 'veterinari'], style: { icon: 'paw', tone: 11 } },
  { words: ['educacion', 'libro', 'curso', 'colegio', 'formacion'], style: { icon: 'book', tone: 2 } },
  { words: ['deporte', 'gimnasio', 'gym', 'padel'], style: { icon: 'dumbbell', tone: 9 } },
  { words: ['cuidado', 'belleza', 'peluquer'], style: { icon: 'sparkles', tone: 4 } },
  { words: ['nomina', 'sueldo', 'salario', 'extra', 'venta', 'paga'], style: { icon: 'coins', tone: 7 } },
  { words: ['interes', 'rendimiento'], style: { icon: 'percent', tone: 7 } },
  { words: ['niño', 'nino', 'bebe', 'hijo', 'guarderia', 'familia'], style: { icon: 'users', tone: 5 } },
];

const TONES = 11;

export function categoryStyle(name: string): CategoryStyle {
  const n = normalize(name);
  const words = n.split(/[^a-z0-9ñ]+/).filter(Boolean);
  for (const rule of RULES) {
    // Palabras compuestas ("comida fuera") se buscan en todo el nombre; el resto, al inicio de cada palabra.
    if (rule.words.some((w) => (w.includes(' ') ? n.includes(w) : words.some((x) => x.startsWith(w))))) return rule.style;
  }
  let hash = 0;
  for (const ch of n) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: 'tag', tone: n === 'otros' || n === '' ? 10 : (hash % TONES) + 1 };
}
