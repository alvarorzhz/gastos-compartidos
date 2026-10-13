import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { isConfigured, supabase } from './lib/supabase';
import { useHousehold } from './lib/useHousehold';
import BalanceView from './views/BalanceView';
import BudgetView from './views/BudgetView';
import ChartsView from './views/ChartsView';
import ExpensesView from './views/ExpensesView';
import Login from './views/Login';
import Onboarding from './views/Onboarding';
import PersonalView from './views/PersonalView';
import SettingsView from './views/SettingsView';
import { WhatsNewBanner } from './views/WhatsNew';
import { AlertsOnEntry } from './views/AlertsDialog';
import { markCloseSeen, MonthCloseSheet, pendingClose } from './views/MonthClose';

type View = 'gastos' | 'saldo' | 'presupuesto' | 'graficos' | 'personal' | 'ajustes';

// Cada pestaña agrupa una o varias vistas; las que tienen varias muestran un selector arriba.
const TABS: { label: string; icon: string; views: { id: View; label: string }[] }[] = [
  { label: 'Comunes', icon: '🧾', views: [{ id: 'gastos', label: 'Gastos' }, { id: 'saldo', label: 'Saldo' }] },
  { label: 'Resumen', icon: '📊', views: [{ id: 'presupuesto', label: 'Presupuesto' }, { id: 'graficos', label: 'Gráficos' }] },
  { label: 'Personal', icon: '👤', views: [{ id: 'personal', label: 'Personal' }] },
  { label: 'Ajustes', icon: '⚙️', views: [{ id: 'ajustes', label: 'Ajustes' }] },
];

const ALL_VIEWS = TABS.flatMap((t) => t.views.map((v) => v.id));
const tabOf = (view: View) => TABS.find((t) => t.views.some((v) => v.id === view))!;

function readView(): View {
  const v = location.hash.slice(1);
  return ALL_VIEWS.includes(v as View) ? (v as View) : 'gastos';
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
      <main className="centered">
        <h1>Falta configuración</h1>
        <p>Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (mira el README).</p>
      </main>
    );
  }
  if (session === undefined) return <main className="centered muted">Cargando…</main>;
  if (!session) return <Login />;
  return <Home key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />;
}

function Home({ userId, email }: { userId: string; email: string }) {
  const { state, reload } = useHousehold(userId);
  const [view, setView] = useState<View>(readView);
  // Última vista abierta de cada pestaña, para volver a ella al tocar la pestaña.
  const [lastView, setLastView] = useState<Record<string, View>>({});
  const [closeDismissed, setCloseDismissed] = useState(false);

  useEffect(() => {
    if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    setLastView((prev) => ({ ...prev, [tabOf(view).label]: view }));
  }, [view]);

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (state.status === 'loading') return <main className="centered muted">Cargando…</main>;
  if (state.status === 'error') {
    return (
      <main className="centered">
        <p className="error">{state.message}</p>
        <button onClick={reload}>Reintentar</button>
      </main>
    );
  }
  if (state.status === 'no-household') {
    return <Onboarding email={email} invitation={state.invitation} onDone={reload} />;
  }

  const props = { data: state.data, me: userId, reload };
  const tab = tabOf(view);
  const closeMonth = closeDismissed ? null : pendingClose(props);
  return (
    <div className="app">
      <header className="topbar">
        <span>{state.data.household.name}</span>
      </header>
      <main className="content">
        <WhatsNewBanner />
        {tab.views.length > 1 && (
          <div className="subtabs" role="tablist">
            {tab.views.map((v) => (
              <button key={v.id} role="tab" aria-selected={v.id === view} className={v.id === view ? 'active' : ''} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        {view === 'gastos' && <ExpensesView {...props} />}
        {view === 'saldo' && <BalanceView {...props} />}
        {view === 'presupuesto' && <BudgetView {...props} />}
        {view === 'graficos' && <ChartsView {...props} />}
        {view === 'personal' && <PersonalView {...props} />}
        {view === 'ajustes' && <SettingsView {...props} email={email} />}
      </main>
      {closeMonth && (
        <MonthCloseSheet {...props} month={closeMonth} onClose={() => { markCloseSeen(closeMonth); setCloseDismissed(true); }} />
      )}
      <AlertsOnEntry data={state.data} waiting={closeMonth != null} />
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.label}
            className={t === tab ? 'active' : ''}
            onClick={() => setView(lastView[t.label] ?? t.views[0].id)}
            aria-current={t === tab}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
