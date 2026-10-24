import { expenseEffect } from '../lib/balance';
import { isQueued } from '../lib/expenseOutbox';
import { formatShortDay } from '../lib/dates';
import { reactionsOf } from '../lib/couple';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import type { Expense, Member } from '../lib/types';
import type { HouseholdData } from '../lib/useHousehold';
import { Avatar, CategoryIcon } from './common';
import { ReactionChips } from './Reactions';
import { Icon } from './icons';

/** "Pagaste tú" / "Pagó Ana". */
export function paidText(members: Member[], userId: string, me: string): string {
  return userId === me ? 'Pagaste tú' : `Pagó ${nameOf(members, userId)}`;
}

/** "lo apuntaste tú" / "lo apuntó Ana". */
export function addedText(members: Member[], userId: string, me: string): string {
  return userId === me ? 'lo apuntaste tú' : `lo apuntó ${nameOf(members, userId)}`;
}

/** Etiqueta del reparto personalizado desde el punto de vista de quien mira. */
export function splitLabel(e: Expense, me: string, partnerName: string): string {
  const owed = e.owed_cents ?? e.amount_cents / 2;
  const mine = e.paid_by === me ? e.amount_cents - owed : owed;
  const p = Math.round((mine * 100) / e.amount_cents);
  if (mine === e.amount_cents) return 'Solo tuyo';
  if (mine === 0) return `Solo de ${partnerName}`;
  return `Tú ${p} %`;
}

/** Fila de un gasto común: categoría, concepto, quién pagó, importe y cómo afecta al saldo. */
export function ExpenseRow({ expense: e, data, me, onOpen, showDate, hideEvent }: {
  expense: Expense;
  data: HouseholdData;
  me: string;
  onOpen: (e: Expense) => void;
  showDate?: boolean;
  /** No enseñar el viaje (dentro del propio viaje sobra). */
  hideEvent?: boolean;
}) {
  const event = !hideEvent && e.event_id ? data.events.find((x) => x.id === e.event_id) : undefined;
  const pending = isQueued(e.id);
  const category = data.categories.find((c) => c.id === e.category_id)?.name ?? 'Sin categoría';
  const partner = partnerOf(data.members, me);
  const effect = expenseEffect(me, e);
  // Con pareja, quién pagó se ve por su cara sobre el icono; solo se escribe si lo apuntó la otra persona.
  const meta = [
    e.note ? category : null,
    partner
      ? (e.created_by && e.created_by !== e.paid_by ? addedText(data.members, e.created_by, me).replace(/^lo/, 'Lo') : null)
      : paidText(data.members, e.paid_by, me),
    showDate ? formatShortDay(e.spent_on) : null,
  ].filter(Boolean);
  const reactions = reactionsOf(data.reactions, e.id, me);

  return (
    <li>
      <button className="row-item" onClick={() => onOpen(e)}>
        {partner ? (
          <span className="payer-badge">
            <CategoryIcon name={category} />
            <Avatar members={data.members} userId={e.paid_by} size="sm" />
            <span className="sr-only">{paidText(data.members, e.paid_by, me)}.</span>
          </span>
        ) : (
          <CategoryIcon name={category} />
        )}
        <span className="row-main">
          <span className="row-title">{e.note || category}</span>
          <span className="row-meta">
            {partner && e.owed_cents != null && <><span className="tag tag-accent">{splitLabel(e, me, partner.display_name)}</span>{' '}</>}
            {pending && <><span className="tag tag-warn"><Icon name="clock" size={12} /> Sin subir</span>{' '}</>}
            {event && <><span className="tag"><Icon name="suitcase" size={12} /> {event.name}</span>{' '}</>}
            {e.recurring_id && <><Icon name="repeat" size={14} label="Gasto fijo" />{' '}</>}
            {meta.join(' · ')}
          </span>
          <ReactionChips reactions={reactions} members={data.members} me={me} />
        </span>
        <span className="row-end">
          <span className="row-amount">{formatEuros(e.amount_cents)}</span>
          {partner && Math.round(effect) !== 0 && (
            <span className="row-sub muted">
              {effect > 0 ? `Parte de ${partner.display_name} ` : 'Tu parte '}{formatEuros(Math.abs(effect))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
