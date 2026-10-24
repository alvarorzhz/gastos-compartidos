import { useId, useState, type FormEvent } from 'react';
import { roundBalance } from '../lib/balance';
import { today } from '../lib/dates';
import { currentEvent, eventDates, eventSummary } from '../lib/events';
import { formatEuros } from '../lib/money';
import { nameOf, partnerOf } from '../lib/people';
import { errorMessage, supabase } from '../lib/supabase';
import type { Expense, TripEvent } from '../lib/types';
import { Avatar, confirmAction, EmptyState, Notice, SectionHeader, Sheet, toast, type ViewProps } from './common';
import ExpenseForm from './ExpenseForm';
import { ExpenseRow } from './ExpenseRow';
import { Icon } from './icons';

/** Lista de viajes y eventos, con su total. Desde aquí se crean y se abren. */
export function EventsSheet(props: ViewProps & { onClose: () => void }) {
  const { data, me, onClose } = props;
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const running = currentEvent(data.events, today());
  const active = data.events.filter((e) => !e.archived);
  const archived = data.events.filter((e) => e.archived);
  const open = data.events.find((e) => e.id === openId);

  if (open) return <EventDetail {...props} event={open} onClose={() => setOpenId(null)} />;
  if (creating) return <EventForm {...props} event={null} onClose={() => setCreating(false)} />;

  const row = (e: TripEvent) => {
    const s = eventSummary(e.id, data.expenses, me);
    const dates = eventDates(e);
    return (
      <li key={e.id}>
        <button className="row-item" onClick={() => setOpenId(e.id)}>
          <span className="icon-tile accent"><Icon name="suitcase" /></span>
          <span className="row-main">
            <span className="row-title">
              {e.name}
              {running?.id === e.id && <> <span className="tag tag-accent">En curso</span></>}
            </span>
            <span className="row-meta">{[dates, `${s.expenses.length} ${s.expenses.length === 1 ? 'gasto' : 'gastos'}`].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="row-end"><span className="row-amount">{formatEuros(s.totalCents)}</span></span>
        </button>
      </li>
    );
  };

  return (
    <Sheet
      title="Viajes y eventos"
      subtitle="Agrupa los gastos de un viaje, una boda o una mudanza para ver cuánto os costó."
      onClose={onClose}
      footer={<button className="primary lg block" onClick={() => setCreating(true)}><Icon name="plus" /> Nuevo viaje o evento</button>}
    >
      {data.events.length === 0 ? (
        <EmptyState
          icon="suitcase"
          title="Todavía no hay viajes"
          text="Crea uno con sus fechas: mientras dure, los gastos nuevos se apuntarán en él solos. También puedes elegirlo a mano en cada gasto."
        />
      ) : (
        <div className="stack">
          {active.length > 0 && <ul className="list with-icons">{active.map(row)}</ul>}
          {archived.length > 0 && (
            showArchived ? (
              <div className="section">
                <SectionHeader title="Archivados" />
                <ul className="list with-icons">{archived.map(row)}</ul>
              </div>
            ) : (
              <button className="link-btn small" onClick={() => setShowArchived(true)}>Ver archivados ({archived.length})</button>
            )
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Un viaje: total, quién pagó qué, saldo del viaje y sus gastos. */
function EventDetail(props: ViewProps & { event: TripEvent; onClose: () => void }) {
  const { data, me, reload, event, onClose } = props;
  const [editing, setEditing] = useState(false);
  const [openExpense, setOpenExpense] = useState<Expense | null>(null);
  const partner = partnerOf(data.members, me);
  const s = eventSummary(event.id, data.expenses, me);
  const balance = roundBalance(s.balanceCents);

  if (editing) return <EventForm {...props} event={event} onClose={() => setEditing(false)} />;
  if (openExpense) return <ExpenseForm {...props} expense={openExpense} onClose={() => setOpenExpense(null)} />;

  async function toggleArchived() {
    const { error } = await supabase.from('events').update({ archived: !event.archived }).eq('id', event.id);
    if (error) return toast(errorMessage(error), 'error');
    await reload();
    toast(event.archived ? 'Viaje recuperado' : 'Viaje archivado');
  }

  async function remove() {
    const ok = await confirmAction({
      title: `¿Borrar «${event.name}»?`,
      message: 'Los gastos no se borran: siguen apuntados, solo dejan de estar agrupados en este viaje.',
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) return toast(errorMessage(error), 'error');
    await reload();
    toast('Viaje borrado');
    onClose();
  }

  const payers = [...new Set([...data.members.map((m) => m.user_id), ...s.paidBy.keys()])];

  return (
    <Sheet
      title={event.name}
      subtitle={eventDates(event) || undefined}
      onClose={onClose}
      footer={
        <div className="row">
          <button type="button" className="secondary" onClick={() => setEditing(true)}><Icon name="edit" size={18} /> Editar</button>
          <button type="button" className="secondary" onClick={toggleArchived}><Icon name="archive" size={18} /> {event.archived ? 'Recuperar' : 'Archivar'}</button>
          <button type="button" className="danger" onClick={remove} aria-label="Borrar viaje"><Icon name="trash" size={18} /></button>
        </div>
      }
    >
      <div className="stack">
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="stat-label">Total</span>
            <strong>{formatEuros(s.totalCents)}</strong>
          </div>
          {partner && (
            <div className="stat-tile">
              <span className="stat-label">Saldo del viaje</span>
              <strong>
                {balance === 0 ? 'En paz' : formatEuros(Math.abs(balance))}
              </strong>
              {balance !== 0 && (
                <span className="xsmall muted">{balance > 0 ? `${partner.display_name} te pasa` : `Le pasas a ${partner.display_name}`}</span>
              )}
            </div>
          )}
        </div>

        {partner && s.totalCents > 0 && (
          <ul className="list">
            {payers.map((id) => (
              <li key={id} className="row-item">
                <Avatar members={data.members} userId={id} size="sm" />
                <span className="row-main"><span className="row-title">{id === me ? 'Pagaste tú' : `Pagó ${nameOf(data.members, id)}`}</span></span>
                <span className="row-end"><span className="row-amount">{formatEuros(s.paidBy.get(id) ?? 0)}</span></span>
              </li>
            ))}
          </ul>
        )}

        {partner && s.totalCents > 0 && (
          <p className="muted small">Estos gastos ya cuentan en el saldo general; aquí solo se ve la parte del viaje.</p>
        )}

        <div className="section">
          <SectionHeader title="Gastos" />
          {s.expenses.length === 0 ? (
            <Notice>Aún no hay gastos. Al añadir un gasto, elige este viaje en «Viaje o evento».</Notice>
          ) : (
            <ul className="list with-icons">
              {s.expenses.map((e) => (
                <ExpenseRow key={e.id} expense={e} data={data} me={me} showDate hideEvent onOpen={setOpenExpense} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Crear o editar un viaje: nombre y fechas (opcionales). */
function EventForm({ data, me, reload, event, onClose }: ViewProps & { event: TripEvent | null; onClose: () => void }) {
  const formId = useId();
  const [name, setName] = useState(event?.name ?? '');
  const [startsOn, setStartsOn] = useState(event?.starts_on ?? today());
  const [endsOn, setEndsOn] = useState(event?.ends_on ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Ponle un nombre, por ejemplo «Roma» o «Boda de Lucía»');
    if (startsOn && endsOn && endsOn < startsOn) return setError('La vuelta no puede ser antes de la ida');
    setBusy(true);
    setError(null);
    const fields = { name: name.trim(), starts_on: startsOn || null, ends_on: endsOn || null };
    const { error } = event
      ? await supabase.from('events').update(fields).eq('id', event.id)
      : await supabase.from('events').insert({ ...fields, household_id: data.household.id, created_by: me });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    toast(event ? 'Viaje actualizado' : 'Viaje creado');
    onClose();
  }

  return (
    <Sheet
      title={event ? 'Editar viaje o evento' : 'Nuevo viaje o evento'}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" form={formId} className="primary lg block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="stack" noValidate>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-name'}>Nombre</label>
          <input id={formId + '-name'} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Roma, Boda de Lucía, Mudanza" autoFocus={!event} />
        </div>
        <div className="row">
          <div className="field grow">
            <label className="field-label" htmlFor={formId + '-start'}>Desde</label>
            <input id={formId + '-start'} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="field grow">
            <label className="field-label" htmlFor={formId + '-end'}>Hasta <span className="faint">(opcional)</span></label>
            <input id={formId + '-end'} type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        <p className="field-hint">Mientras dure, los gastos nuevos se apuntan en este viaje solos (se puede cambiar en cada gasto). Siguen contando en el saldo y en el presupuesto.</p>
      </form>
    </Sheet>
  );
}
