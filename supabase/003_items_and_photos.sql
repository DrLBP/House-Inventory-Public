-- =====================================================================
-- Step 5: Items, photos, and the private thumbnail storage
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
-- =====================================================================

-- ---------- Items (the things we own) ----------
-- Only the photo is needed at first. A new item is a "draft"
-- (needs_details = true) until details are filled in later.
create table if not exists public.items (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_id            uuid not null references public.rooms (id) on delete cascade,
  name               text,
  category           text,
  brand              text,
  model              text,
  serial_number      text,
  purchase_date      date,
  purchase_price     numeric(12, 2) check (purchase_price >= 0),
  replacement_value  numeric(12, 2) check (replacement_value >= 0),
  notes              text,
  needs_details      boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists items_room_id_idx on public.items (room_id);

-- ---------- Photos ----------
-- kind: 'item' (photo of an item), 'receipt', or 'room_overview' (whole room).
-- The full-size photo lives in Google Drive (drive_file_id); a tiny preview
-- lives in the private "thumbnails" storage bucket (thumb_path).
create table if not exists public.photos (
  id               uuid primary key,  -- created on the phone at the moment of capture
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_id          uuid not null references public.rooms (id) on delete cascade,
  item_id          uuid references public.items (id) on delete cascade,
  kind             text not null check (kind in ('item', 'receipt', 'room_overview')),
  taken_at         timestamptz not null,  -- original date/time the photo was taken
  drive_file_id    text not null,
  drive_file_name  text,
  thumb_path       text,
  width            integer,
  height           integer,
  size_bytes       integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- An item photo or receipt must belong to an item; a room overview must not.
  check ((kind = 'room_overview') = (item_id is null))
);
create index if not exists photos_item_id_idx on public.photos (item_id);
create index if not exists photos_room_id_idx on public.photos (room_id);

-- ---------- Keep "updated_at" current ----------
drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at before update on public.photos
  for each row execute function public.set_updated_at();

-- ---------- Security: row-level security ----------
alter table public.items enable row level security;
alter table public.photos enable row level security;
revoke all on public.items from anon;
revoke all on public.photos from anon;

-- Items: only the owner, and only in a room the owner owns.
drop policy if exists "Owner can manage items" on public.items;
create policy "Owner can manage items" on public.items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid()))
  );

-- Photos: only the owner; room (and item, if any) must also be the owner's.
drop policy if exists "Owner can manage photos" on public.photos;
create policy "Owner can manage photos" on public.photos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid()))
    and (item_id is null or exists (
      select 1 from public.items i where i.id = item_id and i.owner_id = (select auth.uid())
    ))
  );

-- ---------- Private storage bucket for thumbnails ----------
-- public = false: no public web addresses; the app uses short-lived signed links.
-- Max 200 KB per file, JPEG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbnails', 'thumbnails', false, 204800, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 204800, allowed_mime_types = array['image/jpeg'];

-- Each login may only touch files inside its own folder: thumbnails/<user id>/...
drop policy if exists "Owner can read own thumbnails" on storage.objects;
create policy "Owner can read own thumbnails" on storage.objects
  for select to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner can add own thumbnails" on storage.objects;
create policy "Owner can add own thumbnails" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner can update own thumbnails" on storage.objects;
create policy "Owner can update own thumbnails" on storage.objects
  for update to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner can delete own thumbnails" on storage.objects;
create policy "Owner can delete own thumbnails" on storage.objects
  for delete to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);
