-- Gastos fijos (plantillas que se repiten) y avisos de presupuesto por categoría.
-- Ejecutar en Supabase (SQL Editor) después de 0002_reparto_y_tiempo_real.sql.

-- ---------------------------------------------------------------------------
-- Gastos fijos
-- ---------------------------------------------------------------------------

-- Cada plantilla genera un gasto normal en start_on, start_on + 1 periodo, etc.
-- generated_count cuenta los que ya se han apuntado, así que el siguiente es
-- start_on + generated_count periodos. Al cambiar la fecha o la frecuencia, la
-- app pone start_on = próxima fecha y generated_count = 0.
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  category_id uuid not null references public.categories (id),
  paid_by uuid not null,
  owed_cents integer check (owed_cents is null or (owed_cents >= 0 and owed_cents <= amount_cents)),
  note text check (note is null or char_length(note) <= 200),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  start_on date not null,
  generated_count integer not null default 0 check (generated_count >= 0),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index recurring_expenses_household_idx on public.recurring_expenses (household_id);

-- Los gastos apuntados por una plantilla la recuerdan (para mostrar 🔁).
alter table public.expenses
  add column recurring_id uuid references public.recurring_expenses (id) on delete set null;

alter table public.recurring_expenses enable row level security;

create policy recurring_select on public.recurring_expenses
  for select to authenticated using (public.is_member(household_id));
create policy recurring_insert on public.recurring_expenses
  for insert to authenticated
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id)
    and created_by = auth.uid()
  );
create policy recurring_update on public.recurring_expenses
  for update to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and public.is_household_user(household_id, paid_by)
    and public.category_in_household(category_id, household_id)
  );
create policy recurring_delete on public.recurring_expenses
  for delete to authenticated using (public.is_member(household_id));

-- Fecha de la repetición número n (0 = la primera). Sumar n meses de una vez
-- conserva el día: del 31 de enero sale 28/29 de febrero y luego 31 de marzo.
create or replace function public.recurring_date(p_start date, p_frequency text, p_n integer)
returns date
language sql immutable
as $$
  select (p_start + p_n * case p_frequency
    when 'weekly' then interval '1 week'
    when 'monthly' then interval '1 month'
    else interval '1 year'
  end)::date;
$$;

-- Apunta los gastos fijos que ya tocan (hasta p_today, el día de hoy en el
-- móvil). La app la llama al abrirse; si los dos móviles la llaman a la vez,
-- el bloqueo de filas evita apuntar dos veces el mismo gasto.
create or replace function public.generate_recurring_expenses(p_today date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
  r recurring_expenses%rowtype;
  d date;
  done integer;
  total integer := 0;
  -- Como mucho un día de diferencia con el servidor (zonas horarias).
  limit_day date := least(p_today, current_date + 1);
begin
  select household_id into h from members where user_id = auth.uid();
  if h is null then
    return 0;
  end if;

  for r in select * from recurring_expenses where household_id = h and active order by id for update loop
    if not is_household_user(h, r.paid_by) then
      -- Quien pagaba ya no está en el espacio: se pausa en vez de inventar gastos.
      update recurring_expenses set active = false where id = r.id;
      continue;
    end if;
    done := 0;
    loop
      d := recurring_date(r.start_on, r.frequency, r.generated_count + done);
      exit when d > limit_day or done >= 500;
      insert into expenses (household_id, amount_cents, spent_on, category_id, paid_by, owed_cents, note, created_by, recurring_id)
      values (h, r.amount_cents, d, r.category_id, r.paid_by, r.owed_cents, r.note, r.created_by, r.id);
      done := done + 1;
    end loop;
    if done > 0 then
      update recurring_expenses set generated_count = generated_count + done where id = r.id;
      total := total + done;
    end if;
  end loop;
  return total;
end;
$$;

revoke all on function public.generate_recurring_expenses(date) from public, anon;
grant execute on function public.generate_recurring_expenses(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Avisos de presupuesto
-- ---------------------------------------------------------------------------

-- Porcentaje del presupuesto a partir del cual la app avisa. null = no avisar.
alter table public.categories
  add column alert_percent smallint default 90 check (alert_percent in (80, 90, 100));

-- ---------------------------------------------------------------------------
-- Tiempo real
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_expenses'
  ) then
    alter publication supabase_realtime add table public.recurring_expenses;
  end if;
end $$;
