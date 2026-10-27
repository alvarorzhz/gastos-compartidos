import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { greeting } from './lib/couple';
import type { Member } from './lib/types';
import { isOfflineError, useQueuedVersion, withQueued } from './lib/expenseOutbox';
import { useHideSplash, useKeepSplash } from './lib/splash';
import { isConfigured, storedSession, supabase } from './lib/supabase';
import { useHousehold } from './lib/useHousehold';
import { ShoppingItemsContext, useShopping } from './lib/useShopping';
import BalanceView from './views/BalanceView';
import BudgetView from './views/BudgetView';
import ChartsView from './views/ChartsView';
import ExpenseForm from './views/ExpenseForm';
import ExpensesView from './views/ExpensesView';
import HomeView from './views/HomeView';
import { Icon, type IconName } from './views/icons';
import Login from './views/Login';
import Onboarding from './views/Onboarding';
import PersonalView from './views/PersonalView';
import PendingPayments from './views/PendingPayments';
import SettingsView from './views/SettingsView';
import ShoppingView from './views/ShoppingView';
import { WhatsNewBanner } from './views/WhatsNew';
import { AlertsOnEntry } from './views/AlertsDialog';
import { markCloseSeen, pendingClose } from './views/MonthClose';
import { MonthRecap } from './views/MonthStory';
import { flushPendingDeletes, useHiddenIds, withoutHidden } from './views/undo';
import { Avatar, DialogHost, Notice, Segmented, Toaster } from './views/common';

type View = 'inicio' | 'gastos' | 'saldo' | 'compra' | 'presupuesto' | 'graficos' | 'personal' | 'ajustes';

/*
 * Navegación: seis secciones abajo, tres a cada lado del botón central para añadir un gasto (Ajustes es la última).
 * Las secciones con dos vistas muestran un selector bajo el título. Cada vista tiene su dirección
 * (#gastos, #saldo, #presupuesto…), así que los enlaces de versiones anteriores siguen funcionando.
 */
const SECTIONS: { id: string; label: string; short?: string; icon: IconName; views: { id: View; label: string }[] }[] = [
  { id: 'inicio', label: 'Inicio', icon: 'home', views: [{ id: 'inicio', label: 'Inicio' }] },
  { id: 'gastos', label: 'Gastos', icon: 'receipt', views: [{ id: 'gastos', label: 'Movimientos' }, { id: 'saldo', label: 'Saldo' }] },
  { id: 'compra', label: 'Compra', icon: 'cart', views: [{ id: 'compra', label: 'Lista de la compra' }] },
  { id: 'presupuesto', label: 'Presupuesto', short: 'Plan', icon: 'pie', views: [{ id: 'presupuesto', label: 'Presupuesto' }, { id: 'graficos', label: 'Gráficos' }] },
  { id: 'personal', label: 'Personal', icon: 'user', views: [{ id: 'personal', label: 'Personal' }] },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings', views: [{ id: 'ajustes', label: 'Ajustes' }] },
];

const ALL_VIEWS: View[] = SECTIONS.flatMap((s) => s.views.map((v) => v.id));
const sectionOf = (view: View) => SECTIONS.find((s) => s.views.some((v) => v.id === view)) ?? SECTIONS[0];

function readView(): View {
  const v = location.hash.slice(1);
  return ALL_VIEWS.includes(v as View) ? (v as View) : 'inicio';
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useHideSplash();

  useEffect(() => {
    if (!isConfigured) return;
    // Sin conexión y con la sesión caducada, Supabase no puede renovarla pero tampoco la borra:
    // se entra igualmente con la guardada para ver la copia de los datos y apuntar gastos.
    supabase.auth.getSession().then(({ data, error }) => setSession(data.session ?? (error && isOfflineError(error) ? storedSession() : null)));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (s || event === 'SIGNED_OUT') setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="screen-center">
        <h1>Falta configuración</h1>
        <p className="muted">Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (mira el README).</p>
      </main>
    );
  }
  if (session === undefined) return <Loading />;
  if (!session) return <Login />;
  return <Home key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />;
}

