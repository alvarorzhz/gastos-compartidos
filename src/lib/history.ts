import { formatDay } from './dates';
import { formatEuros } from './money';
import { nameOf } from './people';
import type { Category, Expense, Member } from './types';

/** Una fila de expense_changes (0014): quién creó, cambió o borró un gasto. */
export interface ExpenseChange {
  id: number;
  household_id: string;
  expense_id: string;
  action: 'insert' | 'update' | 'delete';
  changed_by: string | null;
  changed_at: string;
  old_row: Partial<Expense> | null;
  new_row: Partial<Expense> | null;
}

export interface ChangeLine {
  title: string;
  /** Quién y qué, en una línea: "Tú · Súper Lidl". */
  meta: string;
  /** Qué cambió, solo en las ediciones. */
  details: string[];
}

const VERBS = { insert: 'apuntó', update: 'cambió', delete: 'borró' } as const;

/** Lo que se cuenta de cada cambio, en palabras. */
export function describeChange(change: ExpenseChange, members: Member[], categories: Category[], me: string): ChangeLine {
  const who = change.changed_by ? nameOf(members, change.changed_by, me) : 'La app';
  const verb = who === 'Tú' ? { insert: 'apuntaste', update: 'cambiaste', delete: 'borraste' }[change.action] : VERBS[change.action];
  const row = change.new_row ?? change.old_row ?? {};
  const catName = (id?: string | null) => categories.find((c) => c.id === id)?.name ?? 'Sin categoría';
  const label = row.note?.trim() || catName(row.category_id);
  const amount = typeof row.amount_cents === 'number' ? formatEuros(row.amount_cents) : '';
  return {
    title: `${who} ${verb} ${amount ? amount + ' · ' : ''}${label}`,
    meta: change.action === 'insert' && !change.changed_by ? 'Apuntado solo (gasto fijo o Apple Pay)' : '',
    details: change.action === 'update' && change.old_row && change.new_row ? diffLines(change.old_row, change.new_row, members, catName, me) : [],
  };
}

function diffLines(
  before: Partial<Expense>,
  after: Partial<Expense>,
  members: Member[],
  catName: (id?: string | null) => string,
  me: string,
): string[] {
  const lines: string[] = [];
  if (before.amount_cents !== after.amount_cents) lines.push(`Importe: ${formatEuros(before.amount_cents ?? 0)} → ${formatEuros(after.amount_cents ?? 0)}`);
  if ((before.note ?? '') !== (after.note ?? '')) lines.push(`Concepto: ${before.note || '—'} → ${after.note || '—'}`);
  if (before.category_id !== after.category_id) lines.push(`Categoría: ${catName(before.category_id)} → ${catName(after.category_id)}`);
  if (before.spent_on !== after.spent_on && before.spent_on && after.spent_on) lines.push(`Fecha: ${formatDay(before.spent_on)} → ${formatDay(after.spent_on)}`);
  if (before.paid_by !== after.paid_by && before.paid_by && after.paid_by) {
    lines.push(`Pagó: ${nameOf(members, before.paid_by, me)} → ${nameOf(members, after.paid_by, me)}`);
  }
  if ((before.owed_cents ?? null) !== (after.owed_cents ?? null)) lines.push('Cambió el reparto');
  if ((before.event_id ?? null) !== (after.event_id ?? null)) lines.push(after.event_id ? 'Lo pasó a un viaje' : 'Lo sacó del viaje');
  return lines;
}

/** Agrupa por día ("hoy", "ayer", "12 de octubre") en el orden en que llegan. */
export function groupByDay<T extends { changed_at: string }>(items: T[], now = new Date()): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = dayLabel(new Date(item.changed_at), now);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

function dayLabel(d: Date, now: Date): string {
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(now)) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key(d) === key(yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
