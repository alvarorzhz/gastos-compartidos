-- Mapa de los gastos: dónde estabais al apuntar un gasto nuevo.
-- Se guarda redondeado a unos 10 m (la app manda 4 decimales). Los gastos
-- antiguos, los fijos y los de Apple Pay se quedan sin sitio (null).
-- Las copias (run_backup) copian la fila entera, así que ya lo incluyen.

alter table public.expenses
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.expenses drop constraint if exists expenses_spot_ok;
-- Los dos a la vez o ninguno (con un OR, un solo null pasaría el check).
alter table public.expenses add constraint expenses_spot_ok check (
  (lat is null) = (lng is null)
  and coalesce(lat between -90 and 90 and lng between -180 and 180, true)
);

insert into supabase_migrations.schema_migrations (version, name) values ('0019', 'mapa')
on conflict (version) do nothing;
