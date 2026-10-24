import { useState } from 'react';
import { REACTION_EMOJIS, reactionsOf } from '../lib/couple';
import { nameOf, partnerOf } from '../lib/people';
import { saveReaction } from '../lib/reactions';
import type { Expense, ExpenseReaction, Member } from '../lib/types';
import { askText, Avatar, toast, type ViewProps } from './common';
import { Icon } from './icons';

/** Reacciones de un gasto, pequeñas, bajo su concepto en las listas. */
export function ReactionChips({ reactions, members, me }: { reactions: ExpenseReaction[]; members: Member[]; me: string }) {
  if (reactions.length === 0) return null;
  return (
    <span className="reaction-chips">
      {reactions.map((r) => (
        <span key={r.user_id} className="reaction-chip">
          <Avatar members={members} userId={r.user_id} size="sm" />
          <span className="sr-only">{nameOf(members, r.user_id, me)}: </span>
          {r.emoji}
          {r.comment && <span className="ellipsis">«{r.comment}»</span>}
        </span>
      ))}
    </span>
  );
}

/** En la ficha de un gasto: lo que ha dicho tu pareja y tu reacción (emoji y comentario). */
export function ReactionPicker({ data, me, reload, expense }: ViewProps & { expense: Expense }) {
  const partner = partnerOf(data.members, me);
  const [busy, setBusy] = useState(false);
  if (!partner) return null;
  const list = reactionsOf(data.reactions, expense.id, me);
  const theirs = list.find((r) => r.user_id !== me);
  const mine = list.find((r) => r.user_id === me);

  async function save(patch: { emoji?: string | null; comment?: string | null }) {
    setBusy(true);
    const error = await saveReaction({ householdId: data.household.id, expenseId: expense.id, me, current: mine }, patch);
    setBusy(false);
    if (error) return toast(error, 'error');
    await reload();
  }

  async function writeComment() {
    const text = await askText({
      title: mine?.comment ? 'Cambiar comentario' : `Comentario para ${partner!.display_name}`,
      label: 'Comentario (le llega un aviso)',
      initial: mine?.comment ?? '',
      maxLength: 120,
      confirmLabel: 'Guardar',
    });
    if (text != null) await save({ comment: text });
  }

  return (
    <section className="card reaction-card" aria-label="Reacciones">
      {theirs && (
        <p className="reaction-theirs">
          <Avatar members={data.members} userId={partner.user_id} size="sm" />
          <span>
            <strong>{partner.display_name}</strong> {theirs.emoji && <span className="reaction-big">{theirs.emoji}</span>}
            {theirs.comment && <> «{theirs.comment}»</>}
          </span>
        </p>
      )}
      <div className="reaction-row" role="group" aria-label="Tu reacción">
        {REACTION_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className={'reaction-btn' + (mine?.emoji === e ? ' selected' : '')}
            aria-pressed={mine?.emoji === e}
            disabled={busy}
            onClick={() => save({ emoji: mine?.emoji === e ? null : e })}
          >
            {e}
          </button>
        ))}
        <button type="button" className="reaction-btn" aria-label={mine?.comment ? 'Cambiar comentario' : 'Escribir comentario'} disabled={busy} onClick={writeComment}>
          <Icon name="edit" size={18} />
        </button>
      </div>
      {mine?.comment && (
        <p className="muted small reaction-mine">
          Tú: «{mine.comment}» <button type="button" className="link-btn small" disabled={busy} onClick={() => save({ comment: null })}>Quitar</button>
        </p>
      )}
    </section>
  );
}
