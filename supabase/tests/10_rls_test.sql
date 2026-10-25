-- Pruebas de acceso: se ejecutan con psql -v ON_ERROR_STOP=1.
-- Cuentas: A y B forman pareja, C es ajena, D intenta colarse como tercera.
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com');

create function pg_temp.login(u text, email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false),
         set_config('request.jwt.claims', json_build_object('sub', u, 'email', email)::text, false);
$$;

create function pg_temp.expect_error(stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'Se esperaba un error en: %', stmt;
exception when others then
  if sqlerrm like 'Se esperaba un error%' then raise; end if;
end;
$$;

create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok: %', msg;
end;
$$;

set role authenticated;

-- A crea el espacio e invita a B.
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select public.create_household('Casa', 'Ana') is not null;
select pg_temp.check((select count(*) from categories) = 8, 'categorías por defecto');
select pg_temp.expect_error($$ select public.create_household('Otra', 'Ana') $$);
select public.invite_partner('B@Example.com');

-- C no ve nada ni puede aceptar la invitación de B.
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select pg_temp.check((select count(*) from households) = 0, 'C no ve el espacio');
select pg_temp.check((select count(*) from invitations) = 0, 'C no ve la invitación');
select pg_temp.expect_error($$ select public.accept_invitation('Carla') $$);

-- B acepta.
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from invitations) = 1, 'B ve su invitación');
select public.accept_invitation('Bea') is not null;
select pg_temp.check((select count(*) from members) = 2, 'B ve los dos miembros');
select pg_temp.check((select count(*) from invitations) = 0, 'invitación borrada al aceptar');

-- Un tercero no puede entrar aunque A le invite.
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select pg_temp.expect_error($$ select public.invite_partner('d@example.com') $$);

-- Gastos: A añade uno pagado por B; no puede poner como pagador a C.
insert into expenses (household_id, amount_cents, category_id, paid_by, created_by)
select h.id, 1234, c.id, '00000000-0000-0000-0000-00000000000b', auth.uid()
from households h join categories c on c.household_id = h.id and c.name = 'Casa';
select pg_temp.expect_error($$
  insert into expenses (household_id, amount_cents, category_id, paid_by, created_by)
  select h.id, 100, c.id, '00000000-0000-0000-0000-00000000000c', auth.uid()
  from households h join categories c on c.household_id = h.id limit 1 $$);

-- Reparto personalizado: lo que debe quien no pagó no puede superar el importe.
select pg_temp.expect_error($$ update expenses set owed_cents = 999999 $$);
update expenses set owed_cents = 1234;
select pg_temp.check((select owed_cents from expenses) = 1234, 'reparto personalizado guardado');
update expenses set owed_cents = null;

-- B lo corrige.
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
update expenses set amount_cents = 2000;
select pg_temp.check((select amount_cents from expenses) = 2000, 'B corrige el gasto');

-- C crea su propio espacio e intenta escribir en el de A y B.
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select public.create_household('Piso C', 'Carla') is not null;
select pg_temp.check((select count(*) from expenses) = 0, 'C no ve gastos ajenos');
update expenses set amount_cents = 1;
delete from expenses;
reset role;
select pg_temp.check((select amount_cents from expenses) = 2000, 'C no puede tocar gastos ajenos');
select set_config('test.hogar_ab', (select household_id::text from expenses), false),
       set_config('test.cat_ab', (select category_id::text from expenses), false);
set role authenticated;
select pg_temp.expect_error($$
  insert into expenses (household_id, amount_cents, category_id, paid_by, created_by)
  values (current_setting('test.hogar_ab')::uuid, 100, current_setting('test.cat_ab')::uuid, auth.uid(), auth.uid()) $$);
select pg_temp.expect_error($$
  insert into members (household_id, user_id, display_name)
  values (current_setting('test.hogar_ab')::uuid, auth.uid(), 'Intrusa') $$);
