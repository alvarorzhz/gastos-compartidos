-- Reparto por defecto del espacio (por ejemplo 60/40 según los sueldos).
-- Ejecutar en Supabase (SQL Editor) después de 0005_huchas_y_fijos_personales.sql.

-- default_split_percent es la parte que le toca a default_split_user de cada gasto nuevo.
-- Los dos a null = a medias (50/50), como hasta ahora. Cada gasto guarda su propio reparto
-- (owed_cents), así que cambiar esto no toca los gastos ya apuntados.
alter table public.households
  add column default_split_user uuid references auth.users (id) on delete set null,
  add column default_split_percent smallint check (default_split_percent between 0 and 100),
  add constraint households_default_split_both
    check ((default_split_user is null) = (default_split_percent is null));
