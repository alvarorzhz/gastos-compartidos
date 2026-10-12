export interface Household {
  id: string;
  name: string;
  currency: 'EUR';
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
}

export interface Expense {
  id: string;
  household_id: string;
  amount_cents: number;
  spent_on: string; // YYYY-MM-DD
  category_id: string;
  paid_by: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
