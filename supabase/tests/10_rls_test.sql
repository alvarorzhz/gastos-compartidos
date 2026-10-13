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

-- Borrado del espacio: se va todo.
select public.delete_household();
reset role;
select pg_temp.check((select count(*) from expenses) = 0, 'gastos borrados con el espacio');
select pg_temp.check((select count(*) from households) = 1, 'solo queda el espacio de C');

-- Borrar cuenta: C era la única, su espacio desaparece con ella.
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'c@example.com');
select public.delete_my_account();
reset role;
select pg_temp.check((select count(*) from households) = 0, 'espacio de C borrado con su cuenta');
select pg_temp.check(not exists (select 1 from auth.users where email = 'c@example.com'), 'cuenta de C borrada');