/** Pantalla de carga: la misma que la de index.html (allí están sus estilos), para que no se note el cambio. */
function Loading() {
  useKeepSplash();
  return (
    <main className="splash" role="status" aria-label="Cargando Gastos compartidos">
      <div className="splash-logo" aria-hidden>
        <svg viewBox="0 0 120 120">
          <defs>
            <linearGradient id="splash-tile-app" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5a8d69" />
              <stop offset="1" stopColor="#335c40" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" rx="30" fill="url(#splash-tile-app)" />
          <g fill="none" stroke="#fff" strokeWidth="6.6" strokeLinecap="round">
            <circle className="splash-ring-a" cx="47.5" cy="60" r="22.5" />
            <circle className="splash-ring-b" cx="72.5" cy="60" r="22.5" />
          </g>
          <text className="splash-euro" x="60" y="67.6" fontFamily="Arial, Helvetica, sans-serif" fontSize="22" fontWeight="700" fill="#fff" textAnchor="middle">€</text>
        </svg>
      </div>
      <div className="splash-name">Gastos compartidos</div>
      <div className="splash-tagline">Vuestras cuentas, claras</div>
      <div className="splash-bar" aria-hidden />
      <div className="splash-slow">Está tardando más de lo normal. Revisa la conexión.</div>
    </main>
  );
}

function Home({ userId, email }: { userId: string; email: string }) {
  const { state, reload } = useHousehold(userId);
  // La lista de la compra se carga aquí para que no se pierda nada al cambiar de sección.
  const shopping = useShopping(state.status === 'ready' ? state.data.household.id : null);
  const hiddenIds = useHiddenIds();
  useQueuedVersion(); // vuelve a pintar al apuntar o subir gastos hechos sin conexión
  const [view, setView] = useState<View>(readView);
  // Vista abierta por última vez en cada sección, para volver a ella al tocar la sección.
  const [lastView, setLastView] = useState<Record<string, View>>({});
  const [adding, setAdding] = useState(false);
  const [closeDismissed, setCloseDismissed] = useState(false);

  useEffect(() => {
    if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    setLastView((prev) => ({ ...prev, [sectionOf(view).id]: view }));
    window.scrollTo({ top: 0 });
  }, [view]);

  // Al salir de la app, los borrados pendientes de "Deshacer" se hacen ya.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPendingDeletes();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushPendingDeletes);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushPendingDeletes);
    };
  }, []);

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') {
    return (
      <main className="screen-center">
        <span className="empty-icon"><Icon name="alert" size={26} /></span>
        <h1 className="empty-title">No se han podido cargar los datos</h1>
        <p className="muted small">Revisa la conexión y vuelve a intentarlo. Detalle: {state.message}</p>
        <button className="primary" onClick={reload}>Reintentar</button>
      </main>
    );
  }
  if (state.status === 'no-household') {
    return <Onboarding email={email} invitation={state.invitation} onDone={reload} />;
  }

  const data = withQueued(withoutHidden(state.data, hiddenIds), userId);
  const props = { data, me: userId, reload };
  const section = sectionOf(view);
  const current = section.views.find((v) => v.id === view)!;
  const closeMonth = closeDismissed ? null : pendingClose(props);

  return (
    <ShoppingItemsContext.Provider value={shopping.items}>
    <div className="app">
      <header className="appbar">
        <div className="appbar-inner">
          {view === 'inicio' && (
            <span className="avatar-pair appbar-pair">
              {state.data.members.map((m) => <Avatar key={m.user_id} members={state.data.members} userId={m.user_id} />)}
            </span>
          )}
          <div className={'appbar-title' + (view === 'inicio' ? ' appbar-hello' : '')}>
            {view === 'inicio' && <p className="appbar-kicker">{state.data.household.name}</p>}
            <h1>{view === 'inicio' ? [greeting(new Date()), firstName(state.data.members, userId)].filter(Boolean).join(', ') : section.views.length > 1 ? section.label : current.label}</h1>
          </div>
        </div>
        {section.views.length > 1 && (
          <div className="subnav">
            <Segmented
              legend={`Vista de ${section.label}`}
              hideLegend
              value={view}
              options={section.views.map((v) => ({ value: v.id, label: v.label }))}
              onChange={setView}
            />
          </div>
        )}
      </header>

      <main className="content">
        <PendingPayments {...props} showList={view === 'inicio'} />
        <div className="view" key={view}>
          {state.stale && (
            <Notice kind="warn" icon="alert" action={<button className="sm tinted" onClick={reload}>Reintentar</button>}>
              No se han podido actualizar los datos. Revisa la conexión; lo que ves puede no estar al día.
            </Notice>
          )}
          <WhatsNewBanner />
          {view === 'inicio' && <HomeView {...props} onAdd={() => setAdding(true)} quiet={closeMonth != null} />}
          {view === 'gastos' && <ExpensesView {...props} onAdd={() => setAdding(true)} />}
          {view === 'saldo' && <BalanceView {...props} />}
          {view === 'compra' && <ShoppingView {...props} shopping={shopping} />}
          {view === 'presupuesto' && <BudgetView {...props} />}
          {view === 'graficos' && <ChartsView {...props} onAdd={() => setAdding(true)} />}
          {view === 'personal' && <PersonalView {...props} />}
          {view === 'ajustes' && <SettingsView {...props} email={email} />}
        </div>
      </main>

      <nav className="tabbar" aria-label="Secciones">
        <div className="tabbar-inner">
          <div className="tabbar-brand">
            <img src="/icon.svg" alt="" />
            <span className="ellipsis">{state.data.household.name}</span>
          </div>
          {SECTIONS.slice(0, 3).map((s) => (
            <TabButton key={s.id} section={s} active={s === section} onClick={() => setView(lastView[s.id] ?? s.views[0].id)} />
          ))}
          <button className="tab-add" onClick={() => setAdding(true)} aria-label="Añadir gasto">
            <span className="add-circle"><Icon name="plus" /><span className="add-text">Añadir gasto</span></span>
          </button>
          {SECTIONS.slice(3).map((s) => (
            <TabButton key={s.id} section={s} active={s === section} onClick={() => setView(lastView[s.id] ?? s.views[0].id)} />
          ))}
        </div>
      </nav>

      {adding && <ExpenseForm {...props} expense={null} onClose={() => setAdding(false)} />}
      {closeMonth && (
        <MonthRecap {...props} month={closeMonth} onClose={() => { markCloseSeen(closeMonth); setCloseDismissed(true); }} />
      )}
      <AlertsOnEntry data={data} waiting={closeMonth != null} />
      <Toaster />
      <DialogHost />
    </div>
    </ShoppingItemsContext.Provider>
  );
}

/** Primer nombre de quien usa la app, para saludar ("Buenos días, Álvaro"). */
function firstName(members: Member[], userId: string): string {
  return members.find((m) => m.user_id === userId)?.display_name.trim().split(/\s+/)[0] ?? '';
}

function TabButton({ section, active, onClick }: { section: (typeof SECTIONS)[number]; active: boolean; onClick: () => void }) {
  return (
    <button className="tab" onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={section.label}>
      <Icon name={section.icon} />
      {/* En la barra del móvil va el nombre corto (si lo tiene) para que se lea bien; en la lateral, el completo. */}
      <span className="tab-label">{section.label}</span>
      {section.short && <span className="tab-label tab-label-short">{section.short}</span>}
    </button>
  );
}
