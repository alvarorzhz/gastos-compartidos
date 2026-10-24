-- Copias de seguridad semanales, historial de cambios de los gastos, retoques
-- de seguridad y velocidad que pide el asesor de Supabase, y registro de las
-- migraciones ya aplicadas.
-- Ejecutar en Supabase después de 0013_pareja.sql.

-- ---------------------------------------------------------------------------
-- Historial: quién creó, cambió o borró cada gasto común, y cuándo.
-- Lo escribe un disparador; desde la app solo se lee (y se recupera un borrado).
-- ---------------------------------------------------------------------------

create table public.expense_changes (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  expense_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create index expense_changes_household_idx on public.expense_changes (household_id, changed_at desc);
create index expense_changes_expense_idx on public.expense_changes (expense_id);

alter table public.expense_changes enable row level security;

create policy expense_changes_select on public.expense_changes
  for select to authenticated using (public.is_member(household_id));

-- changed_by queda vacío cuando el cambio lo hace la app sola (fijos de cada
-- mañana, Apple Pay). No se apuntan los cambios que solo tocan updated_at o
-- created_by (este último se vacía al borrar una cuenta).
create or replace function public.log_expense_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into expense_changes (household_id, expense_id, action, changed_by, new_row)
    values (new.household_id, new.id, 'insert', auth.uid(), to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(new) - 'updated_at' - 'created_by' = to_jsonb(old) - 'updated_at' - 'created_by' then
      return new;
    end if;
    insert into expense_changes (household_id, expense_id, action, changed_by, old_row, new_row)
    values (new.household_id, new.id, 'update', auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  else
    -- Si se borra el espacio entero, no queda historial que guardar.
    if not exists (select 1 from households where id = old.household_id) then
      return old;
    end if;
    insert into expense_changes (household_id, expense_id, action, changed_by, old_row)
    values (old.household_id, old.id, 'delete', auth.uid(), to_jsonb(old));
    return old;
  end if;
end;
$$;

revoke all on function public.log_expense_change() from public, anon, authenticated;

create trigger expenses_log_change
  after insert or update or delete on public.expenses
  for each row execute function public.log_expense_change();

-- Vuelve a poner un gasto borrado tal como estaba. Si su viaje o su fijo ya no
-- existen, se recupera sin ellos.
create or replace function public.restore_expense(p_change_id bigint)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  ch expense_changes;
  e expenses;
begin
  select * into ch from expense_changes where id = p_change_id;
  if ch.id is null or ch.action <> 'delete' or not is_member(ch.household_id) then
    raise exception 'No se encuentra ese gasto borrado';
  end if;
  if exists (select 1 from expenses where id = ch.expense_id) then
    raise exception 'Ese gasto ya está recuperado';
  end if;
  e := jsonb_populate_record(null::expenses, ch.old_row);
  if e.event_id is not null and not exists (select 1 from events where id = e.event_id) then
    e.event_id := null;
  end if;
  if e.recurring_id is not null and not exists (select 1 from recurring_expenses where id = e.recurring_id) then
    e.recurring_id := null;
  end if;
  if e.created_by is not null and not exists (select 1 from auth.users where id = e.created_by) then
    e.created_by := null;
  end if;
  insert into expenses select (e).*;
  return e.id;
end;
$$;

revoke all on function public.restore_expense(bigint) from public, anon;
grant execute on function public.restore_expense(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Copias de seguridad: cada lunes se guarda una foto de todo. Lo común lo ven
-- los dos; lo personal, solo su dueño. Se guardan las 8 últimas (dos meses).
-- ---------------------------------------------------------------------------

create table public.backups (
  id bigint generated always as identity primary key,
  household_id uuid references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  taken_at timestamptz not null default now(),
  data jsonb not null,
  check ((household_id is null) <> (user_id is null))
);

create index backups_household_idx on public.backups (household_id, taken_at desc) where household_id is not null;
create index backups_user_idx on public.backups (user_id, taken_at desc) where user_id is not null;

alter table public.backups enable row level security;

create policy backups_select on public.backups
  for select to authenticated
  using ((household_id is not null and public.is_member(household_id)) or user_id = (select auth.uid()));

create or replace function public.run_backup()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  shared_tables text[] := array['members', 'categories', 'budgets', 'events', 'expenses', 'expense_reactions',
    'recurring_expenses', 'settlements', 'savings_goals', 'savings_contributions', 'shopping_items'];
  personal_tables text[] := array['personal_entries', 'personal_recurring', 'personal_budgets'];
  t text;
  rows jsonb;
  doc jsonb;
  h uuid;
  u uuid;
begin
  for h in select id from households loop
    doc := jsonb_build_object('households', (select jsonb_agg(x) from households x where x.id = h));
    foreach t in array shared_tables loop
      execute format('select coalesce(jsonb_agg(x), ''[]'') from public.%I x where x.household_id = $1', t) into rows using h;
      doc := doc || jsonb_build_object(t, rows);
    end loop;
    insert into backups (household_id, data) values (h, doc);
    delete from backups where household_id = h and id not in (
      select id from backups where household_id = h order by taken_at desc, id desc limit 8);
  end loop;

  for u in
    select user_id from personal_entries union select user_id from personal_recurring union select user_id from personal_budgets
  loop
    doc := '{}';
    foreach t in array personal_tables loop
      execute format('select coalesce(jsonb_agg(x), ''[]'') from public.%I x where x.user_id = $1', t) into rows using u;
      doc := doc || jsonb_build_object(t, rows);
    end loop;
    insert into backups (user_id, data) values (u, doc);
    delete from backups where user_id = u and id not in (
      select id from backups where user_id = u order by taken_at desc, id desc limit 8);
  end loop;

  -- El historial de cambios se guarda un año.
  delete from expense_changes where changed_at < now() - interval '1 year';
end;
$$;

revoke all on function public.run_backup() from public, anon, authenticated;

-- Primera copia ahora mismo, y luego cada lunes a las 3:00 UTC.
select public.run_backup();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gastos-copia-semanal', '0 3 * * 1', 'select public.run_backup()');
  else
    raise notice 'pg_cron no está disponible: la copia semanal no se programa (normal fuera de Supabase).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seguridad y velocidad (asesor de Supabase).
-- ---------------------------------------------------------------------------

-- auth.uid() dentro de (select ...) se calcula una vez por consulta y no una vez por fila.
alter policy members_update_self on public.members
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
alter policy invitations_select on public.invitations
  using (public.is_member(household_id) or email = lower((select auth.jwt()) ->> 'email'));
alter policy expenses_insert on public.expenses
  with check (public.is_member(household_id) and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id) and public.event_in_household(event_id, household_id)
    and created_by = (select auth.uid()));
alter policy settlements_insert on public.settlements
  with check (public.is_member(household_id) and public.is_household_user(household_id, from_user)
    and public.is_household_user(household_id, to_user) and created_by = (select auth.uid()));
alter policy recurring_insert on public.recurring_expenses
  with check (public.is_member(household_id) and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id) and created_by = (select auth.uid()));
alter policy personal_own on public.personal_entries
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy personal_recurring_own on public.personal_recurring
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy personal_budgets_own on public.personal_budgets
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy push_subscriptions_own on public.push_subscriptions
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy pending_payments_select on public.pending_payments
  using (user_id = (select auth.uid()));
alter policy pending_payments_delete on public.pending_payments
  using (user_id = (select auth.uid()));
alter policy expense_reactions_insert on public.expense_reactions
  with check (user_id = (select auth.uid()) and public.is_member(household_id) and public.expense_in_household(expense_id, household_id));
alter policy expense_reactions_update on public.expense_reactions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_member(household_id) and public.expense_in_household(expense_id, household_id));
alter policy expense_reactions_delete on public.expense_reactions
  using (user_id = (select auth.uid()));

-- La función del límite de 2 miembros solo la usa su disparador: nadie debe poder llamarla.
revoke all on function public.enforce_two_members() from public, anon, authenticated;

-- Funciones sin search_path fijo.
alter function public.touch_updated_at() set search_path = public;
alter function public.recurring_date(date, text, integer) set search_path = public;
alter function public.shopping_items_status() set search_path = public;
alter function public.parse_payment_amount(text) set search_path = public;

-- Índices que faltaban en columnas que se cruzan con otras tablas.
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_recurring_idx on public.expenses (recurring_id) where recurring_id is not null;
create index if not exists budgets_category_idx on public.budgets (category_id);
create index if not exists savings_goals_household_idx on public.savings_goals (household_id);
create index if not exists savings_contributions_household_idx on public.savings_contributions (household_id);
create index if not exists personal_recurring_user_idx on public.personal_recurring (user_id);
create index if not exists personal_entries_recurring_idx on public.personal_entries (recurring_id) where recurring_id is not null;

-- ---------------------------------------------------------------------------
-- Registro de migraciones: como se pegan a mano en el SQL Editor, Supabase no
-- sabía cuáles tiene. Se apuntan todas (también esta) donde las busca Supabase.
-- ---------------------------------------------------------------------------

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name) values
  ('0001', 'init'),
  ('0002', 'reparto_y_tiempo_real'),
  ('0003', 'fijos_y_avisos'),
  ('0004', 'personal'),
  ('0005', 'huchas_y_fijos_personales'),
  ('0006', 'reparto_por_defecto'),
  ('0007', 'lista_compra'),
  ('0008', 'viajes_y_avisos'),
  ('0009', 'compra_y_gastos'),
  ('0010', 'automatico'),
  ('0011', 'presupuesto_personal'),
  ('0012', 'pagos_apple_pay'),
  ('0013', 'pareja'),
  ('0014', 'copias_e_historial')
on conflict (version) do nothing;