-- Usar una categoría de otro hogar tampoco vale.
select pg_temp.expect_error($$
  insert into expenses (household_id, amount_cents, category_id, paid_by, created_by)
  select m.household_id, 100, current_setting('test.cat_ab')::uuid, auth.uid(), auth.uid() from members m $$);

-- Reembolso entre A y B.
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
insert into settlements (household_id, amount_cents, from_user, to_user, created_by)
select household_id, 1000, auth.uid(), '00000000-0000-0000-0000-00000000000b', auth.uid() from members where user_id = auth.uid();
select pg_temp.check((select count(*) from settlements) = 1, 'reembolso anotado');

-- Presupuesto.
insert into budgets (household_id, category_id, month, amount_cents)
select household_id, id, date '2026-10-01', 30000 from categories where name = 'Casa';
select pg_temp.check((select count(*) from budgets) = 1, 'presupuesto guardado');

-- Avisos por categoría: 90 % por defecto, 80/90/100 o sin aviso.
select pg_temp.check((select bool_and(alert_percent = 90) from categories), 'aviso al 90 % por defecto');
update categories set alert_percent = null where name = 'Ocio';
select pg_temp.expect_error($$ update categories set alert_percent = 50 where name = 'Casa' $$);

-- Gastos fijos: uno mensual que empezó hace dos meses apunta tres gastos.
insert into recurring_expenses (household_id, amount_cents, category_id, paid_by, frequency, start_on, note, created_by)
select household_id, 70000, id, auth.uid(), 'monthly', current_date - interval '2 months', 'Alquiler', auth.uid()
from categories where name = 'Casa';
-- Y uno semanal que empieza pasado mañana todavía no apunta nada.
insert into recurring_expenses (household_id, amount_cents, category_id, paid_by, frequency, start_on, created_by)
select household_id, 500, id, auth.uid(), 'weekly', current_date + 2, auth.uid()
from categories where name = 'Supermercado';
select pg_temp.check(public.generate_recurring_expenses(current_date) = 3, 'gasto fijo mensual apunta los meses pendientes');
select pg_temp.check(public.generate_recurring_expenses(current_date) = 0, 'no se apunta dos veces');
select pg_temp.check((select count(*) from expenses where recurring_id is not null and note = 'Alquiler') = 3, 'gastos enlazados a su plantilla');
select pg_temp.check((select max(spent_on) from expenses where note = 'Alquiler') = current_date, 'el último es de hoy');
-- Una fecha de móvil muy adelantada no apunta gastos futuros.
select pg_temp.check(public.generate_recurring_expenses(current_date + 30) = 0, 'no se adelantan gastos');
select pg_temp.check(public.recurring_date('2026-01-31', 'monthly', 1) = '2026-02-28', 'fin de mes en febrero');
select pg_temp.check(public.recurring_date('2026-01-31', 'monthly', 2) = '2026-03-31', 'vuelve al 31 en marzo');
select pg_temp.check(public.recurring_date('2024-02-29', 'yearly', 1) = '2025-02-28', 'año bisiesto');
select pg_temp.expect_error($$ update recurring_expenses set frequency = 'daily' $$);
select pg_temp.expect_error($$
  insert into recurring_expenses (household_id, amount_cents, category_id, paid_by, frequency, start_on, created_by)
  select household_id, 100, id, '00000000-0000-0000-0000-00000000000c', 'monthly', current_date, auth.uid() from categories limit 1 $$);

