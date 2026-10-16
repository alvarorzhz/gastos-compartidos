-- Viajes y eventos, y avisos en el móvil.
-- Ejecutar en Supabase (SQL Editor) después de 0007_lista_compra.sql.

-- ---------------------------------------------------------------------------
-- Viajes y eventos: agrupan gastos comunes (un viaje, una boda, una mudanza…)
-- para ver su total y quién pagó qué. Los gastos siguen contando como siempre
-- en el saldo y en el presupuesto.
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  starts_on date,
  ends_on date,
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index events_household_idx on public.events (household_id);

-- Al borrar un viaje, sus gastos se quedan (solo dejan de estar agrupados).
alter table public.expenses
  add column event_id uuid references public.events (id) on delete set null;

create index expenses_event_idx on public.expenses (event_id) where event_id is not null;

create or replace function public.event_in_household(e uuid, h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select e is null or exists (select 1 from events where id = e and household_id = h);
$$;
revoke all on function public.event_in_household(uuid, uuid) from public, anon;
grant execute on function public.event_in_household(uuid, uuid) to authenticated;

alter table public.events enable row level security;

create policy events_all on public.events
  for all to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- Un gasto solo puede ir a un viaje de su mismo espacio.
drop policy expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id)
    and public.event_in_household(event_id, household_id)
    and created_by = auth.uid()
  );

drop policy expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id)
    and public.event_in_household(event_id, household_id)
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Avisos en el móvil (notificaciones push).
-- Cada móvil que activa los avisos guarda aquí su dirección de envío. Los avisos
-- los manda la función "avisar" (supabase/functions/avisar), que es la única que
-- lee estas tablas con la clave de servicio.
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  -- Qué avisos quiere este móvil.
  notify_expenses boolean not null default true,
  notify_budget boolean not null default true,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Guarda (o actualiza) los avisos de este móvil. Si el móvil era antes de otra
-- cuenta (se cerró sesión y entró otra persona), pasa a ser de quien llama.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_notify_expenses boolean, p_notify_budget boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth, notify_expenses, notify_budget)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, p_notify_expenses, p_notify_budget)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        notify_expenses = excluded.notify_expenses, notify_budget = excluded.notify_budget;
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, boolean, boolean) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, boolean, boolean) to authenticated;

-- Claves con las que la función firma los avisos. Las crea ella sola la primera vez.
-- Nadie más puede leerlas (RLS sin políticas).
create table public.push_keys (
  id integer primary key default 1 check (id = 1),
  vapid jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;

-- Gastos ya avisados, para no avisar dos veces del mismo.
create table public.push_sent (
  expense_id uuid primary key references public.expenses (id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.push_sent enable row level security;
