import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { isConfigured, supabase } from './lib/supabase';
import { useHousehold } from './lib/useHousehold';
import { useShopping } from './lib/useShopping';
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
import SettingsView from './views/SettingsView';
import ShoppingView from './views/ShoppingView';
import { WhatsNewBanner } from './views/WhatsNew';
import { AlertsOnEntry } from './views/AlertsDialog';
import { markCloseSeen, MonthCloseSheet, pendingClose } from './views/MonthClose';
import { flushPendingDeletes, useHiddenIds, withoutHidden } from './views/undo';
import { DialogHost, Notice, Segmented, Spinner, Toaster } from './views/common';

type View = 'inicio' | 'gastos' | 'saldo' | 'compra' | 'presupuesto' | 'graficos' | 'personal' | 'ajustes';

/*
 * Navegación: seis secciones abajo, tres a cada lado del botón central para añadir un gasto (Ajustes es la última).
 * Las secciones con dos vistas muestran un selector bajo el título. Cada vista tiene su dirección
 * (#gastos, #saldo, #presupuesto…), así que los enlaces de versiones anteriores siguen funcionando.
 */
const SECTIONS: { id: string; label: string; icon: IconName; views: { id: View; label: string }[] }[] = [
  { id: 'inicio', label: 'Inicio', icon: 'home', views: [{ id: 'inicio', label: 'Inicio' }] },
  { id: 'gastos', label: 'Gastos', icon: 'receipt', views: [{ id: 'gastos', label: 'Movimientos' }, { id: 'saldo', label: 'Saldo' }] },
  { id: 'compra', label: 'Compra', icon: 'cart', views: [{ id: 'compra', label: 'Lista de la compra' }] },
  { id: 'presupuesto', label: 'Presupuesto', icon: 'pie', views: [{ id: 'presupuesto', label: 'Presupuesto' }, { id: 'graficos', label: 'Gráficos' }] },
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

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
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

function Loading() {
  return (
    <main className="screen-center">
      <Spinner label="Cargando…" />
    </main>
  );
}

function Home({ userId, email }: { userId: string; email: string }) {
  const { state, reload } = useHousehold(userId);
  // La lista de la compra se carga aquí para que no se pierda nada al cambiar de sección.
  const shopping = useShopping(state.status === 'ready' ? state.data.household.id : null);
  const hiddenIds = useHiddenIds();
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

  const data = withoutHidden(state.data, hiddenIds);
  const props = { data, me: userId, reload };
  const section = sectionOf(view);
  const current = section.views.find((v) => v.id === view)!;
  const closeMonth = closeDismissed ? null : pendingClose(props);

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-inner">
          <div className="appbar-title">
            {view === 'inicio' && <p className="appbar-kicker">{state.data.household.name}</p>}
            <h1>{section.views.length > 1 ? section.label : current.label}</h1>
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
        <div className="view" key={view}>
          {state.stale && (
            <Notice kind="warn" icon="alert" action={<button className="sm tinted" onClick={reload}>Reintentar</button>}>
              No se han podido actualizar los datos. Revisa la conexión; lo que ves puede no estar al día.
            </Notice>
          )}
          <WhatsNewBanner />
          {view === 'inicio' && <HomeView {...props} onAdd={() => setAdding(true)} />}
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
        <MonthCloseSheet {...props} month={closeMonth} onClose={() => { markCloseSeen(closeMonth); setCloseDismissed(true); }} />
      )}
      <AlertsOnEntry data={data} waiting={closeMonth != null} />
      <Toaster />
      <DialogHost />
    </div>
  );
}

function TabButton({ section, active, onClick }: { section: (typeof SECTIONS)[number]; active: boolean; onClick: () => void }) {
  return (
    <button className="tab" onClick={onClick} aria-current={active ? 'page' : undefined}>
      <Icon name={section.icon} />
      <span className="tab-label">{section.label}</span>
    </button>
  );
}
