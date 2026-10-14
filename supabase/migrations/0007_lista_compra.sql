-- Lista de la compra compartida.
-- Ejecutar en Supabase (SQL Editor) después de 0006_reparto_por_defecto.sql.
--
-- Una sola tabla: cada fila es un producto apuntado en la lista del espacio. Al comprarlo
-- no se borra, pasa a "comprado" y sirve de historial (recientes y habituales). Al volver a
-- necesitarlo se apunta una fila nueva, así el historial se conserva tal cual.
-- No toca los gastos ni el presupuesto.

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  quantity numeric(7, 2) not null default 1 check (quantity > 0 and quantity <= 9999),
  unit text check (unit is null or unit in ('ud', 'kg', 'g', 'l', 'ml', 'paquete')),
  category text not null default 'otros' check (
    category in ('fruta', 'carne', 'lacteos', 'panaderia', 'despensa', 'bebidas', 'congelados', 'limpieza', 'higiene', 'otros')
  ),
  -- Marca sencilla de "importante": sale primero en la lista.
  important boolean not null default false,
  -- Precio aproximado, opcional. Preparado para un futuro presupuesto de la compra; no crea gastos.
  estimated_cents integer check (estimated_cents is null or (estimated_cents > 0 and estimated_cents <= 10000000)),
  status text not null default 'pending' check (status in ('pending', 'bought')),
  bought_at timestamptz,
  bought_by uuid,
  -- Momento en que se dio por terminada la compra: deja de verse en "Comprados" y queda en el historial.
  cleared_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'bought') = (bought_at is not null)),
  check (cleared_at is null or status = 'bought')
);

create index shopping_items_household_idx on public.shopping_items (household_id, status, bought_at desc);

-- La fecha de compra y quién compró los pone la base de datos, no el móvil: así cuadran
-- aunque un reloj vaya mal. Volver a "pendiente" borra esos datos y el cierre de la compra.
create or replace function public.shopping_items_status()
returns trigger
language plpgsql
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.status = 'bought' and (tg_op = 'INSERT' or old.status <> 'bought') then
    new.bought_at := now();
    new.bought_by := auth.uid();
  elsif new.status = 'pending' then
    new.bought_at := null;
    new.bought_by := null;
    new.cleared_at := null;
  elsif tg_op = 'UPDATE' then
    new.bought_at := old.bought_at;
    new.bought_by := old.bought_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger shopping_items_status
  before insert or update on public.shopping_items
  for each row execute function public.shopping_items_status();

alter table public.shopping_items enable row level security;

-- Los dos miembros del espacio ven y cambian la lista; nadie más.
create policy shopping_items_all on public.shopping_items
  for all to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and (created_by is null or public.is_household_user(household_id, created_by))
  );

-- Tiempo real: los cambios de uno le llegan al otro al momento.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end $$;
