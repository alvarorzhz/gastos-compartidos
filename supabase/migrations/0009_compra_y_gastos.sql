-- Compra y gastos unidos (versión 3.2.0).
-- Ejecutar en Supabase (SQL Editor) después de 0008_viajes_y_avisos.sql.
--
-- Al terminar una compra se puede apuntar el gasto: los productos comprados quedan enlazados
-- a ese gasto, con lo que costó cada uno (si se sabe) y cómo se llamaba en el ticket. Con eso
-- la app recuerda los precios y calcula cuánto costará la próxima lista.

alter table public.shopping_items
  -- Lo que costó de verdad (la línea del ticket o lo que se escribió al terminar la compra).
  add column price_cents integer check (price_cents is null or (price_cents >= 0 and price_cents <= 10000000)),
  -- Nombre en el ticket ("LECHE ENT. HACENDADO"), para reconocerlo solo la próxima vez.
  add column ticket_name text check (ticket_name is null or char_length(ticket_name) <= 80),
  -- Gasto en el que se pagó. Si se borra el gasto, el producto se queda en el historial.
  add column expense_id uuid references public.expenses (id) on delete set null;

create index shopping_items_expense_idx on public.shopping_items (expense_id) where expense_id is not null;

create or replace function public.expense_in_household(e uuid, h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select e is null or exists (select 1 from expenses where id = e and household_id = h);
$$;
revoke all on function public.expense_in_household(uuid, uuid) from public, anon;
grant execute on function public.expense_in_household(uuid, uuid) to authenticated;

-- Un producto solo se enlaza a un gasto de su propio espacio.
drop policy shopping_items_all on public.shopping_items;
create policy shopping_items_all on public.shopping_items
  for all to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and (created_by is null or public.is_household_user(household_id, created_by))
    and public.expense_in_household(expense_id, household_id)
  );

-- Igual que antes, y además: volver a "pendiente" quita también el precio y el gasto.
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
    new.price_cents := null;
    new.ticket_name := null;
    new.expense_id := null;
  elsif tg_op = 'UPDATE' then
    new.bought_at := old.bought_at;
    new.bought_by := old.bought_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
