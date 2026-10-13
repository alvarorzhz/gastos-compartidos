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
import SettingsView from './views/SettingsView';
import { WhatsNewBanner } from './views/WhatsNew';

type Tab = 'gastos' | 'saldo' | 'presupuesto' | 'graficos' | 'ajustes';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'gastos', label: 'Gastos', icon: '🧾' },
  { id: 'saldo', label: 'Saldo', icon: '⚖️' },
  { id: 'presupuesto', label: 'Presupuesto', icon: '🎯' },
  { id: 'graficos', label: 'Gráficos', icon: '📊' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️' },
];

function readTab(): Tab {
  const t = location.hash.slice(1);
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'gastos';
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
  const [tab, setTab] = useState<Tab>(readTab);

  useEffect(() => {
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
  }, [tab]);

  useEffect(() => {
    const onHash = () => setTab(readTab());
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
  return (
    <div className="app">
      <header className="topbar">
        <span>{state.data.household.name}</span>
      </header>
      <main className="content">
        <WhatsNewBanner />
        {tab === 'gastos' && <ExpensesView {...props} />}
        {tab === 'saldo' && <BalanceView {...props} />}
        {tab === 'presupuesto' && <BudgetView {...props} />}
        {tab === 'graficos' && <ChartsView {...props} />}
        {tab === 'ajustes' && <SettingsView {...props} email={email} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)} aria-current={t.id === tab}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
