-- Deseos y caprichos de la pareja: cada uno apunta lo que le apetece (un sofá, un viaje, una
-- cena especial…) y los dos votan cuánto les apetece (0 paso, 1 me apetece, 2 mucho, 3 muchísimo).
-- Los más votados suben arriba; un deseo se puede convertir en hucha. Lo ven y lo usan los dos.
-- Ejecutar en Supabase (SQL Editor) después de 0017_copias_seguras.sql.

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- wish: algo grande para lo que ahorrar · treat: un capricho.
  kind text not null check (kind in ('wish', 'treat')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  price_cents integer check (price_cents > 0 and price_cents <= 100000000),
  note text check (char_length(note) <= 200),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz,
  goal_id uuid references public.savings_goals (id) on delete set null,
  created_at timestamptz not null default now()
);

create index wishes_household_idx on public.wishes (household_id, created_at);

create table public.wish_votes (
  wish_id uuid not null references public.wishes (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score smallint not null check (score between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (wish_id, user_id)
);

create index wish_votes_household_idx on public.wish_votes (household_id);

alter table public.wishes enable row level security;
alter table public.wish_votes enable row level security;

-- Los deseos los ven, cambian y borran los dos; cada uno los apunta en su nombre.
create policy wishes_select on public.wishes
  for select to authenticated
  using (public.is_member(household_id));

create policy wishes_insert on public.wishes
  for insert to authenticated
  with check (public.is_member(household_id) and created_by = (select auth.uid()));

create policy wishes_update on public.wishes
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy wishes_delete on public.wishes
  for delete to authenticated
  using (public.is_member(household_id));

revoke all on public.wishes from anon;
revoke update on public.wishes from authenticated;
grant update (kind, name, price_cents, note, done_at, goal_id) on public.wishes to authenticated;

-- Los votos los ven los dos, pero cada uno solo pone, cambia o quita el suyo.
create policy wish_votes_select on public.wish_votes
  for select to authenticated
  using (public.is_member(household_id));

create policy wish_votes_insert on public.wish_votes
  for insert to authenticated
  with check (public.is_member(household_id) and user_id = (select auth.uid()));

create policy wish_votes_update on public.wish_votes
  for update to authenticated
  using (public.is_member(household_id) and user_id = (select auth.uid()))
  with check (public.is_member(household_id) and user_id = (select auth.uid()));

create policy wish_votes_delete on public.wish_votes
  for delete to authenticated
  using (public.is_member(household_id) and user_id = (select auth.uid()));

revoke all on public.wish_votes from anon;
revoke update on public.wish_votes from authenticated;
grant update (score, updated_at) on public.wish_votes to authenticated;

-- La hucha tiene que ser del mismo espacio que el deseo, y el voto, del espacio de su deseo.
create or replace function public.check_wish_refs()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.goal_id is not null and not exists (select 1 from savings_goals where id = new.goal_id and household_id = new.household_id) then
    raise exception 'La hucha no es de este espacio';
  end if;
  return new;
end;
$$;

create or replace function public.check_wish_vote_refs()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from wishes where id = new.wish_id and household_id = new.household_id) then
    raise exception 'El deseo no es de este espacio';
  end if;
  return new;
end;
$$;

revoke all on function public.check_wish_refs() from public, anon, authenticated;
revoke all on function public.check_wish_vote_refs() from public, anon, authenticated;

create trigger wishes_refs
  before insert or update on public.wishes
  for each row execute function public.check_wish_refs();

create trigger wish_votes_refs
  before insert or update on public.wish_votes
  for each row execute function public.check_wish_vote_refs();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wishes') then
    alter publication supabase_realtime add table public.wishes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wish_votes') then
    alter publication supabase_realtime add table public.wish_votes;
  end if;
end $$;

-- Las copias de cada noche también guardan los deseos y sus votos.
create or replace function public.run_backup()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  shared_tables text[] := array['members', 'categories', 'budgets', 'events', 'expenses', 'expense_reactions',
    'recurring_expenses', 'settlements', 'savings_goals', 'savings_contributions', 'shopping_items',
    'challenges', 'expense_changes', 'wishes', 'wish_votes'];
  personal_tables text[] := array['personal_entries', 'personal_recurring', 'personal_budgets', 'pending_payments'];
  t text;
  rows jsonb;
  doc jsonb;
  h uuid;
  u uuid;
begin
  -- Copias de espacios o cuentas que ya no existen: se apuntan y, a los 30 días, se borran.
  update backups b set orphaned_at = now()
  where b.orphaned_at is null and (
    (b.household_id is not null and not exists (select 1 from households x where x.id = b.household_id)) or
    (b.user_id is not null and not exists (select 1 from auth.users x where x.id = b.user_id)));
  delete from backups where orphaned_at < now() - interval '30 days';

  for h in select id from households loop
    doc := jsonb_build_object('households', (select jsonb_agg(x) from households x where x.id = h));
    foreach t in array shared_tables loop
      execute format('select coalesce(jsonb_agg(x), ''[]'') from public.%I x where x.household_id = $1', t) into rows using h;
      doc := doc || jsonb_build_object(t, rows);
    end loop;
    insert into backups (household_id, data) values (h, doc);
    perform trim_backups(h, null);
  end loop;

  for u in
    select user_id from personal_entries union select user_id from personal_recurring
    union select user_id from personal_budgets union select user_id from pending_payments
  loop
    doc := '{}';
    foreach t in array personal_tables loop
      execute format('select coalesce(jsonb_agg(x), ''[]'') from public.%I x where x.user_id = $1', t) into rows using u;
      doc := doc || jsonb_build_object(t, rows);
    end loop;
    insert into backups (user_id, data) values (u, doc);
    perform trim_backups(null, u);
  end loop;

  -- El historial de cambios se guarda un año.
  delete from expense_changes where changed_at < now() - interval '1 year';
end;
$$;

revoke all on function public.run_backup() from public, anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('0018', 'deseos')
on conflict (version) do nothing;
