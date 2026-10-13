import { centsToInput } from './money';
import type { Expense } from './types';

/** Minúsculas y sin tildes, para que "cafe" encuentre "Café". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface ExpenseFilter {
  text: string;
  categoryId: string; // '' = todas
}

/**
 * Filtra gastos por texto (nota, categoría, quién pagó o importe) y por categoría.
 * Todas las palabras escritas tienen que aparecer en alguno de esos campos.
 */
export function filterExpenses(
  expenses: Expense[],
  filter: ExpenseFilter,
  categoryName: (id: string) => string,
  payerName: (id: string) => string,
): Expense[] {
  const words = normalize(filter.text).split(/\s+/).filter(Boolean);
  return expenses.filter((e) => {
    if (filter.categoryId && e.category_id !== filter.categoryId) return false;
    if (words.length === 0) return true;
    const haystack = normalize([e.note ?? '', categoryName(e.category_id), payerName(e.paid_by), centsToInput(e.amount_cents)].join(' '));
    return words.every((w) => haystack.includes(w));
  });
}