-- D (sin espacio) no ve plantillas ni genera nada ajeno.
select pg_temp.login('00000000-0000-0000-0000-00000000000d', 'd@example.com');
select pg_temp.check((select count(*) from recurring_expenses) = 0, 'D no ve gastos fijos ajenos');
select pg_temp.check(public.generate_recurring_expenses(current_date) = 0, 'D no genera gastos ajenos');
update recurring_expenses set amount_cents = 1;
reset role;
select pg_temp.check((select min(amount_cents) from recurring_expenses) = 500, 'D no puede tocar gastos fijos ajenos');
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Movimientos personales: solo los ve su dueño, ni siquiera la pareja.
insert into personal_entries (kind, amount_cents, category, note) values ('income', 200000, 'Nómina', 'Octubre');
insert into personal_entries (kind, amount_cents, category) values ('expense', 4999, 'Ropa');
select pg_temp.check((select count(*) from personal_entries) = 2, 'A ve sus movimientos personales');
select pg_temp.check((select bool_and(user_id = auth.uid()) from personal_entries), 'se guardan a nombre de quien los apunta');
select pg_temp.expect_error($$ insert into personal_entries (user_id, kind, amount_cents, category) values ('00000000-0000-0000-0000-00000000000b', 'expense', 100, 'Ocio') $$);
select pg_temp.expect_error($$ insert into personal_entries (kind, amount_cents, category) values ('transfer', 100, 'Ocio') $$);
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from personal_entries) = 0, 'la pareja no ve los movimientos personales');
update personal_entries set amount_cents = 1;
delete from personal_entries;
reset role;
select pg_temp.check((select count(*) from personal_entries where amount_cents > 1) = 2, 'la pareja no puede tocar los movimientos personales');
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Huchas: las ven y usan los dos; la aportación tiene que ser de un miembro.
insert into savings_goals (household_id, name, target_cents)
select household_id, 'Viaje a Italia', 150000 from members where user_id = auth.uid();
insert into savings_contributions (household_id, goal_id, user_id, amount_cents)
select household_id, id, auth.uid(), 20000 from savings_goals;
select pg_temp.expect_error($$
  insert into savings_contributions (household_id, goal_id, user_id, amount_cents)
  select household_id, id, '00000000-0000-0000-0000-00000000000c', 100 from savings_goals $$);
select pg_temp.expect_error($$
  insert into savings_contributions (household_id, goal_id, user_id, amount_cents)
  select household_id, id, auth.uid(), 0 from savings_goals $$);
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into savings_contributions (household_id, goal_id, user_id, amount_cents)
select household_id, id, auth.uid(), -5000 from savings_goals;
select pg_temp.check((select sum(amount_cents) from savings_contributions) = 15000, 'B ve la hucha y puede sacar dinero');
select pg_temp.login('00000000-0000-0000-0000-00000000000d', 'd@example.com');
select pg_temp.check((select count(*) from savings_goals) + (select count(*) from savings_contributions) = 0, 'D no ve huchas ajenas');
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Fijos personales: la nómina mensual de A se apunta sola y solo para A.
insert into personal_recurring (kind, amount_cents, category, frequency, start_on)
values ('income', 200000, 'Nómina', 'monthly', current_date - interval '1 month');
select pg_temp.check(public.generate_personal_recurring(current_date) = 2, 'nómina fija apuntada dos meses');
select pg_temp.check(public.generate_personal_recurring(current_date) = 0, 'fijos personales no se duplican');
select pg_temp.check((select count(*) from personal_entries where recurring_id is not null) = 2, 'movimientos enlazados a su fijo');
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from personal_recurring) = 0, 'la pareja no ve los fijos personales');
select pg_temp.check(public.generate_personal_recurring(current_date) = 0, 'la pareja no genera los fijos de otro');
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Presupuesto personal: solo lo ve y lo cambia su dueño.
insert into personal_budgets (category, amount_cents) values ('Supermercado', 20000);
select pg_temp.check((select count(*) from personal_budgets where user_id = auth.uid()) = 1, 'A guarda su límite personal');
select pg_temp.expect_error($$ insert into personal_budgets (category, amount_cents) values ('Supermercado', 100) $$);
select pg_temp.expect_error($$ insert into personal_budgets (category, amount_cents) values ('Ocio', 0) $$);
select pg_temp.expect_error($$ insert into personal_budgets (user_id, category, amount_cents) values ('00000000-0000-0000-0000-00000000000b', 'Ocio', 100) $$);
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from personal_budgets) = 0, 'la pareja no ve el presupuesto personal');
update personal_budgets set amount_cents = 1;
delete from personal_budgets;
reset role;
select pg_temp.check((select amount_cents from personal_budgets) = 20000, 'la pareja no puede tocar el presupuesto personal');
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Reparto por defecto: lo guarda cualquiera de los dos y debe ser un porcentaje válido.
update households set default_split_user = '00000000-0000-0000-0000-00000000000a', default_split_percent = 60;
select pg_temp.check((select default_split_percent from households) = 60, 'reparto por defecto guardado');
select pg_temp.expect_error($$ update households set default_split_percent = 120 $$);
select pg_temp.expect_error($$ update households set default_split_user = null $$);

