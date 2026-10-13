-- Huchas comunes (objetivos de ahorro) y movimientos personales fijos.
-- Ejecutar en Supabase (SQL Editor) después de 0004_personal.sql.

-- ---------------------------------------------------------------------------
-- Huchas: objetivos de ahorro de los dos. Las aportaciones no cuentan en el
-- saldo entre vosotros: es dinero que apartáis, no un gasto.
-- ---------------------------------------------------------------------------

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target_cents integer not null check (target_cents > 0 and target_cents <= 100000000),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- amount_cents positivo = aportación; negativo = dinero que se saca de la hucha.
create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  user_id uuid not null,
  amount_cents integer not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000),
  contributed_on date not null default current_date,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index savings_contributions_goal_idx on public.savings_contributions (goal_id);

create or replace function public.goal_in_household(g uuid, h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from savings_goals where id = g and household_id = h);
$$;
revoke all on function public.goal_in_household(uuid, uuid) from public, anon;
grant execute on function public.goal_in_household(uuid, uuid) to authenticated;

alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;

create policy goals_all on public.savings_goals
  for all to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy contributions_all on public.savings_contributions
  for all to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, user_id)
    and public.goal_in_household(goal_id, household_id)
  );

-- ---------------------------------------------------------------------------
-- Movimientos personales fijos (nómina, suscripciones…). Igual que los gastos
-- fijos comunes, pero solo los ve y genera su dueño.
-- ---------------------------------------------------------------------------

create table public.personal_recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  category text not null check (char_length(category) between 1 and 40),
  note text check (note is null or char_length(note) <= 200),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  start_on date not null,
  generated_count integer not null default 0 check (generated_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.personal_entries
  add column recurring_id uuid references public.personal_recurring (id) on delete set null;

alter table public.personal_recurring enable row level security;

create policy personal_recurring_own on public.personal_recurring
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Apunta los movimientos personales fijos que ya tocan (solo los de quien llama).
create or replace function public.generate_personal_recurring(p_today date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r personal_recurring%rowtype;
  d date;
  done integer;
  total integer := 0;
  limit_day date := least(p_today, current_date + 1);
begin
  if auth.uid() is null then
    return 0;
  end if;
  for r in select * from personal_recurring where user_id = auth.uid() and active order by id for update loop
    done := 0;
    loop
      d := recurring_date(r.start_on, r.frequency, r.generated_count + done);
      exit when d > limit_day or done >= 500;
      insert into personal_entries (user_id, kind, amount_cents, entry_on, category, note, recurring_id)
      values (r.user_id, r.kind, r.amount_cents, d, r.category, r.note, r.id);
      done := done + 1;
    end loop;
    if done > 0 then
      update personal_recurring set generated_count = generated_count + done where id = r.id;
      total := total + done;
    end if;
  end loop;
  return total;
end;
$$;
revoke all on function public.generate_personal_recurring(date) from public, anon;
grant execute on function public.generate_personal_recurring(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['savings_goals', 'savings_contributions', 'personal_recurring'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
