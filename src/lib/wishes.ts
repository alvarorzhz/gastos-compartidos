import type { Wish, WishKind, WishVote } from './types';

/*
 * Deseos y caprichos de la pareja: cada uno vota cuánto le apetece y los más votados
 * por los dos suben arriba. El primero de los caprichos es «el elegido».
 */

export const VOTES = [
  { score: 0, emoji: '🙅', label: 'Paso', short: 'Paso' },
  { score: 1, emoji: '🙂', label: 'Me apetece', short: 'Vale' },
  { score: 2, emoji: '😍', label: 'Me apetece mucho', short: 'Mucho' },
  { score: 3, emoji: '🤩', label: '¡Me apetece muchísimo!', short: '¡Top!' },
] as const;

export const MAX_SCORE = 3;

export interface RankedWish {
  wish: Wish;
  /** Suma de los votos. */
  total: number;
  /** Voto de cada persona que ya ha votado. */
  byUser: Map<string, number>;
  /** Quién falta por votar. */
  missing: string[];
  /** Alguno de los dos ha dicho «Paso». */
  vetoed: boolean;
}

export function rankWish(wish: Wish, votes: WishVote[], memberIds: string[]): RankedWish {
  const byUser = new Map<string, number>();
  for (const v of votes) if (v.wish_id === wish.id && memberIds.includes(v.user_id)) byUser.set(v.user_id, v.score);
  const scores = [...byUser.values()];
  return {
    wish,
    total: scores.reduce((a, b) => a + b, 0),
    byUser,
    missing: memberIds.filter((id) => !byUser.has(id)),
    vetoed: scores.includes(0),
  };
}

/**
 * Los que siguen en la lista, del más votado al menos: primero los que ya han votado los dos
 * (y nadie ha dicho «Paso»), luego los que esperan un voto y al final los descartados.
 * A igualdad de votos, el más antiguo primero.
 */
export function rankWishes(wishes: Wish[], votes: WishVote[], memberIds: string[], kind: WishKind): RankedWish[] {
  const group = (r: RankedWish) => (r.vetoed ? 2 : r.missing.length > 0 ? 1 : 0);
  return wishes
    .filter((w) => w.kind === kind && !w.done_at)
    .map((w) => rankWish(w, votes, memberIds))
    .sort((a, b) => group(a) - group(b) || b.total - a.total || a.wish.created_at.localeCompare(b.wish.created_at));
}

/** El capricho elegido: el más votado de los que ya han votado los dos sin decir «Paso». */
export function chosenOne(ranked: RankedWish[]): RankedWish | null {
  const top = ranked[0];
  return top && top.missing.length === 0 && !top.vetoed && top.total > 0 ? top : null;
}

/** Deseos y caprichos en los que aún no he votado. */
export function waitingForMe(wishes: Wish[], votes: WishVote[], me: string): Wish[] {
  return wishes.filter((w) => !w.done_at && !votes.some((v) => v.wish_id === w.id && v.user_id === me));
}

/** "Os apetece muchísimo" según la media de los dos (para la tarjeta del elegido). */
export function moodText(r: RankedWish): string {
  const voters = r.byUser.size;
  if (voters === 0) return 'Aún nadie ha votado';
  const avg = r.total / voters;
  if (r.vetoed) return 'Uno de los dos pasa';
  if (avg >= 2.5) return 'Os apetece muchísimo';
  if (avg >= 1.5) return 'Os apetece mucho';
  return 'Os apetece';
}
