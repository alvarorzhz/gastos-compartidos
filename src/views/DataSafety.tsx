import { useCallback, useEffect, useState } from 'react';
import { downloadFile } from '../lib/csv';
import type { AppError } from '../lib/errorLog';
import { describeChange, groupByDay, type ExpenseChange } from '../lib/history';
import { nameOf } from '../lib/people';
import { errorMessage, supabase } from '../lib/supabase';
import { confirmAction, Notice, toast, type ViewProps } from './common';
import { Icon } from './icons';

const PAGE = 15;

/** Ajustes → Historial de cambios: quién apuntó, cambió o borró cada gasto común, y recuperar lo borrado. */
export function ChangeHistory({ data, me, reload }: ViewProps) {
  const [changes, setChanges] = useState<ExpenseChange[] | null | undefined>(undefined);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from('expense_changes')
      .select('*')
      .eq('household_id', data.household.id)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    setChanges(error ? null : (rows as ExpenseChange[]));
  }, [data.household.id, limit]);

  useEffect(() => {
    void load();
  }, [load, data.expenses]);

  async function restore(change: ExpenseChange) {
    setBusy(change.id);
    const { error } = await supabase.rpc('restore_expense', { p_change_id: change.id });
    setBusy(null);
    if (error) return toast(errorMessage(error), 'error');
    toast('Gasto recuperado');
    await reload();
  }

  const alive = new Set(data.expenses.map((e) => e.id));
  const shown = changes?.slice(0, limit) ?? [];

  return (
    <section className="settings-group" aria-labelledby="set-history">
      <h2 id="set-history">Historial de cambios</h2>
      {changes === null && <Notice icon="clock">Se activará en cuanto se actualice el servidor.</Notice>}
      {changes && changes.length === 0 && <Notice icon="info">Aquí saldrá quién apunta, cambia o borra cada gasto.</Notice>}
      {groupByDay(shown).map((g) => (
        <div key={g.day} className="stack-sm history-day">
          <p className="muted small">{g.day}</p>
          <ul className="list with-icons">
            {g.items.map((c) => {
              const line = describeChange(c, data.members, data.categories, me);
              const icon = c.action === 'insert' ? 'plus' : c.action === 'update' ? 'edit' : 'trash';
              const time = new Date(c.changed_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              const canRestore = c.action === 'delete' && !alive.has(c.expense_id);
              return (
                <li key={c.id}>
                  <div className="row-item">
                    <span className={'icon-tile' + (c.action === 'delete' ? '' : ' accent')}><Icon name={icon} /></span>
                    <span className="row-main">
                      <span className="row-title">{line.title}</span>
                      <span className="row-meta">{[time, line.meta, ...line.details].filter(Boolean).join(' · ')}</span>
                    </span>
                    {canRestore && (
                      <button className="sm tinted" disabled={busy === c.id} onClick={() => void restore(c)}>
                        Recuperar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {changes && changes.length > limit && (
        <button className="link-btn small" onClick={() => setLimit(limit + PAGE * 2)}>Ver más</button>
      )}
    </section>
  );
}

interface Backup {
  id: number;
  household_id: string | null;
  user_id: string | null;
  taken_at: string;
}

/** Ajustes → Copias de seguridad: las que guarda el servidor cada lunes, para descargarlas. */
export function Backups() {
  const [backups, setBackups] = useState<Backup[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase
      .from('backups')
      .select('id, household_id, user_id, taken_at')
      .order('taken_at', { ascending: false })
      .then(({ data, error }) => {
        if (alive) setBackups(error ? null : (data as Backup[]));
      });
    return () => {
      alive = false;
    };
  }, []);

  async function download(b: Backup) {
    setBusy(b.id);
    const { data, error } = await supabase.from('backups').select('data').eq('id', b.id).single();
    setBusy(null);
    if (error) return toast(errorMessage(error), 'error');
    const day = b.taken_at.slice(0, 10);
    const name = b.household_id ? `copia-comun-${day}.json` : `copia-personal-${day}.json`;
    downloadFile(name, JSON.stringify({ taken_at: b.taken_at, ...(data as { data: object }).data }, null, 2), 'application/json');
  }

  return (
    <section className="settings-group" aria-labelledby="set-backups">
      <h2 id="set-backups">Copias de seguridad</h2>
      {backups === null && <Notice icon="clock">Se activarán en cuanto se actualice el servidor.</Notice>}
      {backups && backups.length === 0 && <Notice icon="clock">La primera copia se hará el lunes de madrugada.</Notice>}
      {backups && backups.length > 0 && (
        <ul className="list with-icons">
          {backups.map((b) => (
            <li key={b.id}>
              <button className="row-item" disabled={busy === b.id} onClick={() => void download(b)}>
                <span className="icon-tile accent"><Icon name={b.household_id ? 'users' : 'lock'} /></span>
                <span className="row-main">
                  <span className="row-title">
                    {new Date(b.taken_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  <span className="row-meta">{b.household_id ? 'Lo común, de los dos' : 'Lo personal, solo tú la ves'}</span>
                </span>
                <Icon name="download" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="note">Cada lunes el servidor guarda una copia de todo y se quedan las 8 últimas (dos meses). Si algún día se borra algo por error, se puede recuperar desde aquí.</p>
    </section>
  );
}

/** Ajustes → Errores de la app: lo que ha fallado en el móvil de alguno de los dos (últimos 90 días). */
export function AppErrors({ data, me }: ViewProps) {
  const [errors, setErrors] = useState<AppError[] | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from('app_errors')
      .select('*')
      .order('happened_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(30);
    setErrors(error ? null : (rows as AppError[]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function clearAll() {
    const ok = await confirmAction({ title: '¿Borrar la lista de errores?', message: 'Solo se borra esta lista; tus datos no se tocan.', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('app_errors').delete().gte('id', 0);
    if (error) return toast(errorMessage(error), 'error');
    toast('Lista de errores borrada');
    await load();
  }

  return (
    <section className="settings-group" aria-labelledby="set-errors">
      <h2 id="set-errors">Errores de la app</h2>
      {errors === null && <Notice icon="clock">Se activará en cuanto se actualice el servidor.</Notice>}
      {errors && errors.length === 0 && <Notice icon="check">Ningún error en los últimos 90 días. Todo va bien.</Notice>}
      {errors && errors.length > 0 && (
        <ul className="list with-icons">
          {errors.map((e) => {
            const when = new Date(e.happened_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            const meta = [when, nameOf(data.members, e.user_id, me), e.place, e.app_version && 'versión ' + e.app_version].filter(Boolean).join(' · ');
            return (
              <li key={e.id}>
                <button className="row-item" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <span className="icon-tile"><Icon name="alert" /></span>
                  <span className="row-main">
                    <span className="row-title error-message">{e.message}</span>
                    <span className="row-meta">{meta}</span>
                  </span>
                </button>
                {open === e.id && (
                  <pre className="error-detail">{[e.detail, e.device].filter(Boolean).join('\n\n') || 'Sin más detalle.'}</pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {errors && errors.length > 0 && (
        <button className="link-btn small" onClick={() => void clearAll()}>Borrar la lista</button>
      )}
      <p className="note">Si algo falla en el móvil de alguno de los dos, la app lo apunta aquí para poder arreglarlo. No se apuntan los fallos por falta de conexión.</p>
    </section>
  );
}
