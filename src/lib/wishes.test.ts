import { describe, expect, it } from 'vitest';
import { chosenOne, moodText, rankWishes, waitingForMe } from './wishes';
import type { Wish, WishVote } from './types';

const A = 'a';
const B = 'b';
let n = 0;
function wish(over: Partial<Wish> = {}): Wish {
  n++;
  return {
    id: 'w' + n, household_id: 'h', kind: 'treat', name: 'Capricho ' + n, price_cents: null, note: null, created_by: A,
    done_at: null, goal_id: null, created_at: `2026-11-01T10:00:${String(n).padStart(2, '0')}Z`, ...over,
  };
}
const vote = (w: Wish, user_id: string, score: number): WishVote => ({ wish_id: w.id, household_id: 'h', user_id, score, updated_at: '' });

describe('rankWishes', () => {
  it('sube los más votados por los dos y deja abajo los que esperan voto y los descartados', () => {
    const sushi = wish({ name: 'Sushi' });
    const spa = wish({ name: 'Spa' });
    const cine = wish({ name: 'Cine' });
    const juego = wish({ name: 'Juego' });
    const votes = [vote(sushi, A, 2), vote(sushi, B, 2), vote(spa, A, 3), vote(spa, B, 3), vote(cine, A, 3), vote(juego, A, 3), vote(juego, B, 0)];
    const ranked = rankWishes([sushi, spa, cine, juego], votes, [A, B], 'treat');
    expect(ranked.map((r) => r.wish.name)).toEqual(['Spa', 'Sushi', 'Cine', 'Juego']);
    expect(ranked[2].missing).toEqual([B]);
    expect(ranked[3].vetoed).toBe(true);
    expect(chosenOne(ranked)?.wish.name).toBe('Spa');
  });

  it('separa deseos de caprichos y quita los cumplidos', () => {
    const sofa = wish({ kind: 'wish', name: 'Sofá' });
    const hecho = wish({ done_at: '2026-11-01T00:00:00Z' });
    const otro = wish();
    expect(rankWishes([sofa, hecho, otro], [], [A, B], 'treat').map((r) => r.wish.id)).toEqual([otro.id]);
    expect(rankWishes([sofa, hecho, otro], [], [A, B], 'wish').map((r) => r.wish.name)).toEqual(['Sofá']);
  });

  it('a igualdad de votos va primero el más antiguo', () => {
    const viejo = wish();
    const nuevo = wish();
    const votes = [vote(nuevo, A, 2), vote(nuevo, B, 1), vote(viejo, A, 1), vote(viejo, B, 2)];
    expect(rankWishes([nuevo, viejo], votes, [A, B], 'treat')[0].wish.id).toBe(viejo.id);
  });

  it('no hay elegido si falta un voto o todos pasan', () => {
    const w = wish();
    expect(chosenOne(rankWishes([w], [vote(w, A, 3)], [A, B], 'treat'))).toBeNull();
    expect(chosenOne(rankWishes([w], [vote(w, A, 0), vote(w, B, 0)], [A, B], 'treat'))).toBeNull();
  });

  it('no cuenta votos de quien ya no está en el espacio', () => {
    const w = wish();
    const [r] = rankWishes([w], [vote(w, A, 2), vote(w, 'antiguo', 3)], [A, B], 'treat');
    expect(r.total).toBe(2);
  });
});

describe('waitingForMe', () => {
  it('lista lo que aún no he votado', () => {
    const w1 = wish();
    const w2 = wish();
    expect(waitingForMe([w1, w2], [vote(w1, A, 1), vote(w2, B, 2)], A).map((w) => w.id)).toEqual([w2.id]);
  });
});

describe('moodText', () => {
  it('describe las ganas de los dos', () => {
    const w = wish();
    expect(moodText(rankWishes([w], [vote(w, A, 3), vote(w, B, 2)], [A, B], 'treat')[0])).toBe('Os apetece muchísimo');
    expect(moodText(rankWishes([w], [vote(w, A, 1), vote(w, B, 2)], [A, B], 'treat')[0])).toBe('Os apetece mucho');
    expect(moodText(rankWishes([w], [], [A, B], 'treat')[0])).toBe('Aún nadie ha votado');
  });
});
