import { useEffect, useMemo, useRef, useState } from 'react';
import { itemEstimate } from '../lib/shoppingPrices';
import { cheaperElsewhere } from '../lib/storePrices';
import FinishTripSheet from './FinishTripSheet';
import { currentBought, formatQuantity, frequentAndRecent, guessCategory, matchesFilter, MAX_NAME, parseQuickAdd, pendingMatch, SHOP_CATEGORIES, sortPending, tripProgress, type KnownProduct, type ShopCategory } from '../lib/shopping';
import { emptyDraft, type ListItem, type NewItem, type Shopping } from '../lib/useShopping';
import { EmptyState, Notice, Progress, Segmented, toast, type ViewProps } from './common';
import { Icon } from './icons';
import { useHiddenIds } from './undo';
import { AddBar, ShopCategoryIcon } from './shopping/AddBar';
import { PendingRow, QuickProducts, SyncBadge } from './shopping/ListRows';
import { CompareSheet, ListCost, StoreSavings } from './shopping/Prices';
import { DuplicateSheet, EditSheet, HistorySheet } from './shopping/Sheets';
import { boughtWhen, byWhom, type Duplicate, type Mode } from './shopping/shared';

/*
 * Lista de la compra compartida. Arriba lo que falta por comprar (con el campo para añadir),
 * debajo lo ya comprado en esta compra (plegado) y después "Recientes y habituales" para
 * volver a apuntar con un toque. En escritorio, recientes y habituales van en una columna aparte.
 */

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

export default function ShoppingView({ data, me, reload, shopping }: ViewProps & { shopping: Shopping }) {
  const hiddenIds = useHiddenIds();
  const [mode, setMode] = useState<Mode>(() => (readPref(MODE_KEY, 'lista') === 'categorias' ? 'categorias' : 'lista'));
  const [boughtOpen, setBoughtOpen] = useState(() => readPref(BOUGHT_OPEN_KEY, '0') === '1');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<{ text: string; category: ShopCategory | '' }>({ text: '', category: '' });
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [comparing, setComparing] = useState(false);
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

  function finish() {
    setFinishing(true);
  }

  const sharedRowProps = {
    mode, onToggle: markBought, onEdit: setEditing, onRetry: (id: string) => void shopping.retry(id), onDiscard: shopping.discard,
    priceOf: (i: ListItem) => itemEstimate(i, items),
    cheaperOf: (i: ListItem) => cheaperElsewhere(i, items, data.expenses),
  };

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
              <div className="row">
                <p className="muted small grow">{progress.bought} de {progress.total} comprados</p>
                {progress.pending > 0 && <button className="sm tinted" onClick={finish}>Terminar compra</button>}
              </div>
            </div>
          )}
          <ListCost data={data} items={items} />
          <StoreSavings data={data} items={items} onCompare={() => setComparing(true)} />
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
            <Notice kind="success" icon="check" action={<button className="sm primary" onClick={finish}>Terminar</button>}>
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
                  {progress.bought > 0 && <button className="sm tinted" onClick={finish}>Terminar compra</button>}
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
      {finishing && (
        <FinishTripSheet data={data} me={me} reload={reload} shopping={shopping} items={items} onClose={() => setFinishing(false)} />
      )}
      {comparing && <CompareSheet data={data} items={items} onClose={() => setComparing(false)} />}
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
