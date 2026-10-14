import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent, type RefObject } from 'react';
import { formatShortDay, toIsoDate, today } from '../lib/dates';
import { centsToInput, parseEuros } from '../lib/money';
import { nameOf } from '../lib/people';
import {
  boughtHistory, currentBought, formatQuantity, frequentAndRecent, guessCategory, matchesFilter, MAX_NAME, parseQuantity,
  parseQuickAdd, pendingMatch, SHOP_CATEGORIES, SHOP_UNITS, shopCategory, sortPending, STARTER_PRODUCTS, suggestNames,
  tripProgress, type KnownProduct, type ShopCategory, type ShopUnit,
} from '../lib/shopping';
import { emptyDraft, type ListItem, type NewItem, type Shopping } from '../lib/useShopping';
import { confirmAction, EmptyState, Notice, Progress, SectionHeader, Segmented, Sheet, Spinner, toast, type ViewProps } from './common';
import { Icon } from './icons';
import { deleteWithUndo, useHiddenIds } from './undo';

/*
 * Lista de la compra compartida. Arriba lo que falta por comprar (con el campo para añadir),
 * debajo lo ya comprado en esta compra (plegado) y después "Recientes y habituales" para
 * volver a apuntar con un toque. En escritorio, recientes y habituales van en una columna aparte.
 */

type Mode = 'lista' | 'categorias';
const MODE_KEY = 'gastos.compra.vista';
const BOUGHT_OPEN_KEY = 'gastos.compra.compradosAbiertos';
/** Lo que tarda un producto marcado en irse de pendientes (se ve la marca antes de que se vaya). */
const LEAVE_MS = 650;

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la preferencia dura hasta cerrar la app.
  }
}

type Duplicate = { existing: ListItem; input: NewItem; fromDraft: boolean };

