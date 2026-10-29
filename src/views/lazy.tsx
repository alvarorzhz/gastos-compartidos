import { Component, Suspense, type ComponentProps, type ReactNode } from 'react';
import { isOfflineError } from '../lib/expenseOutbox';
import { reportError } from '../lib/errorLog';
import { lazyView, preloadWhenGood } from '../lib/lazyView';
import { Notice, Spinner } from './common';

/* Secciones que se descargan aparte (ver lib/lazyView.ts). Inicio va siempre en la carga principal. */
export const LazyExpenses = lazyView(() => import('./ExpensesView'));
export const LazyBalance = lazyView(() => import('./BalanceView'));
export const LazyShopping = lazyView(() => import('./ShoppingView'));
export const LazyBudget = lazyView(() => import('./BudgetView'));
export const LazyCharts = lazyView(() => import('./ChartsView'));
export const LazyPersonal = lazyView(() => import('./PersonalView'));
export const LazySettings = lazyView(() => import('./SettingsView'));
export const LazyExpenseForm = lazyView(() => import('./ExpenseForm'));

const ALL = [LazyExpenseForm, LazyExpenses, LazyBalance, LazyShopping, LazyBudget, LazyCharts, LazyPersonal, LazySettings];

/** Con buena cobertura, baja todas las secciones nada más abrir la app. */
export function preloadSections() {
  preloadWhenGood(ALL);
}

/** El formulario de gasto, que se abre encima de cualquier pantalla. */
export function ExpenseForm(props: ComponentProps<typeof LazyExpenseForm.Component>) {
  return (
    <LoadBoundary>
      <Suspense fallback={null}>
        <LazyExpenseForm.Component {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

/** Envuelve una sección: mientras se descarga enseña «Cargando…» y si no hay forma de bajarla, lo explica. */
export function Section({ children }: { children: ReactNode }) {
  return (
    <LoadBoundary>
      <Suspense fallback={<Spinner label="Cargando…" />}>{children}</Suspense>
    </LoadBoundary>
  );
}

class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (!isOfflineError(error) && navigator.onLine) reportError(error, 'cargar sección');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Notice
        kind="warn"
        icon="alert"
        action={<button className="sm tinted" onClick={() => location.reload()}>Reintentar</button>}
      >
        Esta parte de la app todavía no está guardada en el móvil y ahora no se puede descargar. Revisa la conexión y vuelve a intentarlo.
      </Notice>
    );
  }
}