-- Lista de la compra: la comparten los dos; comprar no borra el producto.
insert into shopping_items (household_id, name, quantity, unit, category)
select household_id, '  Leche ', 2, 'ud', 'lacteos' from members where user_id = auth.uid();
select pg_temp.check((select name from shopping_items) = 'Leche', 'producto apuntado sin espacios de más');
select pg_temp.check((select created_by from shopping_items) = auth.uid(), 'queda quién lo apuntó');
select pg_temp.expect_error($$ insert into shopping_items (household_id, name, category) select household_id, 'X', 'juguetes' from members where user_id = auth.uid() $$);
select pg_temp.expect_error($$ insert into shopping_items (household_id, name, quantity) select household_id, 'X', 0 from members where user_id = auth.uid() $$);
select pg_temp.expect_error($$ insert into shopping_items (household_id, name) select household_id, '   ', 0 from members where user_id = auth.uid() $$);
update shopping_items set status = 'bought';
select pg_temp.check((select bought_at is not null and bought_by = auth.uid() from shopping_items), 'comprado con fecha y quién');
update shopping_items set bought_at = '2000-01-01', created_by = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select bought_at > '2001-01-01' and created_by = auth.uid() from shopping_items), 'la fecha de compra y el autor no se falsean');
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from shopping_items) = 1, 'la pareja ve la lista');
update shopping_items set status = 'pending' where status = 'bought';
select pg_temp.check((select status = 'pending' and bought_at is null and quantity = 2 and unit = 'ud' from shopping_items), 'deshacer la compra conserva cantidad y unidad');
select household_id as hid from members where user_id = auth.uid() \gset
select pg_temp.login('00000000-0000-0000-0000-00000000000d', 'd@example.com');
select pg_temp.check((select count(*) from shopping_items) = 0, 'D no ve listas ajenas');
update shopping_items set name = 'Hackeado';
delete from shopping_items;
select pg_temp.expect_error(format('insert into shopping_items (household_id, name) values (%L, %L)', :'hid', 'Colado'));
reset role;
select pg_temp.check((select name from shopping_items) = 'Leche', 'D no cambia ni borra la lista de otros');
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Compra y gastos: al terminar la compra los productos se enlazan al gasto con su precio.
update shopping_items set status = 'bought';
insert into expenses (household_id, amount_cents, category_id, paid_by, created_by)
select h.id, 1234, c.id, auth.uid(), auth.uid() from households h join categories c on c.household_id = h.id and c.name = 'Casa';
update shopping_items set cleared_at = now(), price_cents = 189, ticket_name = 'LECHE ENTERA', expense_id = (select id from expenses where amount_cents = 1234);
select pg_temp.check((select price_cents = 189 and expense_id is not null from shopping_items), 'producto enlazado al gasto con su precio');
select id as sid from shopping_items \gset
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
insert into expenses (household_id, amount_cents, category_id, paid_by, created_by)
select h.id, 999, c.id, auth.uid(), auth.uid() from households h join categories c on c.household_id = h.id limit 1;
select id as cexp from expenses where amount_cents = 999 \gset
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select pg_temp.expect_error(format('update shopping_items set expense_id = %L', :'cexp'));
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
delete from expenses where amount_cents = 999;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
update shopping_items set status = 'pending';
select pg_temp.check((select price_cents is null and expense_id is null and ticket_name is null from shopping_items), 'deshacer la compra quita precio y gasto');
update shopping_items set status = 'bought';
update shopping_items set expense_id = (select id from expenses where amount_cents = 1234);
delete from expenses where amount_cents = 1234;
select pg_temp.check((select count(*) = 1 and bool_and(expense_id is null) from shopping_items), 'borrar el gasto deja el producto en el historial');
update shopping_items set status = 'pending';