export default function ShoppingView({ data, me, shopping }: ViewProps & { shopping: Shopping }) {
  const hiddenIds = useHiddenIds();
  const [mode, setMode] = useState<Mode>(() => (readPref(MODE_KEY, 'lista') === 'categorias' ? 'categorias' : 'lista'));
  const [boughtOpen, setBoughtOpen] = useState(() => readPref(BOUGHT_OPEN_KEY, '0') === '1');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<{ text: string; category: ShopCategory | '' }>({ text: '', category: '' });
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // hiddenIds es el mismo Set aunque cambie (lo que se está quitando con Deshacer): se filtra en cada render.
  const items = hiddenIds.size ? shopping.items.filter((i) => !hiddenIds.has(i.id)) : shopping.items;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const progress = tripProgress(items);
  const filtering = filter.text.trim() !== '' || filter.category !== '';
  const passes = (name: string, category: ShopCategory) => matchesFilter(name, category, filter);

  // Pendientes, más los que se acaban de marcar (se quedan un momento con la marca puesta).
  const pending = sortPending(items.map((i) => (leaving.has(i.id) ? { ...i, status: 'pending' as const } : i)))
    .map((i) => byId.get(i.id)!)
    .filter((i) => passes(i.name, i.category));
  const bought = currentBought(items).filter((i) => !leaving.has(i.id) && passes(i.name, i.category));
  const { frequent, recent } = useMemo(() => frequentAndRecent(items), [items]);

  useEffect(() => savePref(MODE_KEY, mode), [mode]);
  useEffect(() => savePref(BOUGHT_OPEN_KEY, boughtOpen ? '1' : '0'), [boughtOpen]);

  if (shopping.load.status === 'loading') {
    return (
      <>
        <div className="skeleton" style={{ height: 180 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </>
    );
  }
  if (shopping.load.status === 'error') {
    return (
      <div className="card">
        <EmptyState
          icon="alert"
          title="No se ha podido cargar la lista"
          text={`Revisa la conexión y vuelve a intentarlo. Detalle: ${shopping.load.message}`}
          action={<button className="primary" onClick={() => void shopping.refresh()}>Reintentar</button>}
        />
      </div>
    );
  }

  /* ───── Acciones ───── */

  function addNow(input: NewItem) {
    void shopping.add(input, me).then((r) => {
      if (!r.ok) toast(`«${input.name}» no se ha guardado. Puedes reintentarlo desde la lista.`, 'error');
    });
  }

  /** Apunta un producto; si ya está pendiente, pregunta qué hacer en vez de juntarlos sin avisar. */
  function requestAdd(input: NewItem, fromDraft: boolean): boolean {
    const existing = pendingMatch(items, input.name);
    if (existing) {
      setDuplicate({ existing, input, fromDraft });
      return false;
    }
    addNow(input);
    return true;
  }

  function addKnown(p: KnownProduct) {
    requestAdd({ name: p.last.name, quantity: p.last.quantity, unit: p.last.unit, category: p.last.category }, false);
  }

  function markBought(item: ListItem) {
    if (leaving.has(item.id) || item.unsaved) return;
    setLeaving((s) => new Set(s).add(item.id));
    setTimeout(() => setLeaving((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    }), LEAVE_MS);
    void shopping.setBought(item, true, me).then((r) => {
      if (!r.ok) toast(r.reason === 'conflict' ? r.message : `No se ha podido marcar «${item.name}»: ${r.message}`, r.reason === 'conflict' ? 'info' : 'error');
    });
    toast(`«${item.name}» comprado`, 'success', { ms: 5000, action: { label: 'Deshacer', onClick: () => unmark(item) } });
  }

  function unmark(item: ListItem) {
    void shopping.setBought(item, false, me).then((r) => {
      if (r.ok) toast(`«${item.name}» vuelve a pendientes`, 'info');
      else toast(r.reason === 'conflict' ? r.message : `No se ha podido deshacer: ${r.message}`, r.reason === 'conflict' ? 'info' : 'error');
    });
  }

  async function finish() {
    const ok = await confirmAction({
      title: '¿Terminar esta compra?',
      message: `Los ${progress.bought} productos comprados pasan al historial: no se borra nada y seguirán saliendo en «Recientes y habituales».`
        + (progress.pending > 0 ? `\nLos ${progress.pending} que faltan se quedan en la lista para la próxima vez.` : '\nLa lista quedará vacía para la próxima compra.'),
      confirmLabel: 'Terminar compra',
    });
    if (!ok) return;
    const r = await shopping.finishTrip();
    if (r.ok) toast('Compra terminada. ¡Lista para la próxima!');
    else toast(`No se ha podido terminar la compra: ${r.message}`, 'error');
  }

  const sharedRowProps = { mode, onToggle: markBought, onEdit: setEditing, onRetry: (id: string) => void shopping.retry(id), onDiscard: shopping.discard };

  return (
    <div className="shop-layout">
      <div className="shop-main">
        <section className="card shop-hero" aria-labelledby="shop-title">
          <div className="shop-hero-top">
            <div className="grow">
              <h2 id="shop-title" className="stat-label">Por comprar</h2>
              <p className="shop-count" aria-live="polite">
                {progress.pending === 0 ? 'Nada pendiente' : progress.pending === 1 ? 'Queda 1 producto' : `Quedan ${progress.pending} productos`}
              </p>
            </div>
            <SyncBadge shopping={shopping} />
          </div>
          {progress.total > 0 && (
            <div className="stack-sm">
              <Progress value={progress.bought} max={progress.total} label="Progreso de la compra" tone="saving" />
              <p className="muted small">{progress.bought} de {progress.total} comprados</p>
            </div>
          )}
          <AddBar shopping={shopping} items={items} inputRef={inputRef} onRequestAdd={requestAdd} />
        </section>

        <div className="shop-toolbar">
          <Segmented
            legend="Cómo ver la lista"
            hideLegend
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'lista', label: <><Icon name="list" size={16} /> Lista</> },
              { value: 'categorias', label: <><Icon name="grid" size={16} /> Por pasillos</> },
            ]}
          />
          <button
            className={'icon-btn shop-search-btn' + (searchOpen ? ' active' : '')}
            aria-label={searchOpen ? 'Cerrar búsqueda' : 'Buscar productos'}
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen) setFilter({ text: '', category: '' });
              setSearchOpen(!searchOpen);
            }}
          >
            <Icon name={searchOpen ? 'close' : 'search'} />
          </button>
        </div>

        {searchOpen && (
          <div className="filters">
            <label className="search-field">
              <Icon name="search" size={18} />
              <span className="sr-only">Buscar productos</span>
              <input
                autoFocus
                type="search"
                placeholder="Buscar en la lista y en recientes"
                value={filter.text}
                onChange={(e) => setFilter({ ...filter, text: e.target.value })}
              />
            </label>
            <div className="filter-row">
              <select
                className={'select-pill' + (filter.category ? ' active' : '')}
                aria-label="Filtrar por categoría"
                value={filter.category}
                onChange={(e) => setFilter({ ...filter, category: e.target.value as ShopCategory | '' })}
              >
                <option value="">Todas las categorías</option>
                {SHOP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
        )}

        <section className="section" aria-label="Pendientes">
          {pending.length > 0 ? (
            mode === 'lista' ? (
              <ul className="list shop-list">
                {pending.map((i) => <PendingRow key={i.id} item={i} checked={leaving.has(i.id)} {...sharedRowProps} />)}
              </ul>
            ) : (
              SHOP_CATEGORIES.map((c) => {
                const group = pending.filter((i) => i.category === c.id);
                if (group.length === 0) return null;
                return (
                  <div key={c.id} className="shop-group">
                    <div className="day-head"><span className="shop-group-title"><ShopCategoryIcon category={c.id} /> {c.label}</span><span>{group.length}</span></div>
                    <ul className="list shop-list">
                      {group.map((i) => <PendingRow key={i.id} item={i} checked={leaving.has(i.id)} {...sharedRowProps} />)}
                    </ul>
                  </div>
                );
              })
            )
          ) : filtering ? (
            <div className="card">
              <EmptyState
                icon="search"
                title="No hay pendientes con esa búsqueda"
                action={filter.text.trim() && (
                  <button className="tinted" onClick={() => {
                    const p = parseQuickAdd(filter.text);
                    if (requestAdd({ name: p.name.slice(0, MAX_NAME), quantity: p.quantity ?? 1, unit: p.unit, category: filter.category || guessCategory(p.name, items) }, false)) {
                      setFilter({ text: '', category: '' });
                      setSearchOpen(false);
                    }
                  }}>
                    <Icon name="plus" size={18} /> Añadir «{parseQuickAdd(filter.text).name.slice(0, MAX_NAME)}»
                  </button>
                )}
              />
            </div>
          ) : progress.bought > 0 ? (
            <Notice kind="success" icon="check" action={<button className="sm primary" onClick={() => void finish()}>Terminar</button>}>
              <strong>¡Compra completada!</strong> Lo tenéis todo. Cuando queráis, terminad la compra para empezar la siguiente lista.
            </Notice>
          ) : (
            <div className="card">
              <EmptyState
                icon="cart"
                title="La lista está vacía"
                text="Escribe arriba lo que necesitáis o toca un producto de «Recientes y habituales». Tu pareja lo verá al momento."
              />
            </div>
          )}
        </section>

        {(progress.bought > 0 || bought.length > 0) && (
          <section className="section" aria-labelledby="shop-bought">
            <button className="disclosure shop-bought-toggle" aria-expanded={boughtOpen} onClick={() => setBoughtOpen(!boughtOpen)}>
              <span id="shop-bought" className="strong">Comprados <span className="muted">· {bought.length}</span></span>
              <Icon name="chevronDown" />
            </button>
            {boughtOpen && (
              <>
                {bought.length > 0 && (
                  <ul className="list shop-list">
                    {bought.map((i) => (
                      <li key={i.id} className="shop-item done">
                        <button className="shop-toggle" onClick={() => unmark(i)} aria-label={`Devolver ${i.name} a pendientes`}>
                          <span className="shop-check checked" aria-hidden><Icon name="check" size={18} /></span>
                          <span className="row-main">
                            <span className="shop-name">{i.name}</span>
                            <span className="row-meta">
                              {[formatQuantity(i.quantity, i.unit), i.bought_at && boughtWhen(i.bought_at), i.bought_by && byWhom(data, me, i.bought_by)].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </button>
                        <span className="shop-undo-hint"><Icon name="undo" size={16} /></span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row">
                  <p className="muted small grow">Toca uno para devolverlo a pendientes.</p>
                  {progress.bought > 0 && <button className="sm tinted" onClick={() => void finish()}>Terminar compra</button>}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <div className="shop-side">
        <QuickProducts
          frequent={frequent.filter((p) => passes(p.name, p.last.category))}
          recent={recent.filter((p) => passes(p.name, p.last.category))}
          hasHistory={frequent.length + recent.length > 0}
          filtering={filtering}
          onList={(name) => pendingMatch(items, name) != null}
          onAdd={addKnown}
          onStarter={(name) => requestAdd({ name, quantity: 1, unit: null, category: guessCategory(name, items) }, false)}
          onHistory={() => setHistoryOpen(true)}
        />
      </div>

      {editing && (
        <EditSheet
          item={editing}
          live={byId.get(editing.id)}
          shopping={shopping}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {duplicate && (
        <DuplicateSheet
          duplicate={duplicate}
          shopping={shopping}
          onAddAnyway={() => {
            addNow(duplicate.input);
            if (duplicate.fromDraft) clearDraft();
            setDuplicate(null);
          }}
          onEdit={() => {
            if (duplicate.fromDraft) clearDraft();
            setEditing(duplicate.existing);
            setDuplicate(null);
          }}
          onDone={(clear) => {
            if (clear && duplicate.fromDraft) clearDraft();
            setDuplicate(null);
          }}
        />
      )}
      {historyOpen && (
        <HistorySheet
          items={items}
          data={data}
          me={me}
          onClose={() => setHistoryOpen(false)}
          onReAdd={(i) => requestAdd({ name: i.name, quantity: i.quantity, unit: i.unit, category: i.category }, false)}
          onUndo={(i) => unmark(i)}
          isOnList={(name) => pendingMatch(items, name) != null}
        />
      )}
    </div>
  );

  function clearDraft() {
    shopping.setDraft((d) => emptyDraft(d.details));
    inputRef.current?.focus();
  }
}

function byWhom(data: ViewProps['data'], me: string, userId: string): string {
  return userId === me ? 'por ti' : `por ${nameOf(data.members, userId)}`;
}

function boughtWhen(iso: string): string {
  const d = new Date(iso);
  const day = toIsoDate(d);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return day === today() ? `hoy a las ${time}` : formatShortDay(day);
}

/* ───────────── Indicador de conexión ───────────── */

function SyncBadge({ shopping }: { shopping: Shopping }) {
  if (shopping.sync === 'saving') return <span className="sync-badge"><Spinner /> Guardando…</span>;
  if (shopping.sync === 'offline') {
    return (
      <button
        className="sync-badge offline"
        onClick={() => {
          void shopping.refresh();
          for (const i of shopping.items) if (i.unsaved === 'failed') void shopping.retry(i.id);
        }}
      >
        <Icon name="alert" size={16} /> Sin conexión · Reintentar
      </button>
    );
  }
  return <span className="sync-badge live" title="Los cambios de los dos se ven al momento"><span className="live-dot" aria-hidden /> Al día</span>;
}

/* ───────────── Añadir productos ───────────── */

function AddBar({ shopping, items, inputRef, onRequestAdd }: {
  shopping: Shopping;
  items: ListItem[];
  inputRef: RefObject<HTMLInputElement | null>;
  onRequestAdd: (input: NewItem, fromDraft: boolean) => boolean;
}) {
  const { draft, setDraft } = shopping;
  const id = useId();
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const parsed = parseQuickAdd(draft.text);
  const guessed = guessCategory(parsed.name, items);
  const category = draft.category ?? guessed;
  const suggestions = suggestNames(items, draft.text.trim().length >= 2 ? parsed.name : '', 4);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), 2200);
    return () => clearTimeout(t);
  }, [added]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!parsed.name) {
      inputRef.current?.focus();
      return;
    }
    if (parsed.name.length > MAX_NAME) {
      setError(`El nombre puede tener como mucho ${MAX_NAME} letras.`);
      return;
    }
    const quantity = parsed.quantity ?? parseQuantity(draft.quantity);
    if (quantity == null) {
      setError('La cantidad tiene que ser un número mayor que 0, como 1, 2 o 0,5.');
      return;
    }
    setError('');
    const input: NewItem = { name: parsed.name, quantity, unit: parsed.unit ?? draft.unit, category, important: draft.important };
    if (onRequestAdd(input, true)) {
      setAdded(input.name);
      setDraft((d) => emptyDraft(d.details));
    }
    inputRef.current?.focus();
  }

  function pick(p: KnownProduct) {
    if (onRequestAdd({ name: p.last.name, quantity: p.last.quantity, unit: p.last.unit, category: p.last.category }, true)) {
      setAdded(p.last.name);
      setDraft((d) => emptyDraft(d.details));
    }
    inputRef.current?.focus();
  }

  const qty = parseQuantity(draft.quantity) ?? 1;
  const keepFocus = (e: PointerEvent) => e.preventDefault();

  return (
    <form className="shop-add" onSubmit={submit} noValidate>
      <div className="shop-add-row">
        <label className="sr-only" htmlFor={id}>Producto</label>
        <input
          id={id}
          ref={inputRef}
          className="shop-add-input"
          placeholder="Añadir producto…"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          maxLength={MAX_NAME + 12}
          value={draft.text}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setError('');
            setDraft((d) => ({ ...d, text: e.target.value }));
          }}
        />
        <button
          type="button"
          className={'icon-btn shop-details-btn' + (draft.details ? ' active' : '')}
          aria-label="Cantidad, unidad y categoría"
          aria-expanded={draft.details}
          onPointerDown={keepFocus}
          onClick={() => setDraft((d) => ({ ...d, details: !d.details }))}
        >
          <Icon name="sliders" />
        </button>
        <button type="submit" className="primary shop-add-btn" onPointerDown={keepFocus} disabled={!draft.text.trim()}>
          <Icon name="plus" size={18} /> <span>Añadir</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="chips" aria-label="Productos que ya habéis comprado">
          {suggestions.map((p) => (
            <button key={p.key} type="button" className="chip" onPointerDown={keepFocus} onClick={() => pick(p)}>
              <Icon name="clock" size={14} /> {p.name}
            </button>
          ))}
        </div>
      )}

      {draft.details && (
        <div className="shop-details">
          {parsed.quantity != null && <p className="field-hint">Has escrito la cantidad en el texto: se usará esa.</p>}
          <div className="shop-details-line">
            <span className="field-label">Cantidad</span>
            <div className="stepper">
              <button type="button" className="icon-btn" aria-label="Menos" onPointerDown={keepFocus} disabled={qty <= 1}
                onClick={() => setDraft((d) => ({ ...d, quantity: String(Math.max(1, Math.ceil(qty) - 1)) }))}>
                <Icon name="minus" size={18} />
              </button>
              <input
                aria-label="Cantidad"
                inputMode="decimal"
                value={draft.quantity}
                onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
              />
              <button type="button" className="icon-btn" aria-label="Más" onPointerDown={keepFocus}
                onClick={() => setDraft((d) => ({ ...d, quantity: String(Math.floor(qty) + 1) }))}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          </div>
          <UnitChips value={draft.unit} onChange={(unit) => setDraft((d) => ({ ...d, unit }))} keepFocus={keepFocus} />
          <CategoryChips value={category} auto={draft.category == null && parsed.name !== ''} onChange={(c) => setDraft((d) => ({ ...d, category: c }))} keepFocus={keepFocus} />
          <label className="check-line">
            <input type="checkbox" checked={draft.important} onChange={(e) => setDraft((d) => ({ ...d, important: e.target.checked }))} />
            <Icon name="star" size={18} /> Importante (sale el primero)
          </label>
        </div>
      )}

      {parsed.name && !error && (
        <p className="shop-preview">
          Se añadirá{' '}
          <strong>{formatQuantity(parsed.quantity ?? parseQuantity(draft.quantity) ?? 1, parsed.unit ?? draft.unit) || '1'}</strong>
          {' · '}<ShopCategoryIcon category={category} /> {shopCategory(category).label}
          {!draft.details && <span className="faint"> · puedes escribir «2 kg patatas» o «leche x6»</span>}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="shop-added" aria-live="polite">
        {added && <><Icon name="check" size={16} /> «{added}» añadido</>}
      </p>
    </form>
  );
}

function UnitChips({ value, onChange, keepFocus }: { value: ShopUnit | null; onChange: (u: ShopUnit | null) => void; keepFocus?: (e: PointerEvent) => void }) {
  return (
    <div className="shop-details-line">
      <span className="field-label">Unidad</span>
      <div className="filter-row" role="group" aria-label="Unidad">
        <button type="button" className={'chip' + (value == null ? ' selected' : '')} aria-pressed={value == null} onPointerDown={keepFocus} onClick={() => onChange(null)}>Sin unidad</button>
        {SHOP_UNITS.map((u) => (
          <button key={u.id} type="button" className={'chip' + (value === u.id ? ' selected' : '')} aria-pressed={value === u.id} onPointerDown={keepFocus} onClick={() => onChange(u.id)}>
            {u.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryChips({ value, auto, onChange, keepFocus }: { value: ShopCategory; auto?: boolean; onChange: (c: ShopCategory) => void; keepFocus?: (e: PointerEvent) => void }) {
  return (
    <div className="shop-details-line">
      <span className="field-label">Categoría{auto && <span className="faint"> · elegida por la app</span>}</span>
      <div className="filter-row" role="group" aria-label="Categoría">
        {SHOP_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={'chip shop-cat-chip' + (value === c.id ? ' selected' : '')} aria-pressed={value === c.id} onPointerDown={keepFocus} onClick={() => onChange(c.id)}>
            <Icon name={c.icon} size={16} /> {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Filas de la lista ───────────── */

export function ShopCategoryIcon({ category, size = 'sm' }: { category: ShopCategory; size?: 'sm' | 'md' }) {
  const c = shopCategory(category);
  return (
    <span className={`cat-icon cat-icon-${size} tone-${c.tone} shop-cat-icon`} aria-hidden>
      <Icon name={c.icon} size={size === 'sm' ? 16 : 20} />
    </span>
  );
}

function PendingRow({ item, checked, mode, onToggle, onEdit, onRetry, onDiscard }: {
  item: ListItem;
  checked: boolean;
  mode: Mode;
  onToggle: (i: ListItem) => void;
  onEdit: (i: ListItem) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const qty = formatQuantity(item.quantity, item.unit);
  const cat = shopCategory(item.category);
  return (
    <li className={'shop-item' + (checked ? ' leaving' : '') + (item.unsaved === 'failed' ? ' failed' : '')}>
      <button
        className="shop-toggle"
        onClick={() => onToggle(item)}
        disabled={checked || item.unsaved != null}
        aria-label={`Marcar ${item.name} como comprado`}
      >
        <span className={'shop-check' + (checked ? ' checked' : '')} aria-hidden><Icon name="check" size={18} /></span>
        <span className="row-main">
          <span className="shop-name">
            {item.important && <Icon name="star" size={15} className="shop-star" label="Importante" />}
            {item.name}
          </span>
          {item.unsaved === 'failed' ? (
            <span className="row-meta negative">No se ha guardado</span>
          ) : mode === 'lista' ? (
            <span className="row-meta shop-meta"><ShopCategoryIcon category={item.category} /> {cat.label}</span>
          ) : null}
        </span>
      </button>
      {item.unsaved === 'failed' ? (
        <span className="row shop-failed-actions">
          <button className="sm tinted" onClick={() => onRetry(item.id)}>Reintentar</button>
          <button className="icon-btn" aria-label={`Quitar ${item.name}`} onClick={() => onDiscard(item.id)}><Icon name="close" size={18} /></button>
        </span>
      ) : (
        <>
          {qty && <span className="shop-qty">{qty}</span>}
          <button className="icon-btn shop-edit" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`} disabled={checked || item.unsaved != null}>
            <Icon name="edit" size={18} />
          </button>
        </>
      )}
    </li>
  );
}

/* ───────────── Recientes y habituales ───────────── */

function QuickProducts({ frequent, recent, hasHistory, filtering, onList, onAdd, onStarter, onHistory }: {
  frequent: KnownProduct[];
  recent: KnownProduct[];
  hasHistory: boolean;
  filtering: boolean;
  onList: (name: string) => boolean;
  onAdd: (p: KnownProduct) => void;
  onStarter: (name: string) => void;
  onHistory: () => void;
}) {
  return (
    <section className="section" aria-labelledby="shop-quick">
      <SectionHeader
        id="shop-quick"
        title="Recientes y habituales"
        action={hasHistory ? <button className="link-btn small" onClick={onHistory}><Icon name="clock" size={16} /> Historial</button> : undefined}
      />
      {!hasHistory ? (
        <div className="card">
          <EmptyState
            icon="clock"
            title="Aún no hay historial"
            text="Lo que compréis aparecerá aquí para volver a apuntarlo con un toque. Para empezar, toca lo que necesitéis:"
            action={
              <div className="chips shop-chips center-chips">
                {STARTER_PRODUCTS.map((name) => {
                  const on = onList(name);
                  return (
                    <button key={name} className={'chip shop-chip' + (on ? ' on-list' : '')} onClick={() => onStarter(name)} aria-label={on ? `${name}, ya en la lista` : `Añadir ${name}`}>
                      <Icon name={on ? 'check' : 'plus'} size={14} /> {name}
                    </button>
                  );
                })}
              </div>
            }
          />
        </div>
      ) : frequent.length + recent.length === 0 && filtering ? (
        <p className="muted small" style={{ padding: '0 var(--s1)' }}>Nada en recientes con esa búsqueda.</p>
      ) : (
        <div className="card shop-quick">
          {frequent.length > 0 && (
            <div className="stack-sm">
              <h3 className="stat-label">Habituales</h3>
              <div className="chips shop-chips">
                {frequent.map((p) => {
                  const on = onList(p.name);
                  return (
                    <button key={p.key} className={'chip shop-chip' + (on ? ' on-list' : '')} onClick={() => onAdd(p)} aria-label={on ? `${p.name}, ya en la lista` : `Añadir ${p.name}`}>
                      <Icon name={on ? 'check' : 'plus'} size={14} /> {p.name}
                      <span className="chip-count" aria-hidden>{p.count}×</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="stack-sm">
              <h3 className="stat-label">Recientes</h3>
              <ul className="shop-recent">
                {recent.map((p) => {
                  const on = onList(p.name);
                  const qty = formatQuantity(p.last.quantity, p.last.unit);
                  return (
                    <li key={p.key}>
                      <ShopCategoryIcon category={p.last.category} />
                      <span className="row-main">
                        <span className="row-title">{p.name}</span>
                        <span className="row-meta">{[qty, `comprado ${toIsoDate(new Date(p.lastBoughtAt)) === today() ? 'hoy' : formatShortDay(toIsoDate(new Date(p.lastBoughtAt)))}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <button className={'icon-btn shop-readd' + (on ? ' on-list' : '')} onClick={() => onAdd(p)} aria-label={on ? `${p.name}, ya en la lista` : `Añadir ${p.name}`}>
                        <Icon name={on ? 'check' : 'plus'} size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="faint xsmall">Los habituales son lo que más compráis; un toque lo vuelve a apuntar con la misma cantidad.</p>
        </div>
      )}
    </section>
  );
}

/* ───────────── Ya está en la lista ───────────── */

function DuplicateSheet({ duplicate, shopping, onAddAnyway, onEdit, onDone }: {
  duplicate: Duplicate;
  shopping: Shopping;
  onAddAnyway: () => void;
  onEdit: () => void;
  onDone: (clearDraft: boolean) => void;
}) {
  const { existing, input } = duplicate;
  const [busy, setBusy] = useState(false);
  // Se pueden sumar si la unidad es la misma (o no se ha dicho ninguna).
  const sameUnit = input.unit == null || input.unit === existing.unit;
  const total = Math.min(9999, Number(existing.quantity) + input.quantity);
  const now = formatQuantity(existing.quantity, existing.unit) || '1';

  async function increase() {
    setBusy(true);
    const r = await shopping.edit(existing, { quantity: total });
    setBusy(false);
    if (r.ok) {
      toast(`«${existing.name}»: ahora ${formatQuantity(total, existing.unit) || total}`);
      onDone(true);
    } else {
      toast(r.message, r.reason === 'conflict' ? 'info' : 'error');
      if (r.reason === 'conflict') onDone(false);
    }
  }

  return (
    <Sheet
      title={`«${existing.name}» ya está en la lista`}
      subtitle={`Pendiente: ${now} · ${shopCategory(existing.category).label}`}
      onClose={() => onDone(false)}
      footer={<button className="secondary block" onClick={() => onDone(false)} disabled={busy}>Cancelar</button>}
    >
      <div className="stack-sm">
        {sameUnit && (
          <button className="primary lg block" onClick={() => void increase()} disabled={busy}>
            <Icon name="plus" size={18} /> {busy ? 'Guardando…' : `Sumar y dejar ${formatQuantity(total, existing.unit) || total}`}
          </button>
        )}
        <button className="tinted lg block" onClick={onEdit} disabled={busy}>
          <Icon name="edit" size={18} /> Editar el que ya está
        </button>
        <button className="secondary lg block" onClick={onAddAnyway} disabled={busy}>
          Añadirlo aparte (otra entrada)
        </button>
      </div>
    </Sheet>
  );
}

/* ───────────── Editar un producto ───────────── */

function EditSheet({ item: opened, live, shopping, onClose }: {
  /** El producto tal y como estaba al abrirlo (para no pisar cambios de la pareja). */
  item: ListItem;
  /** El producto como está ahora (llega en tiempo real). */
  live: ListItem | undefined;
  shopping: Shopping;
  onClose: () => void;
}) {
  const formId = useId();
  const [item, setItem] = useState(opened);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity).replace('.', ','));
  const [unit, setUnit] = useState<ShopUnit | null>(item.unit);
  const [category, setCategory] = useState<ShopCategory>(item.category);
  const [important, setImportant] = useState(item.important);
  const [price, setPrice] = useState(item.estimated_cents != null ? centsToInput(item.estimated_cents) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qty = parseQuantity(quantity);

  // Si mientras se edita la otra persona lo marca como comprado o lo quita, se avisa y se cierra.
  const gone = !live || live.status !== 'pending';
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (gone) {
      toast(`«${item.name}» ya no está pendiente: lo acaban de marcar como comprado o quitar.`, 'info');
      closeRef.current();
    }
  }, [gone, item.name]);
  const changedByPartner = live != null && !gone && live.updated_at !== item.updated_at;

  function applyTheirs() {
    if (!live) return;
    setItem(live);
    setName(live.name);
    setQuantity(String(live.quantity).replace('.', ','));
    setUnit(live.unit);
    setCategory(live.category);
    setImportant(live.important);
    setPrice(live.estimated_cents != null ? centsToInput(live.estimated_cents) : '');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Escribe el nombre del producto.');
    if (qty == null) return setError('La cantidad tiene que ser un número mayor que 0, como 1, 2 o 0,5.');
    const cents = price.trim() ? parseEuros(price) : null;
    if (price.trim() && (cents == null || cents <= 0)) return setError('El precio aproximado no es válido.');
    setError('');
    setBusy(true);
    const r = await shopping.edit(item, { name: n, quantity: qty, unit, category, important, estimated_cents: cents });
    setBusy(false);
    if (r.ok) {
      toast('Cambios guardados');
      onClose();
    } else if (r.reason === 'conflict') {
      toast(r.message, 'info');
      onClose();
    } else {
      setError(r.message);
    }
  }

  function remove() {
    if (item.unsaved) shopping.discard(item.id);
    else deleteWithUndo({ table: 'shopping_items', id: item.id, done: `«${item.name}» quitado de la lista`, reload: shopping.refresh });
    onClose();
  }

  return (
    <Sheet
      title="Editar producto"
      onClose={onClose}
      footer={
        <div className="row">
          <button type="button" className="danger" onClick={remove} disabled={busy}><Icon name="trash" size={18} /> Quitar</button>
          <button type="submit" form={formId} className="primary lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }
    >
      <form id={formId} className="stack" onSubmit={save} noValidate>
        {changedByPartner && (
          <Notice kind="warn" action={<button type="button" className="sm tinted" onClick={applyTheirs}>Ver su versión</button>}>
            Tu pareja acaba de cambiar este producto. Mira su versión antes de guardar para no deshacer su cambio.
          </Notice>
        )}
        <div className="field">
          <label className="field-label" htmlFor={formId + '-name'}>Producto</label>
          <input id={formId + '-name'} value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="shop-details-line">
          <span className="field-label">Cantidad</span>
          <div className="stepper">
            <button type="button" className="icon-btn" aria-label="Menos" disabled={(qty ?? 1) <= 1} onClick={() => setQuantity(String(Math.max(1, Math.ceil(qty ?? 1) - 1)))}>
              <Icon name="minus" size={18} />
            </button>
            <input aria-label="Cantidad" inputMode="decimal" value={quantity} aria-invalid={qty == null || undefined} onChange={(e) => setQuantity(e.target.value)} />
            <button type="button" className="icon-btn" aria-label="Más" onClick={() => setQuantity(String(Math.floor(qty ?? 0) + 1))}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
        <UnitChips value={unit} onChange={setUnit} />
        <fieldset className="category-picker">
          <legend className="field-label">Categoría</legend>
          <div className="category-grid">
            {SHOP_CATEGORIES.map((c) => (
              <label key={c.id} className={category === c.id ? 'selected' : ''}>
                <input type="radio" name={formId + '-cat'} checked={category === c.id} onChange={() => setCategory(c.id)} />
                <ShopCategoryIcon category={c.id} />
                <span className="cat-name">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check-line">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          <Icon name="star" size={18} /> Importante (sale el primero)
        </label>
        <div className="field">
          <label className="field-label" htmlFor={formId + '-price'}>Precio aproximado (opcional)</label>
          <input id={formId + '-price'} inputMode="decimal" placeholder="Por ejemplo 2,50" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" />
          <span className="field-hint">Solo como referencia: no se apunta ningún gasto ni cuenta en el presupuesto.</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Sheet>
  );
}

/* ───────────── Historial ───────────── */

const HISTORY_PAGE = 60;

function HistorySheet({ items, data, me, onClose, onReAdd, onUndo, isOnList }: Pick<ViewProps, 'data' | 'me'> & {
  items: ListItem[];
  onClose: () => void;
  onReAdd: (i: ListItem) => void;
  onUndo: (i: ListItem) => void;
  isOnList: (name: string) => boolean;
}) {
  const [shown, setShown] = useState(HISTORY_PAGE);
  const history = boughtHistory(items);
  const page = history.slice(0, shown);
  const days = [...new Set(page.map((i) => toIsoDate(new Date(i.bought_at!))))];

  return (
    <Sheet title="Historial de la compra" subtitle={`${history.length} productos comprados en total`} onClose={onClose}>
      {history.length === 0 ? (
        <EmptyState icon="clock" title="Todavía no habéis comprado nada" />
      ) : (
        <div className="stack">
          {days.map((day) => (
            <section key={day} className="day-group" aria-label={formatShortDay(day)}>
              <div className="day-head"><span>{day === today() ? 'Hoy' : formatShortDay(day)}</span></div>
              <ul className="list shop-list">
                {page.filter((i) => toIsoDate(new Date(i.bought_at!)) === day).map((i) => {
                  const on = isOnList(i.name);
                  return (
                    <li key={i.id} className="shop-history-row">
                      <ShopCategoryIcon category={i.category} />
                      <span className="row-main">
                        <span className="row-title">{i.name}</span>
                        <span className="row-meta">
                          {[formatQuantity(i.quantity, i.unit), i.bought_by && byWhom(data, me, i.bought_by), !i.cleared_at && 'en la compra actual'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {!i.cleared_at && (
                        <button className="sm secondary" onClick={() => onUndo(i)} aria-label={`Devolver ${i.name} a pendientes`}>
                          <Icon name="undo" size={16} /> Deshacer
                        </button>
                      )}
                      {i.cleared_at && (
                        <button className={'sm ' + (on ? 'secondary' : 'tinted')} onClick={() => onReAdd(i)} aria-label={on ? `${i.name}, ya en la lista` : `Volver a añadir ${i.name}`}>
                          <Icon name={on ? 'check' : 'plus'} size={16} /> {on ? 'En la lista' : 'Añadir'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {history.length > shown && (
            <button className="secondary block" onClick={() => setShown(shown + HISTORY_PAGE)}>Ver más</button>
          )}
        </div>
      )}
    </Sheet>
  );
}
