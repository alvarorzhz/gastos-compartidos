export interface Household {
  id: string;
  name: string;
  currency: 'EUR';
  /** Reparto por defecto: la parte (%) de cada gasto nuevo que le toca a default_split_user. null = a medias. */
  default_split_user: string | null;
  default_split_percent: number | null;
}

export interface Member {
  household_id: string;
  user_id: string;
  display_name: string;
}

export interface Invitation {
  id: string;
  household_id: string;
  email: string;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  archived: boolean;
  /** Porcentaje del presupuesto a partir del cual avisar. null = sin aviso. */
  alert_percent: AlertPercent | null;
}

export type AlertPercent = 80 | 90 | 100;

export interface Expense {
  id: string;
  household_id: string;
  amount_cents: number;
  spent_on: string; // YYYY-MM-DD
  category_id: string;
  paid_by: string;
  /** Lo que debe a quien pagó la otra persona. null = 50/50. */
  owed_cents: number | null;
  note: string | null;
  /** Gasto fijo que lo apuntó, si lo hay. */
  recurring_id: string | null;
  /** Viaje o evento al que pertenece, si lo hay. */
  event_id?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Viaje o evento: agrupa gastos comunes para ver su total aparte. */
export interface TripEvent {
  id: string;
  household_id: string;
  name: string;
  starts_on: string | null; // YYYY-MM-DD
  ends_on: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
}

export type Frequency = 'weekly' | 'monthly' | 'yearly';

/** Gasto fijo: plantilla que apunta un gasto cada semana, mes o año. */
export interface RecurringExpense {
  id: string;
  household_id: string;
  amount_cents: number;
  category_id: string;
  paid_by: string;
  owed_cents: number | null;
  note: string | null;
  frequency: Frequency;
  start_on: string; // YYYY-MM-DD
  /** Cuántos gastos ha apuntado ya desde start_on. */
  generated_count: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Settlement {
  id: string;
  household_id: string;
  amount_cents: number;
  paid_on: string; // YYYY-MM-DD
  from_user: string;
  to_user: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Budget {
  household_id: string;
  category_id: string;
  month: string; // YYYY-MM-01
  amount_cents: number;
}

/** Gasto o ingreso personal: solo lo ve quien lo apunta y no cuenta en lo común. */
export interface PersonalEntry {
  id: string;
  user_id: string;
  kind: 'expense' | 'income';
  amount_cents: number;
  entry_on: string; // YYYY-MM-DD
  category: string;
  note: string | null;
  /** Fijo personal que lo apuntó, si lo hay. */
  recurring_id: string | null;
  created_at: string;
}

/** Hucha: objetivo de ahorro común. */
export interface SavingsGoal {
  id: string;
  household_id: string;
  name: string;
  target_cents: number;
  archived: boolean;
  created_at: string;
}

/** Aportación a una hucha (negativa si se saca dinero). */
export interface SavingsContribution {
  id: string;
  household_id: string;
  goal_id: string;
  user_id: string;
  amount_cents: number;
  contributed_on: string; // YYYY-MM-DD
  note: string | null;
  created_at: string;
}

/** Ingreso o gasto personal que se repite. Solo lo ve su dueño. */
export interface PersonalRecurring {
  id: string;
  user_id: string;
  kind: 'expense' | 'income';
  amount_cents: number;
  category: string;
  note: string | null;
  frequency: Frequency;
  start_on: string;
  generated_count: number;
  active: boolean;
  created_at: string;
}
