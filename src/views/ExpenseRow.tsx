import { expenseEffect } from '../lib/balance';
import { formatShortDay } from '../lib/dates';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import type { Expense, Member } from '../lib/types';
import type { HouseholdData } from '../lib/useHousehold';
import { CategoryIcon } from './common';
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
export function ExpenseRow({ expense: e, data, me, onOpen, showDate }: {
  expense: Expense;
  data: HouseholdData;
  me: string;
  onOpen: (e: Expense) => void;
  showDate?: boolean;
}) {
  const category = data.categories.find((c) => c.id === e.category_id)?.name ?? 'Sin categoría';
  const partner = partnerOf(data.members, me);
  const effect = expenseEffect(me, e);
  const meta = [
    e.note ? category : null,
    paidText(data.members, e.paid_by, me) + (e.created_by && e.created_by !== e.paid_by ? ` · ${addedText(data.members, e.created_by, me)}` : ''),
    showDate ? formatShortDay(e.spent_on) : null,
  ].filter(Boolean);

  return (
    <li>
      <button className="row-item" onClick={() => onOpen(e)}>
        <CategoryIcon name={category} />
        <span className="row-main">
          <span className="row-title">{e.note || category}</span>
          <span className="row-meta">
            {partner && e.owed_cents != null && <><span className="tag tag-accent">{splitLabel(e, me, partner.display_name)}</span>{' '}</>}
            {e.recurring_id && <><Icon name="repeat" size={14} label="Gasto fijo" />{' '}</>}
            {meta.join(' · ')}
          </span>
        </span>
        <span className="row-end">
          <span className="row-amount">{formatEuros(e.amount_cents)}</span>
          {partner && Math.round(effect) !== 0 && (
            <span className={'row-sub ' + (effect > 0 ? 'positive' : 'negative')}>
              {effect > 0 ? 'Te deben ' : 'Debes '}{formatEuros(Math.abs(effect))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
