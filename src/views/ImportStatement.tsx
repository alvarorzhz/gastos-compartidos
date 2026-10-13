import { useMemo, useRef, useState } from 'react';
import { formatEuros } from '../lib/money';
import { categoryOptions } from '../lib/personal';
import { parseCsv, parseStatement, proposeImport, type Destination, type ImportRow } from '../lib/statement';
import { errorMessage, supabase } from '../lib/supabase';
import { readXlsx } from '../lib/xlsx';
import { Sheet, type ViewProps } from './common';

type Show = 'expenses' | 'income';

/**
 * Importar el extracto del banco (Excel o CSV). El archivo se lee en el propio dispositivo
 * y no se guarda: solo se apuntan los movimientos que elijas, como gasto común o personal.
 */
export default function ImportStatement({ data, me, reload, onClose }: ViewProps & { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [show, setShow] = useState<Show>('expenses');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const activeCategories = data.categories.filter((c) => !c.archived);
  const personalOptions = useMemo(
    () => ({ expense: categoryOptions(data.personal, 'expense'), income: categoryOptions(data.personal, 'income') }),
    [data.personal],
  );

  async function read(file: File) {
    setError(null);
    setDone(null);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.pdf')) throw new Error('El PDF no se puede leer bien. Descarga los movimientos en Excel (.xlsx) desde el banco.');
      if (name.endsWith('.xls')) throw new Error('Este Excel es del formato antiguo (.xls). Ábrelo y guárdalo como .xlsx, o descárgalo en CSV.');
      const table = name.endsWith('.csv') || name.endsWith('.txt') ? parseCsv(await file.text()) : await readXlsx(await file.arrayBuffer());
      const movements = parseStatement(table);
      if (movements.length === 0) throw new Error('No he encontrado movimientos en el archivo.');
      setRows(proposeImport(movements, { me, expenses: data.expenses, personal: data.personal, categories: data.categories }));
      setShow('expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el archivo.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  const update = (i: number, patch: Partial<ImportRow>) =>
    setRows((prev) => prev && prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const chosen = rows?.filter((r) => r.destination !== 'skip') ?? [];
  const nCommon = chosen.filter((r) => r.destination === 'common').length;
  const nPersonal = chosen.length - nCommon;

  async function save() {
    if (!rows) return;
    setBusy(true);
    setError(null);
    const common = chosen
      .filter((r) => r.destination === 'common')
      .map((r) => ({
        household_id: data.household.id,
        amount_cents: Math.abs(r.movement.amountCents),
        spent_on: r.movement.date,
        category_id: r.categoryId,
        paid_by: me,
        owed_cents: null,
        note: r.note.trim().slice(0, 200) || null,
        created_by: me,
      }));
    const personal = chosen
      .filter((r) => r.destination === 'personal')
      .map((r) => ({
        kind: r.movement.amountCents > 0 ? 'income' : 'expense',
        amount_cents: Math.abs(r.movement.amountCents),
        entry_on: r.movement.date,
        category: r.personalCategory.slice(0, 40),
        note: r.note.trim().slice(0, 200) || null,
      }));
    if (common.length) {
      const { error } = await supabase.from('expenses').insert(common);
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
    }
    if (personal.length) {
      const { error } = await supabase.from('personal_entries').insert(personal);
      if (error) {
        setBusy(false);
        await reload();
        return setError((common.length ? 'Los gastos comunes se han guardado, pero los personales no: ' : '') + errorMessage(error));
      }
    }
    await reload();
    setBusy(false);
    setRows(null);
    setDone(`Listo: ${common.length} ${common.length === 1 ? 'gasto común' : 'gastos comunes'} y ${personal.length} ${personal.length === 1 ? 'movimiento personal' : 'movimientos personales'} apuntados.`);
  }

  if (!rows) {
    return (
      <Sheet title="Importar extracto" onClose={onClose}>
        <div className="stack">
          {done && <p className="notice">{done}</p>}
          <p className="small">
            Descarga los movimientos de tu banco en <strong>Excel (.xlsx)</strong> o CSV y elígelo aquí. Después decides uno a uno
            qué se apunta como gasto común, qué va a Personal y qué no se apunta.
          </p>
          <p className="muted small">🔒 El archivo se lee en tu dispositivo y no se sube ni se guarda.</p>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,.txt,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
            }}
          />
          <button className="primary" onClick={() => input.current?.click()}>📄 Elegir archivo</button>
          {error && <p className="error small">{error}</p>}
        </div>
      </Sheet>
    );
  }

  const income = (r: ImportRow) => r.movement.amountCents > 0;
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => (show === 'income') === income(r));
  const dates = rows.map((r) => r.movement.date).sort();
  const duplicates = rows.filter((r) => r.duplicate).length;
  const nExpenses = rows.filter((r) => !income(r)).length;

  function setAll(destination: Destination) {
    const ids = new Set(visible.filter(({ r }) => !r.duplicate).map(({ i }) => i));
    setRows((prev) => prev && prev.map((r, k) => (ids.has(k) && (destination !== 'common' || !income(r)) ? { ...r, destination } : r)));
  }

  return (
    <Sheet title="Importar extracto" onClose={onClose}>
      <div className="stack">
        <p className="small">
          {rows.length} movimientos, del {shortDay(dates[0])} al {shortDay(dates[dates.length - 1])}.
          {duplicates > 0 && ` ${duplicates} ${duplicates === 1 ? 'parece ya apuntado' : 'parecen ya apuntados'} (marcados con ⚠️).`}{' '}
          Los gastos comunes se apuntan como pagados por ti, a medias; luego puedes cambiar el reparto en cada uno.
        </p>
        <fieldset className="segmented">
          <legend className="sr-only">Qué mostrar</legend>
          <label className={show === 'expenses' ? 'selected' : ''}>
            <input type="radio" name="show" checked={show === 'expenses'} onChange={() => setShow('expenses')} />
            Cargos ({nExpenses})
          </label>
          <label className={show === 'income' ? 'selected' : ''}>
            <input type="radio" name="show" checked={show === 'income'} onChange={() => setShow('income')} />
            Ingresos ({rows.length - nExpenses})
          </label>
        </fieldset>
        <div className="row wrap small">
          <span className="muted">Marcar todos:</span>
          {show === 'expenses' && <button className="link small" onClick={() => setAll('common')}>Comunes</button>}
          <button className="link small" onClick={() => setAll('personal')}>Personales</button>
          <button className="link small" onClick={() => setAll('skip')}>Ninguno</button>
        </div>

        <ul className="list import-list">
          {visible.map(({ r, i }) => (
            <li key={i} className={r.destination === 'skip' ? 'skipped' : ''}>
              <div className="row">
                <input
                  className="grow note-input"
                  value={r.note}
                  maxLength={200}
                  onChange={(e) => update(i, { note: e.target.value })}
                  aria-label="Nota"
                />
                <div className="amounts">
                  <strong className={income(r) ? 'positive' : ''}>
                    {income(r) ? '+' : '−'}{formatEuros(Math.abs(r.movement.amountCents))}
                  </strong>
                  <div className="muted small">{shortDay(r.movement.date)}</div>
                </div>
              </div>
              {r.duplicate && <div className="warn small">⚠️ Parece que ya está apuntado</div>}
              <div className="row">
                <fieldset className="segmented compact">
                  <legend className="sr-only">Dónde apuntarlo</legend>
                  {(['skip', 'common', 'personal'] as const)
                    .filter((d) => d !== 'common' || !income(r))
                    .map((d) => (
                      <label key={d} className={r.destination === d ? 'selected' : ''}>
                        <input type="radio" name={`dest-${i}`} checked={r.destination === d} onChange={() => update(i, { destination: d })} />
                        {d === 'skip' ? 'No' : d === 'common' ? 'Común' : 'Personal'}
                      </label>
                    ))}
                </fieldset>
                {r.destination === 'common' && (
                  <select className="grow" value={r.categoryId} onChange={(e) => update(i, { categoryId: e.target.value })} aria-label="Categoría">
                    {activeCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {r.destination === 'personal' && (
                  <select className="grow" value={r.personalCategory} onChange={(e) => update(i, { personalCategory: e.target.value })} aria-label="Categoría personal">
                    {[...new Set([...personalOptions[income(r) ? 'income' : 'expense'], r.personalCategory])].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="import-footer stack tight">
          {error && <p className="error small">{error}</p>}
          <p className="muted small center">
            {chosen.length === 0 ? 'Elige qué movimientos apuntar.' : `${nCommon} ${nCommon === 1 ? 'común' : 'comunes'} · ${nPersonal} ${nPersonal === 1 ? 'personal' : 'personales'}`}
          </p>
          <div className="row">
            <button className="secondary" onClick={() => setRows(null)} disabled={busy}>Otro archivo</button>
            <button className="primary grow" onClick={save} disabled={busy || chosen.length === 0}>
              {busy ? 'Guardando…' : `Apuntar ${chosen.length}`}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** "2026-10-06" → "6 oct" */
function shortDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
