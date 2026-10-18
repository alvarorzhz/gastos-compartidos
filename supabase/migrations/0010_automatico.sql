-- La app trabaja sola cada mañana (a las 8:00 UTC: 9:00 o 10:00 en la Península, 8:00 o 9:00 en Canarias):
-- apunta los gastos fijos (comunes y personales) aunque nadie abra la app y pide a la
-- función "avisar" los avisos del día: gastos fijos apuntados, resumen de la semana los
-- lunes y resumen del mes el día 1.
-- Ejecutar en Supabase (SQL Editor) después de 0009_compra_y_gastos.sql.

-- ---------------------------------------------------------------------------
-- Gastos fijos: la misma generación de siempre, ahora por espacio y por persona,
-- para poder lanzarla desde el servidor. La app la sigue llamando al abrirse.
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurring_for(h uuid, p_today date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r recurring_expenses%rowtype;
  d date;
  done integer;
  total integer := 0;
  -- Como mucho un día de diferencia con el servidor (zonas horarias).
  limit_day date := least(p_today, current_date + 1);
begin
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
revoke all on function public.generate_recurring_for(uuid, date) from public, anon, authenticated;

create or replace function public.generate_recurring_expenses(p_today date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
begin
  select household_id into h from members where user_id = auth.uid();
  if h is null then
    return 0;
  end if;
  return generate_recurring_for(h, p_today);
end;
$$;

create or replace function public.generate_personal_for(u uuid, p_today date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r personal_recurring%rowtype;
  d date;
  done integer;
  total integer := 0;
  limit_day date := least(p_today, current_date + 1);
begin
  for r in select * from personal_recurring where user_id = u and active order by id for update loop
    done := 0;
    loop
      d := recurring_date(r.start_on, r.frequency, r.generated_count + done);
      exit when d > limit_day or done >= 500;
      insert into personal_entries (user_id, kind, amount_cents, entry_on, category, note, recurring_id)
      values (r.user_id, r.kind, r.amount_cents, d, r.category, r.note, r.id);
      done := done + 1;
    end loop;
    if done > 0 then
      update personal_recurring set generated_count = generated_count + done where id = r.id;
      total := total + done;
    end if;
  end loop;
  return total;
end;
$$;
revoke all on function public.generate_personal_for(uuid, date) from public, anon, authenticated;

create or replace function public.generate_personal_recurring(p_today date)
returns integer
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return 0;
  end if;
  return generate_personal_for(auth.uid(), p_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- Resúmenes en el móvil: cada móvil elige si los quiere.
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions
  add column if not exists notify_summary boolean not null default true;

-- Igual que antes, con la preferencia de los resúmenes. Si una versión antigua de la app
-- no la manda, se deja como estaba.
drop function if exists public.save_push_subscription(text, text, text, boolean, boolean);
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_notify_expenses boolean, p_notify_budget boolean,
  p_notify_summary boolean default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth, notify_expenses, notify_budget, notify_summary)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, p_notify_expenses, p_notify_budget, coalesce(p_notify_summary, true))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        notify_expenses = excluded.notify_expenses, notify_budget = excluded.notify_budget,
        notify_summary = coalesce(p_notify_summary, push_subscriptions.notify_summary);
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, boolean, boolean, boolean) to authenticated;

-- Resúmenes ya enviados (uno por espacio, tipo y periodo), para no mandarlos dos veces.
create table if not exists public.push_digests (
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('week', 'month')),
  period text not null,
  sent_at timestamptz not null default now(),
  primary key (household_id, kind, period)
);
alter table public.push_digests enable row level security;

-- ---------------------------------------------------------------------------
-- El trabajo de cada mañana.
-- ---------------------------------------------------------------------------

-- Una sola fila: la clave con la que el servidor se presenta a la función "avisar"
-- (se crea sola) y cuándo trabajó por última vez. Nadie la puede leer desde la app.
create table if not exists public.automation (
  id integer primary key default 1 check (id = 1),
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  function_url text,
  scheduled boolean not null default false,
  last_run_at timestamptz,
  last_result text,
  -- Cuándo respondió la función "avisar" (si no, los avisos no están saliendo).
  last_notified_at timestamptz
);
alter table public.automation enable row level security;
insert into public.automation (id, function_url)
values (1, 'https://fhowginbcglylkmrhwfk.supabase.co/functions/v1/avisar')
on conflict (id) do nothing;

create or replace function public.run_automation()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
  u uuid;
  fixed integer := 0;
  personal integer := 0;
  a automation%rowtype;
  result text;
begin
  for h in select id from households order by id loop
    fixed := fixed + generate_recurring_for(h, current_date);
  end loop;
  for u in select distinct user_id from personal_recurring where active loop
    personal := personal + generate_personal_for(u, current_date);
  end loop;
  result := format('%s %s y %s %s',
    fixed, case when fixed = 1 then 'gasto fijo' else 'gastos fijos' end,
    personal, case when personal = 1 then 'fijo personal' else 'fijos personales' end);

  -- Pide los avisos del día a la función (pg_net solo existe en Supabase).
  select * into a from automation where id = 1;
  if a.function_url is not null and exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
      using a.function_url, jsonb_build_object('daily', true, 'secret', a.secret), jsonb_build_object('Content-Type', 'application/json');
  end if;

  update automation set last_run_at = now(), last_result = result where id = 1;
  return result;
end;
$$;
revoke all on function public.run_automation() from public, anon, authenticated;

-- Para Ajustes: cuándo trabajó la app sola por última vez.
create or replace function public.automation_status()
returns table (scheduled boolean, last_run_at timestamptz, last_notified_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.scheduled, a.last_run_at, a.last_notified_at
  from automation a
  where exists (select 1 from members where user_id = auth.uid());
$$;
revoke all on function public.automation_status() from public, anon;
grant execute on function public.automation_status() to authenticated;

-- Programa el trabajo cada mañana a las 8:00 UTC (pg_cron y pg_net vienen con Supabase, gratis).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('gastos-cada-manana', '0 8 * * *', 'select public.run_automation()');
    update public.automation set scheduled = true where id = 1;
  else
    raise notice 'pg_cron no está disponible: el trabajo de cada mañana no se programa (normal fuera de Supabase).';
  end if;
end $$;
