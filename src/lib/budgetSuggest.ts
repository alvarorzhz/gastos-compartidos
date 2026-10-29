import { addMonths, monthOf } from './dates';
import { effectiveBudgets } from './budget';
import type { Budget, Category, Expense } from './types';

/*
 * Límites que se proponen solos.
 *
 * Mira lo gastado en cada categoría los 3 meses completos anteriores y toma el mes «normal»
 * (la mediana: un mes raro, como el de un viaje, no lo desvía). Si la categoría no tiene
 * límite y gastáis algo cada mes, propone uno; si lo tiene pero se queda muy corto o muy largo,
 * propone ajustarlo. Solo propone: nada cambia hasta que lo aceptáis.
 */

export interface BudgetSuggestion {
  category: Category;
  /** Límite que tiene ahora (null = sin límite). */
  currentCents: number | null;
  suggestedCents: number;
  /** Lo gastado los 3 meses anteriores, del más antiguo al más reciente. */
  monthsCents: number[];
  reason: 'new' | 'over' | 'under';
}

const MONTHS = 3;
/** Por debajo de esto no merece la pena poner límite. */
const MIN_CENTS = 2000;
/** Diferencia mínima para proponer cambiar un límite que ya existe. */
const MIN_CHANGE_RATIO = 0.15;
const MIN_CHANGE_CENTS = 2000;

/** Redondea hacia arriba a 5 € (hasta 100 €) o a 10 € (por encima), para que sea un número cómodo. */
export function roundUp(cents: number): number {
  const step = cents <= 10000 ? 500 : 1000;
  return Math.ceil(cents / step) * step;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Propuestas de límite para el mes `month` ("YYYY-MM-01"), de la que más cambia a la que menos. */
export function suggestBudgets(month: string, categories: Category[], expenses: Expense[], budgets: Budget[]): BudgetSuggestion[] {
  const months = Array.from({ length: MONTHS }, (_, i) => addMonths(month, i - MONTHS));
  // Hace falta haber usado la app esos 3 meses; si no, los números no dicen nada todavía.
  const first = expenses.reduce<string | null>((min, e) => (min == null || e.spent_on < min ? e.spent_on : min), null);
  if (first == null || monthOf(first) > months[0]) return [];

  const spent = new Map<string, number[]>();
  for (const e of expenses) {
    const idx = months.indexOf(monthOf(e.spent_on));
    if (idx < 0) continue;
    const row = spent.get(e.category_id) ?? Array<number>(MONTHS).fill(0);
    row[idx] += e.amount_cents;
    spent.set(e.category_id, row);
  }
  const current = effectiveBudgets(month, budgets);

  const result: BudgetSuggestion[] = [];
  for (const category of categories) {
    if (category.archived) continue;
    const monthsCents = spent.get(category.id) ?? Array<number>(MONTHS).fill(0);
    const usual = median(monthsCents);
    const currentCents = current.get(category.id) ?? null;
    if (currentCents == null) {
      // Sin límite: solo si se gasta todos los meses algo que merezca la pena.
      if (usual < MIN_CENTS || monthsCents.some((c) => c === 0)) continue;
      result.push({ category, currentCents, suggestedCents: roundUp(usual), monthsCents, reason: 'new' });
      continue;
    }
    const suggestedCents = roundUp(Math.max(usual, MIN_CENTS));
    const diff = suggestedCents - currentCents;
    if (Math.abs(diff) < MIN_CHANGE_CENTS || Math.abs(diff) < currentCents * MIN_CHANGE_RATIO) continue;
    // Subir solo si os pasáis casi siempre; bajar solo si os sobra todos los meses.
    const overMonths = monthsCents.filter((c) => c > currentCents).length;
    if (diff > 0 && overMonths < 2) continue;
    if (diff < 0 && overMonths > 0) continue;
    result.push({ category, currentCents, suggestedCents, monthsCents, reason: diff > 0 ? 'over' : 'under' });
  }
  const change = (s: BudgetSuggestion) => Math.abs(s.suggestedCents - (s.currentCents ?? 0));
  return result.sort((a, b) => change(b) - change(a));
}
