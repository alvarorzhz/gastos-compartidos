-- Movimientos personales: gastos e ingresos de cada persona que no cuentan en
-- lo común. Solo los ve y los toca su dueño (ni siquiera la pareja).
-- Ejecutar en Supabase (SQL Editor) después de 0003_fijos_y_avisos.sql.

create table public.personal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  entry_on date not null default current_date,
  category text not null check (char_length(category) between 1 and 40),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index personal_entries_user_date_idx on public.personal_entries (user_id, entry_on desc);

alter table public.personal_entries enable row level security;

create policy personal_own on public.personal_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Para que se actualice al momento si usas la app en dos dispositivos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_entries'
  ) then
    alter publication supabase_realtime add table public.personal_entries;
  end if;
end $$;
