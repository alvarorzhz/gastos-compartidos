-- Presupuesto personal: un límite al mes por categoría de gasto personal.
-- Solo lo ve y lo cambia su dueño (ni siquiera la pareja). El límite vale para todos los
-- meses hasta que se cambie o se quite.

create table if not exists public.personal_budgets (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 40),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.personal_budgets enable row level security;

drop policy if exists personal_budgets_own on public.personal_budgets;
create policy personal_budgets_own on public.personal_budgets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tiempo real, por si se usa la app en dos dispositivos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_budgets'
  ) then
    alter publication supabase_realtime add table public.personal_budgets;
  end if;
end $$;
