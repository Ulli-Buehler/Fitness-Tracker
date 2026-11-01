-- Im Supabase SQL Editor einmal ausführen.
-- Pro Nutzer genau ein Datensatz; Zugriff ausschließlich auf eigene Daten.
create table if not exists public.fitness_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.fitness_profiles enable row level security;
revoke all on public.fitness_profiles from anon;
grant select, insert, update, delete on public.fitness_profiles to authenticated;
drop policy if exists "Select own fitness data" on public.fitness_profiles;
create policy "Select own fitness data" on public.fitness_profiles
 for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert own fitness data" on public.fitness_profiles;
create policy "Insert own fitness data" on public.fitness_profiles
 for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own fitness data" on public.fitness_profiles;
create policy "Update own fitness data" on public.fitness_profiles
 for update to authenticated using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own fitness data" on public.fitness_profiles;
create policy "Delete own fitness data" on public.fitness_profiles
 for delete to authenticated using ((select auth.uid()) = user_id);