-- Viajes y eventos: los comparten los dos; un gasto solo va a un viaje de su espacio.
insert into events (household_id, name, starts_on, ends_on)
select household_id, 'Roma', '2026-11-01', '2026-11-05' from members where user_id = auth.uid();
select pg_temp.expect_error($$ insert into events (household_id, name, starts_on, ends_on) select household_id, 'Mal', '2026-11-05', '2026-11-01' from members where user_id = auth.uid() $$);
insert into expenses (household_id, amount_cents, category_id, paid_by, created_by, event_id)
select h.id, 5000, c.id, auth.uid(), auth.uid(), e.id
from households h join categories c on c.household_id = h.id and c.name = 'Casa' join events e on e.household_id = h.id;
select pg_temp.check((select count(*) from expenses where event_id is not null) = 1, 'gasto apuntado en el viaje');
select id as eid from events \gset
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from events) = 1, 'la pareja ve el viaje');
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select pg_temp.check((select count(*) from events) = 0, 'C no ve viajes ajenos');
select pg_temp.expect_error(format($$ insert into expenses (household_id, amount_cents, category_id, paid_by, created_by, event_id)
  select h.id, 100, c.id, auth.uid(), auth.uid(), %L from households h join categories c on c.household_id = h.id limit 1 $$, :'eid'));
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
delete from events;
select pg_temp.check((select count(*) from expenses where amount_cents = 5000 and event_id is null) = 1, 'borrar el viaje deja sus gastos');

-- Avisos en el móvil: cada uno solo ve los suyos; las claves y lo enviado no se leen.
select public.save_push_subscription('https://push.example.com/a', 'p', 'k', true, false);
select pg_temp.check((select count(*) from push_subscriptions) = 1, 'avisos guardados');
select pg_temp.expect_error($$ insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.example.com/x', '00000000-0000-0000-0000-00000000000b', 'p', 'k') $$);
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from push_subscriptions) = 0, 'la pareja no ve los avisos de A');
select public.save_push_subscription('https://push.example.com/a', 'p2', 'k2', true, true);
select pg_temp.check((select count(*) from push_subscriptions) = 1, 'el móvil pasa a ser de quien entra');
select pg_temp.check((select count(*) from push_keys) = 0 and (select count(*) from push_sent) = 0, 'claves y enviados no se leen');
select pg_temp.expect_error($$ insert into push_keys (vapid) values ('{}') $$);
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select pg_temp.check((select count(*) from push_subscriptions) = 0, 'A ya no recibe en ese móvil');

-- Resúmenes: la preferencia se guarda y una app antigua (sin ella) no la cambia.
select public.save_push_subscription('https://push.example.com/s', 'p', 'k', true, true, false);
select pg_temp.check((select notify_summary from push_subscriptions where endpoint = 'https://push.example.com/s') = false, 'sin resúmenes en ese móvil');
select public.save_push_subscription('https://push.example.com/s', 'p', 'k', true, true);
select pg_temp.check((select notify_summary from push_subscriptions where endpoint = 'https://push.example.com/s') = false, 'una app antigua no reactiva los resúmenes');

