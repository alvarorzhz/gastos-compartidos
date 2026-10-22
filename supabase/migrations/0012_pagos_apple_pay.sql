-- Apuntar al pagar con Apple Pay.
-- Una automatización de Atajos en el iPhone («Cartera» → al pagar) manda el importe y la
-- tienda a la función "avisar" con la clave de quien paga. La función los guarda aquí como
-- «pago por confirmar» y le manda un aviso al móvil; en la app se confirma como gasto común
-- o personal, o se descarta. Nada se apunta en los gastos sin confirmarlo.
-- Ejecutar en Supabase (SQL Editor) después de 0011_presupuesto_personal.sql.

-- Clave de cada persona para su atajo. Nadie la lee directamente: la app la pide con
-- my_pay_key() y la función la comprueba con receive_payment().
create table if not exists public.pay_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  -- Cuándo llegó el último pago con esta clave (para ver en Ajustes que el atajo funciona).
  last_used_at timestamptz
);
alter table public.pay_keys enable row level security;

-- Pagos que han llegado del iPhone y aún no se han confirmado. Solo los ve quien pagó.
create table if not exists public.pending_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- null si el iPhone mandó un importe que no se entiende (se escribe al confirmar).
  amount_cents integer check (amount_cents is null or amount_cents between 1 and 100000000),
  merchant text check (char_length(merchant) <= 80),
  card text check (char_length(card) <= 60),
  raw_amount text check (char_length(raw_amount) <= 60),
  paid_at timestamptz not null default now()
);
create index if not exists pending_payments_user_idx on public.pending_payments (user_id, paid_at desc);

alter table public.pending_payments enable row level security;

drop policy if exists pending_payments_select on public.pending_payments;
create policy pending_payments_select on public.pending_payments
  for select to authenticated using (user_id = auth.uid());

drop policy if exists pending_payments_delete on public.pending_payments;
create policy pending_payments_delete on public.pending_payments
  for delete to authenticated using (user_id = auth.uid());

-- Tiempo real: el pago aparece en la app abierta en cuanto llega.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pending_payments'
  ) then
    alter publication supabase_realtime add table public.pending_payments;
  end if;
end $$;

-- Importe tal como lo manda el iPhone ("12,50 €", "€12.50", "1.234,56", "12.5") a céntimos.
-- El último separador seguido de 1 o 2 cifras es el decimal; los demás, de miles.
create or replace function public.parse_payment_amount(t text)
returns integer
language plpgsql immutable
as $$
declare
  s text := rtrim(regexp_replace(coalesce(t, ''), '[^0-9,.]', '', 'g'), ',.');
  whole text;
  cents numeric;
begin
  if s = '' then
    return null;
  end if;
  if s ~ '[,.][0-9]{1,2}$' then
    whole := regexp_replace(regexp_replace(s, '[,.][0-9]{1,2}$', ''), '[,.]', '', 'g');
    cents := coalesce(nullif(whole, ''), '0')::numeric * 100 + rpad(substring(s from '[,.]([0-9]{1,2})$'), 2, '0')::numeric;
  elsif s ~ '^[0-9]{1,3}([,.][0-9]{3})+$' or s ~ '^[0-9]+$' then
    cents := regexp_replace(s, '[,.]', '', 'g')::numeric * 100;
  else
    return null;
  end if;
  if cents < 1 or cents > 100000000 then
    return null;
  end if;
  return cents::integer;
end;
$$;

-- Clave del atajo de quien llama (se crea la primera vez; p_renew = true la cambia por otra,
-- y la antigua deja de funcionar).
create or replace function public.my_pay_key(p_renew boolean default false)
returns table (key text, last_used_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  if p_renew then
    delete from pay_keys where user_id = auth.uid();
  end if;
  insert into pay_keys (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  return query select k.key, k.last_used_at from pay_keys k where k.user_id = auth.uid();
end;
$$;
revoke all on function public.my_pay_key(boolean) from public, anon;
grant execute on function public.my_pay_key(boolean) to authenticated;

-- Guarda un pago que llega del iPhone. Solo la llama la función "avisar" (clave de servicio).
-- Devuelve 'bad-key', 'duplicate' (el mismo pago llegó hace menos de 2 minutos) u 'ok' con el pago.
create or replace function public.receive_payment(p_key text, p_amount text, p_merchant text, p_card text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  u uuid;
  cents integer := parse_payment_amount(left(p_amount, 60));
  shop text := nullif(btrim(left(coalesce(p_merchant, ''), 80)), '');
  p pending_payments%rowtype;
begin
  select user_id into u from pay_keys where key = p_key and coalesce(p_key, '') <> '';
  if u is null then
    return jsonb_build_object('status', 'bad-key');
  end if;
  if exists (
    select 1 from pending_payments
    where user_id = u and amount_cents is not distinct from cents and merchant is not distinct from shop
      and paid_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  -- Como mucho 100 pagos esperando: los más antiguos se descartan.
  delete from pending_payments where id in (
    select id from pending_payments where user_id = u order by paid_at desc offset 99
  );
  insert into pending_payments (user_id, amount_cents, merchant, card, raw_amount)
  values (u, cents, shop, nullif(btrim(left(coalesce(p_card, ''), 60)), ''), nullif(btrim(left(coalesce(p_amount, ''), 60)), ''))
  returning * into p;
  update pay_keys set last_used_at = now() where user_id = u;
  return jsonb_build_object('status', 'ok', 'id', p.id, 'user_id', u, 'amount_cents', p.amount_cents, 'merchant', p.merchant);
end;
$$;
revoke all on function public.receive_payment(text, text, text, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.receive_payment(text, text, text, text) to service_role;
  end if;
end $$;
