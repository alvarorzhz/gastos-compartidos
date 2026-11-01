-- Copias de seguridad más seguras (auditoría del 2026-11-01):
-- - Sobreviven a un borrado: si se borra el espacio o una cuenta, sus copias ya no se
--   borran con ellos. Nadie las ve desde la app, pero se guardan 30 días por si fue un error
--   (se recuperan desde el SQL Editor de Supabase). Pasados los 30 días, se borran solas.
-- - Completas: también guardan los retos, el historial de cambios y los pagos de Apple Pay
--   que aún no se han confirmado.
-- - Diarias: una copia cada noche (3:00 UTC). Se quedan las 14 últimas y, además, la de
--   cada lunes de las 8 últimas semanas.
-- Ejecutar en Supabase (SQL Editor) después de 0016_retos.sql.

-- Las copias ya no dependen de que el espacio o la cuenta sigan existiendo.
alter table public.backups drop constraint if exists backups_household_id_fkey;
alter table public.backups drop constraint if exists backups_user_id_fkey;

-- Cuándo se vio que su espacio o su cuenta ya no existen (se borra 30 días después).
alter table public.backups add column if not exists orphaned_at timestamptz;

create or replace function public.run_backup()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  shared_tables text[] := array['members', 'categories', 'budgets', 'events', 'expenses', 'expense_reactions',
    'recurring_expenses', 'settlements', 'savings_goals', 'savings_contributions', 'shopping_items',
    'challenges', 'expense_changes'];
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

-- Deja las 14 copias más nuevas y, además, la de cada lunes de las 8 últimas semanas.
-- Cuenta copias, no días: si el servidor dejara de copiar, las últimas nunca se borran.
create or replace function public.trim_backups(h uuid, u uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from backups b
  where b.household_id is not distinct from h and b.user_id is not distinct from u
    and b.id not in (
      select id from backups
      where household_id is not distinct from h and user_id is not distinct from u
      order by taken_at desc, id desc limit 14)
    and b.id not in (
      select distinct on ((taken_at at time zone 'UTC')::date) id from backups
      where household_id is not distinct from h and user_id is not distinct from u
        and extract(isodow from taken_at at time zone 'UTC') = 1
      order by (taken_at at time zone 'UTC')::date desc, taken_at desc, id desc
      limit 8);
end;
$$;

revoke all on function public.run_backup() from public, anon, authenticated;
revoke all on function public.trim_backups(uuid, uuid) from public, anon, authenticated;

-- Primera copia completa ahora mismo, y a partir de hoy una cada noche a las 3:00 UTC.
select public.run_backup();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'gastos-copia-semanal') then
      perform cron.unschedule('gastos-copia-semanal');
    end if;
    perform cron.schedule('gastos-copia-diaria', '0 3 * * *', 'select public.run_backup()');
  else
    raise notice 'pg_cron no está disponible: la copia diaria no se programa (normal fuera de Supabase).';
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('0017', 'copias_seguras')
on conflict (version) do nothing;