-- Trabajo de cada mañana: solo lo lanza el servidor y su clave no se lee.
select pg_temp.expect_error($$ select public.run_automation() $$);
select pg_temp.expect_error($$ select public.generate_recurring_for(household_id, current_date) from members limit 1 $$);
select pg_temp.expect_error($$ select public.generate_personal_for(auth.uid(), current_date) $$);
select pg_temp.check((select count(*) from automation) = 0 and (select count(*) from push_digests) = 0, 'la clave del trabajo diario no se lee');
select pg_temp.check((select last_run_at from automation_status()) is null, 'aún no ha trabajado');
insert into recurring_expenses (household_id, amount_cents, category_id, paid_by, frequency, start_on, note, created_by)
select household_id, 4500, id, auth.uid(), 'monthly', current_date, 'Luz', auth.uid() from categories where name = 'Casa';
insert into personal_recurring (kind, amount_cents, category, frequency, start_on, note)
values ('expense', 1000, 'Ocio', 'monthly', current_date, 'Gimnasio');
reset role;
select pg_temp.check(public.run_automation() = '1 gasto fijo y 1 fijo personal', 'cada mañana apunta los fijos de todos');
select pg_temp.check(public.run_automation() = '0 gastos fijos y 0 fijos personales', 'el trabajo diario no duplica');
select pg_temp.check((select count(*) from expenses where note = 'Luz') = 1, 'gasto fijo apuntado sin abrir la app');
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select pg_temp.check((select last_run_at from automation_status()) is not null, 'Ajustes ve cuándo trabajó');
select pg_temp.check(public.generate_recurring_expenses(current_date) = 0, 'al abrir la app ya estaba apuntado');
select pg_temp.login('00000000-0000-0000-0000-00000000000d', 'd@example.com');
select pg_temp.check((select count(*) from automation_status()) = 0, 'quien no tiene espacio no ve nada');
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Pagos con Apple Pay: cada uno tiene su clave y solo ve sus pagos por confirmar.
select pg_temp.check(public.parse_payment_amount('12,50 €') = 1250, 'importe con coma y €');
select pg_temp.check(public.parse_payment_amount('€12.5') = 1250, 'importe con punto y un decimal');
select pg_temp.check(public.parse_payment_amount('1.234,56 €') = 123456, 'importe con miles');
select pg_temp.check(public.parse_payment_amount('1,200') = 120000, 'miles con coma');
select pg_temp.check(public.parse_payment_amount('7') = 700, 'importe sin decimales');
select pg_temp.check(public.parse_payment_amount('gratis') is null and public.parse_payment_amount('0,00') is null, 'importe que no se entiende');
select pg_temp.check((select count(*) from pay_keys) = 0, 'las claves no se leen');
select pg_temp.check(length((select key from public.my_pay_key())) = 64, 'A tiene su clave');
select pg_temp.check((select key from public.my_pay_key()) = (select key from public.my_pay_key()), 'la clave se mantiene');
select pg_temp.expect_error($$ select public.receive_payment('x', '1', 'x', null) $$);
create temp table pay_test as select key as old_key, (select key from public.my_pay_key(true)) as new_key from public.my_pay_key();
select pg_temp.check((select old_key <> new_key from pay_test), 'la clave se puede cambiar');
reset role;
select pg_temp.check(public.receive_payment((select old_key from pay_test), '9,99', 'X', null)->>'status' = 'bad-key', 'la clave antigua ya no vale');
select pg_temp.check(public.receive_payment((select new_key from pay_test), '23,40 €', ' Mercadona ', 'Visa')->>'status' = 'ok', 'llega un pago');
select pg_temp.check(public.receive_payment((select new_key from pay_test), '23,40 €', 'Mercadona', 'Visa')->>'status' = 'duplicate', 'el mismo pago no se apunta dos veces');
select pg_temp.check(public.receive_payment((select new_key from pay_test), 'raro', '', null)->>'status' = 'ok', 'un importe raro también llega');
select pg_temp.check((select merchant from pending_payments where amount_cents = 2340) = 'Mercadona', 'tienda sin espacios');
set role authenticated;
select pg_temp.check((select count(*) from pending_payments) = 2, 'A ve sus pagos por confirmar');
select pg_temp.check((select last_used_at from public.my_pay_key()) is not null, 'Ajustes ve que el atajo funciona');
select pg_temp.expect_error($$ insert into pending_payments (user_id, amount_cents) values (auth.uid(), 100) $$);
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from pending_payments) = 0, 'B no ve los pagos de A');
delete from pending_payments;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select pg_temp.check((select count(*) from pending_payments) = 2, 'B no puede borrar los pagos de A');
delete from pending_payments where amount_cents is null;
select pg_temp.check((select count(*) from pending_payments) = 1, 'A descarta un pago');

