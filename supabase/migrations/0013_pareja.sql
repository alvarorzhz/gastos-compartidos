-- Más de pareja: el color y el emoji de cada uno, y reacciones a los gastos.
-- Ejecutar en Supabase después de 0012_pagos_apple_pay.sql.

-- ---------------------------------------------------------------------------
-- Perfil: cada uno elige su color y, si quiere, un emoji en vez de su inicial.
-- Cada uno solo cambia su propia fila (política members_update_self de 0001).
-- ---------------------------------------------------------------------------

alter table public.members
  add column if not exists color text check (color in ('teal', 'violet', 'coral', 'blue', 'amber', 'pink', 'green', 'slate')),
  add column if not exists emoji text check (char_length(emoji) between 1 and 16);

-- ---------------------------------------------------------------------------
-- Reacciones: un emoji y/o un comentario corto de cada uno en cada gasto común.
-- ---------------------------------------------------------------------------

create table public.expense_reactions (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  emoji text check (char_length(emoji) between 1 and 16),
  comment text check (char_length(comment) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (expense_id, user_id),
  check (emoji is not null or comment is not null)
);

create index expense_reactions_household_idx on public.expense_reactions (household_id);

-- expense_in_household() ya existe (0009): el gasto debe ser de ese mismo espacio.
alter table public.expense_reactions enable row level security;

create policy expense_reactions_select on public.expense_reactions
  for select to authenticated using (public.is_member(household_id));
create policy expense_reactions_insert on public.expense_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(household_id) and public.expense_in_household(expense_id, household_id));
create policy expense_reactions_update on public.expense_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(household_id) and public.expense_in_household(expense_id, household_id));
create policy expense_reactions_delete on public.expense_reactions
  for delete to authenticated using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expense_reactions'
  ) then
    alter publication supabase_realtime add table public.expense_reactions;
  end if;
end $$;
