-- =====================================================================
-- Step 3: Homes and Rooms
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
--
-- Security: "row-level security" (RLS) is switched on for every table.
-- Each row remembers which login created it (owner_id), and the rules
-- below only let that same login see or change it. Anyone without our
-- login sees nothing.
-- =====================================================================

-- ---------- Homes (e.g. "Main House", "Cabin") ----------
create table if not exists public.homes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  address     text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Rooms inside a home (e.g. "Kitchen", "Garage") ----------
-- Deleting a home also deletes its rooms ("on delete cascade").
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  home_id     uuid not null references public.homes (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists rooms_home_id_idx on public.rooms (home_id);

-- ---------- Keep "updated_at" current automatically ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists homes_set_updated_at on public.homes;
create trigger homes_set_updated_at before update on public.homes
  for each row execute function public.set_updated_at();

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- ---------- Security: row-level security ----------
alter table public.homes enable row level security;
alter table public.rooms enable row level security;

-- Logged-out visitors get no access at all.
revoke all on public.homes from anon;
revoke all on public.rooms from anon;

-- Homes: only the owner can see / add / change / delete.
drop policy if exists "Owner can manage homes" on public.homes;
create policy "Owner can manage homes" on public.homes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Rooms: only the owner, and only inside a home the owner also owns.
drop policy if exists "Owner can manage rooms" on public.rooms;
create policy "Owner can manage rooms" on public.rooms
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.homes h
      where h.id = home_id and h.owner_id = (select auth.uid())
    )
  );
