import type { SavingsContribution, SavingsGoal } from './types';

export interface GoalProgress {
  goal: SavingsGoal;
  savedCents: number;
  /** 0..1 (puede pasar de 1 si se supera el objetivo). */
  ratio: number;
  byUser: Map<string, number>;
}

export function goalProgress(goal: SavingsGoal, contributions: SavingsContribution[]): GoalProgress {
  const byUser = new Map<string, number>();
  let savedCents = 0;
  for (const c of contributions) {
    if (c.goal_id !== goal.id) continue;
    savedCents += c.amount_cents;
    byUser.set(c.user_id, (byUser.get(c.user_id) ?? 0) + c.amount_cents);
  }
  return { goal, savedCents, ratio: savedCents / goal.target_cents, byUser };
}