-- Perfil y reacciones (0013): cada uno cambia su color y reacciona a los gastos del espacio.
update members set color = 'coral', emoji = '🦊' where user_id = auth.uid();
select pg_temp.check((select color from members where user_id = auth.uid()) = 'coral', 'A elige su color');
select pg_temp.expect_error($$ update members set color = 'morado' where user_id = auth.uid() $$);
update members set color = 'green' where user_id <> auth.uid();
select pg_temp.check((select count(*) from members where color = 'green') = 0, 'A no cambia el color de B');
insert into expenses (household_id, amount_cents, category_id, paid_by, created_by)
select h.id, 4242, c.id, auth.uid(), auth.uid() from households h join categories c on c.household_id = h.id and c.name = 'Casa';
select id as reid, household_id as rhid from expenses where amount_cents = 4242 \gset
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into expense_reactions (expense_id, household_id, emoji, comment) values (:'reid', :'rhid', '❤️', '¡Repetimos!');
select pg_temp.expect_error(format($$ insert into expense_reactions (expense_id, household_id) values (%L, %L) $$, :'reid', :'rhid'));
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select pg_temp.check((select count(*) from expense_reactions) = 1, 'A ve la reacción de B');
update expense_reactions set emoji = '😂';
delete from expense_reactions;
select pg_temp.check((select emoji from expense_reactions) = '❤️', 'A no cambia ni borra la reacción de B');
select pg_temp.expect_error(format($$ insert into expense_reactions (expense_id, household_id, user_id, emoji) values (%L, %L, '00000000-0000-0000-0000-00000000000b', '👏') $$, :'reid', :'rhid'));
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select pg_temp.check((select count(*) from expense_reactions) = 0, 'C no ve reacciones ajenas');
select pg_temp.expect_error(format($$ insert into expense_reactions (expense_id, household_id, emoji) values (%L, %L, '👏') $$, :'reid', :'rhid'));
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
delete from expenses where amount_cents = 4242;
reset role;
select pg_temp.check((select count(*) from expense_reactions) = 0, 'la reacción se borra con el gasto');
set role authenticated;

-- Historial de cambios (0014): se apunta quién crea, cambia o borra cada gasto.
select pg_temp.check((select array_agg(action order by id) from expense_changes where expense_id = :'reid') = '{insert,delete}', 'el historial apunta el alta y el borrado');
select pg_temp.check((select changed_by from expense_changes where expense_id = :'reid' and action = 'delete') = auth.uid(), 'el historial sabe quién borró');
select pg_temp.expect_error(format($$ insert into expense_changes (household_id, expense_id, action) values (%L, %L, 'delete') $$, :'rhid', :'reid'));
update expense_changes set changed_by = null;
delete from expense_changes;
select pg_temp.check((select count(*) from expense_changes where changed_by is not null and expense_id = :'reid') = 2, 'nadie cambia ni borra el historial');
select id as chid from expense_changes where expense_id = :'reid' and action = 'delete' \gset
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select pg_temp.check((select count(*) from expense_changes where household_id = :'rhid') = 0, 'C no ve el historial ajeno');
select pg_temp.expect_error(format($$ select public.restore_expense(%s) $$, :'chid'));
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select public.restore_expense(:'chid') = :'reid'::uuid;
select pg_temp.check((select amount_cents from expenses where id = :'reid') = 4242, 'B recupera el gasto borrado');
select pg_temp.expect_error(format($$ select public.restore_expense(%s) $$, :'chid'));
update expenses set note = 'Cena' where id = :'reid';
update expenses set updated_at = now() where id = :'reid';
select pg_temp.check((select count(*) from expense_changes where expense_id = :'reid' and action = 'update') = 1, 'se apunta el cambio de nota y no el que no cambia nada');
select pg_temp.check((select old_row ->> 'note' is null and new_row ->> 'note' = 'Cena' from expense_changes where expense_id = :'reid' and action = 'update'), 'el historial guarda el antes y el después');
delete from expenses where id = :'reid';

