-- Errores de la app: cuando algo falla en el móvil de alguno de los dos, la app lo
-- apunta aquí y se ve en Ajustes → Errores de la app. Se guardan 90 días.
-- Ejecutar en Supabase después de 0014_copias_e_historial.sql.

create table public.app_errors (
  id bigint generated always as identity primary key,
  -- Vacío si el fallo fue antes de tener espacio (p. ej. al entrar).
  household_id uuid references public.households (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  happened_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 500),
  detail text check (char_length(detail) <= 4000),
  place text check (char_length(place) <= 200),
  app_version text check (char_length(app_version) <= 20),
  device text check (char_length(device) <= 300)
);

create index app_errors_household_idx on public.app_errors (household_id, happened_at desc);
create index app_errors_user_idx on public.app_errors (user_id, happened_at desc);

alter table public.app_errors enable row level security;

-- Cada uno apunta solo los suyos, en su espacio.
create policy app_errors_insert on public.app_errors
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (household_id is null or public.is_member(household_id)));

-- Los dos ven (y borran) los del espacio; los de antes de tener espacio, solo quien los tuvo.
create policy app_errors_select on public.app_errors
  for select to authenticated
  using ((household_id is not null and public.is_member(household_id)) or user_id = (select auth.uid()));

create policy app_errors_delete on public.app_errors
  for delete to authenticated
  using ((household_id is not null and public.is_member(household_id)) or user_id = (select auth.uid()));

-- Nadie los cambia.
revoke update on public.app_errors from anon, authenticated;
revoke all on public.app_errors from anon;

-- Al apuntar uno nuevo se borran los de hace más de 90 días.
create or replace function public.trim_app_errors()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from app_errors where happened_at < now() - interval '90 days';
  return null;
end;
$$;

revoke all on function public.trim_app_errors() from public, anon, authenticated;

create trigger app_errors_trim
  after insert on public.app_errors
  for each statement execute function public.trim_app_errors();

insert into supabase_migrations.schema_migrations (version, name) values ('0015', 'errores')
on conflict (version) do nothing;
