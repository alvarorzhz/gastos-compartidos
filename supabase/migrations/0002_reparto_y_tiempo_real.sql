-- Reparto personalizado por gasto y avisos en tiempo real.
-- Ejecutar en Supabase (SQL Editor) después de 0001_init.sql.

-- owed_cents: lo que la persona que NO pagó le debe a quien pagó.
-- null = reparto 50/50 (el valor por defecto de siempre).
alter table public.expenses
  add column owed_cents integer
  check (owed_cents is null or (owed_cents >= 0 and owed_cents <= amount_cents));

-- Publica los cambios de las tablas compartidas para que la app de la otra
-- persona se actualice sola. Realtime respeta las políticas RLS.
do $$
declare
  t text;
begin
  foreach t in array array['households', 'members', 'invitations', 'categories', 'expenses', 'settlements', 'budgets'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