-- Copias de seguridad (0014): solo las hace el servidor; lo común lo ven los dos, lo personal solo su dueño.
select pg_temp.expect_error($$ select public.run_backup() $$);
reset role;
select public.run_backup();
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select pg_temp.check((select count(*) from backups where household_id = :'rhid') = 1, 'A ve las copias del espacio');
select pg_temp.check((select count(*) from backups where user_id = auth.uid()) = 1, 'A ve las copias de lo suyo');
select pg_temp.check((select jsonb_array_length(data -> 'expenses') from backups where household_id = :'rhid' order by id desc limit 1) = (select count(*) from expenses), 'la copia lleva todos los gastos');
select pg_temp.check((select bool_and(user_id = auth.uid() or household_id is not null) from backups), 'A solo ve sus copias personales');
select pg_temp.expect_error(format($$ insert into backups (household_id, data) values (%L, '{}') $$, :'rhid'));
delete from backups;
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) from backups where household_id = :'rhid') = 1, 'B ve las copias del espacio (nadie las borra)');
select pg_temp.check((select count(*) from backups where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'B no ve las copias personales de A');
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select pg_temp.check((select count(*) from backups where household_id = :'rhid') = 0, 'C no ve copias ajenas');
reset role;
do $$ begin for i in 1..9 loop perform public.run_backup(); end loop; end $$;
select pg_temp.check((select count(*) from backups where household_id = :'rhid') = 8, 'se guardan solo las 8 últimas copias');
select pg_temp.check((select count(*) from supabase_migrations.schema_migrations) = 14, 'migraciones registradas');
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- Borrado del espacio: se va todo.
select public.delete_household();
reset role;
select pg_temp.check((select count(*) from expenses) = 0, 'gastos borrados con el espacio');
select pg_temp.check((select count(*) from households) = 1, 'solo queda el espacio de C');
select pg_temp.check((select count(*) from personal_entries) = 5, 'borrar el espacio no toca lo personal');
select pg_temp.check((select count(*) from savings_goals) = 0, 'huchas borradas con el espacio');
select pg_temp.check((select count(*) from shopping_items) = 0, 'lista de la compra borrada con el espacio');

-- Borrar cuenta: C era la única, su espacio desaparece con ella.
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select public.delete_my_account();
reset role;
select pg_temp.check((select count(*) from households) = 0, 'espacio de C borrado con su cuenta');
select pg_temp.check(not exists (select 1 from auth.users where email = 'c@example.com'), 'cuenta de C borrada');

-- Al borrar la cuenta de A se borran también sus movimientos personales.
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select public.delete_my_account();
reset role;
select pg_temp.check((select count(*) from personal_entries) = 0, 'movimientos personales borrados con la cuenta');
select pg_temp.check((select count(*) from personal_recurring) = 0, 'fijos personales borrados con la cuenta');
select pg_temp.check((select count(*) from personal_budgets) = 0, 'presupuesto personal borrado con la cuenta');
select pg_temp.check((select count(*) from pending_payments) = 0 and (select count(*) from pay_keys) = 0, 'pagos y clave borrados con la cuenta');
