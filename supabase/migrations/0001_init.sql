-- Gastos compartidos: esquema inicial.
-- Un "hogar" es el espacio compartido. Tiene como máximo dos miembros y cada
-- cuenta pertenece a un solo hogar. Todo el acceso pasa por RLS: solo los
-- miembros de un hogar ven y editan sus datos.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  currency text not null default 'EUR' check (currency = 'EUR'),
  created_at timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- La invitación guarda el email solo hasta que se acepta; después se borra.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

-- paid_by no tiene FK a auth.users a propósito: si una cuenta se borra, el
-- historial del hogar sigue cuadrando para la otra persona.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  spent_on date not null default current_date,
  category_id uuid not null references public.categories (id),
  paid_by uuid not null,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_household_date_idx on public.expenses (household_id, spent_on desc);

-- Reembolso: una persona devuelve dinero a la otra. Solo se anota, no se mueve dinero.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  paid_on date not null default current_date,
  from_user uuid not null,
  to_user uuid not null,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index settlements_household_date_idx on public.settlements (household_id, paid_on desc);

-- Presupuesto mensual por categoría. month es siempre el día 1 del mes.
create table public.budgets (
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  primary key (household_id, category_id, month)
);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares para RLS
-- ---------------------------------------------------------------------------

create or replace function public.is_member(h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

create or replace function public.is_household_user(h uuid, u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from members where household_id = h and user_id = u);
$$;

create or replace function public.category_in_household(c uuid, h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from categories where id = c and household_id = h);
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.enforce_two_members()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform 1 from households where id = new.household_id for update;
  if (select count(*) from members where household_id = new.household_id) >= 2 then
    raise exception 'Este espacio ya tiene dos miembros';
  end if;
  return new;
end;
$$;

create trigger members_max_two
  before insert on public.members
  for each row execute function public.enforce_two_members();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger expenses_touch
  before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.invitations enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.budgets enable row level security;

-- households: se crean y borran con funciones; los miembros pueden leer y renombrar.
create policy households_select on public.households
  for select to authenticated using (public.is_member(id));
create policy households_update on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

-- members: se ven los del propio hogar; cada uno solo cambia su nombre.
create policy members_select on public.members
  for select to authenticated using (public.is_member(household_id));
create policy members_update_self on public.members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(household_id));

-- invitations: las ve el hogar y la persona invitada.
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_member(household_id) or email = lower(auth.jwt() ->> 'email'));
create policy invitations_delete on public.invitations
  for delete to authenticated using (public.is_member(household_id));

create policy categories_all on public.categories
  for all to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy expenses_select on public.expenses
  for select to authenticated using (public.is_member(household_id));
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id)
    and created_by = auth.uid()
  );
create policy expenses_update on public.expenses
  for update to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id)
  );
create policy expenses_delete on public.expenses
  for delete to authenticated using (public.is_member(household_id));

create policy settlements_select on public.settlements
  for select to authenticated using (public.is_member(household_id));
create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, from_user)
    and public.is_household_user(household_id, to_user)
    and created_by = auth.uid()
  );
create policy settlements_update on public.settlements
  for update to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, from_user)
    and public.is_household_user(household_id, to_user)
  );
create policy settlements_delete on public.settlements
  for delete to authenticated using (public.is_member(household_id));

create policy budgets_all on public.budgets
  for all to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and public.category_in_household(category_id, household_id)
  );

-- ---------------------------------------------------------------------------
-- Acciones (RPC)
-- ---------------------------------------------------------------------------

-- Crea el espacio compartido con categorías por defecto.
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un espacio compartido';
  end if;

  insert into households (name) values (trim(p_name)) returning id into h;
  insert into members (household_id, user_id, display_name) values (h, auth.uid(), trim(p_display_name));
  insert into categories (household_id, name)
  select h, unnest(array['Supermercado', 'Casa', 'Facturas', 'Transporte', 'Restaurantes', 'Ocio', 'Salud', 'Otros']);
  return h;
end;
$$;

-- Invita a la segunda persona por email. Sustituye una invitación anterior.
create or replace function public.invite_partner(p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
begin
  select household_id into h from members where user_id = auth.uid();
  if h is null then
    raise exception 'No perteneces a ningún espacio';
  end if;
  if (select count(*) from members where household_id = h) >= 2 then
    raise exception 'El espacio ya tiene dos miembros';
  end if;
  if lower(trim(p_email)) = lower(auth.jwt() ->> 'email') then
    raise exception 'No puedes invitarte a ti';
  end if;

  delete from invitations where household_id = h;
  insert into invitations (household_id, email, created_by) values (h, lower(trim(p_email)), auth.uid());
end;
$$;

-- La persona invitada acepta con su nombre visible. La invitación se borra.
create or replace function public.accept_invitation(p_display_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  inv invitations%rowtype;
begin
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un espacio compartido';
  end if;
  select * into inv from invitations where email = lower(auth.jwt() ->> 'email');
  if inv.id is null then
    raise exception 'No hay ninguna invitación para este email';
  end if;

  insert into members (household_id, user_id, display_name) values (inv.household_id, auth.uid(), trim(p_display_name));
  delete from invitations where id = inv.id;
  return inv.household_id;
end;
$$;

-- Borra el espacio compartido y todos sus datos (gastos, reembolsos, presupuestos).
-- Las cuentas siguen existiendo pero quedan sin espacio.
create or replace function public.delete_household()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
begin
  select household_id into h from members where user_id = auth.uid();
  if h is null then
    raise exception 'No perteneces a ningún espacio';
  end if;
  delete from households where id = h;
end;
$$;

-- Borra la cuenta de quien llama. Si era la última persona del espacio, el
-- espacio y sus datos se borran también.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  h uuid;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  select household_id into h from public.members where user_id = auth.uid();
  delete from public.members where user_id = auth.uid();
  if h is not null and not exists (select 1 from public.members where household_id = h) then
    delete from public.households where id = h;
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function
  public.is_member(uuid),
  public.is_household_user(uuid, uuid),
  public.category_in_household(uuid, uuid),
  public.create_household(text, text),
  public.invite_partner(text),
  public.accept_invitation(text),
  public.delete_household(),
  public.delete_my_account()
from public, anon;

grant execute on function
  public.is_member(uuid),
  public.is_household_user(uuid, uuid),
  public.category_in_household(uuid, uuid),
  public.create_household(text, text),
  public.invite_partner(text),
  public.accept_invitation(text),
  public.delete_household(),
  public.delete_my_account()
to authenticated;
