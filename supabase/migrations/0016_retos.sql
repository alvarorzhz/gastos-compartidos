-- Retos de pareja: uno de los dos propone un reto («este mes, súper por debajo de 300 €»,
-- «una semana sin pedir comida a domicilio», «meter 100 € en la hucha»), el otro lo acepta y
-- la app mide el progreso con los gastos y las huchas. Lo ven y lo usan los dos.
-- Ejecutar en Supabase después de 0015_errores.sql.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- cap: gastar como mucho amount_cents en una categoría · without: no gastar en una categoría
  -- (o en lo que lleve keyword en el concepto) · save: meter amount_cents en una hucha.
  kind text not null check (kind in ('cap', 'without', 'save')),
  title text not null check (char_length(title) between 1 and 120),
  category_id uuid references public.categories (id) on delete cascade,
  keyword text check (char_length(keyword) between 1 and 40),
  goal_id uuid references public.savings_goals (id) on delete cascade,
  amount_cents integer check (amount_cents > 0),
  starts_on date not null,
  ends_on date not null,
  proposed_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  accepted_at timestamptz,
  -- Avisos de la mañana ya mandados (los marca el servidor).
  notified_mid boolean not null default false,
  notified_end boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 92),
  check (
    (kind = 'cap' and category_id is not null and amount_cents is not null) or
    (kind = 'without' and (category_id is not null or keyword is not null)) or
    (kind = 'save' and goal_id is not null and amount_cents is not null)
  )
);

create index challenges_household_idx on public.challenges (household_id, ends_on desc);

alter table public.challenges enable row level security;

-- Los dos los ven; cada uno propone en su nombre.
create policy challenges_select on public.challenges
  for select to authenticated
  using (public.is_member(household_id));

create policy challenges_insert on public.challenges
  for insert to authenticated
  with check (public.is_member(household_id) and proposed_by = (select auth.uid()) and accepted_at is null);

-- Aceptar (o retirar) un reto lo hacen los dos; los avisos del servidor no se tocan desde la app.
create policy challenges_update on public.challenges
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy challenges_delete on public.challenges
  for delete to authenticated
  using (public.is_member(household_id));

revoke all on public.challenges from anon;
revoke update on public.challenges from authenticated;
grant update (accepted_at) on public.challenges to authenticated;

-- La categoría y la hucha tienen que ser del mismo espacio.
create or replace function public.check_challenge_refs()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.category_id is not null and not exists (select 1 from categories where id = new.category_id and household_id = new.household_id) then
    raise exception 'La categoría no es de este espacio';
  end if;
  if new.goal_id is not null and not exists (select 1 from savings_goals where id = new.goal_id and household_id = new.household_id) then
    raise exception 'La hucha no es de este espacio';
  end if;
  return new;
end;
$$;

revoke all on function public.check_challenge_refs() from public, anon, authenticated;

create trigger challenges_refs
  before insert or update on public.challenges
  for each row execute function public.check_challenge_refs();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenges'
  ) then
    alter publication supabase_realtime add table public.challenges;
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('0016', 'retos')
on conflict (version) do nothing;
