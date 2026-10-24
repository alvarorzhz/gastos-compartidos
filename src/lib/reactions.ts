import { errorMessage, supabase } from './supabase';
import type { ExpenseReaction } from './types';

/**
 * Guarda tu reacción a un gasto (emoji y/o comentario). Si se queda sin nada, se borra.
 * Cuando añades algo nuevo, se avisa a la pareja en el móvil. Devuelve un error legible o null.
 */
export async function saveReaction(
  { householdId, expenseId, me, current }: { householdId: string; expenseId: string; me: string; current: ExpenseReaction | undefined },
  patch: { emoji?: string | null; comment?: string | null },
): Promise<string | null> {
  const emoji = patch.emoji !== undefined ? patch.emoji : current?.emoji ?? null;
  const comment = patch.comment !== undefined ? patch.comment?.trim() || null : current?.comment ?? null;
  if (!emoji && !comment) {
    const { error } = await supabase.from('expense_reactions').delete().eq('expense_id', expenseId).eq('user_id', me);
    return error ? errorMessage(error) : null;
  }
  const { error } = await supabase
    .from('expense_reactions')
    .upsert({ expense_id: expenseId, user_id: me, household_id: householdId, emoji, comment, updated_at: new Date().toISOString() }, { onConflict: 'expense_id,user_id' });
  if (error) return errorMessage(error);
  const added = (emoji && emoji !== current?.emoji) || (comment && comment !== current?.comment);
  if (added) void supabase.functions.invoke('avisar', { body: { reaction_expense_id: expenseId } }).catch(() => undefined);
  return null;
}
