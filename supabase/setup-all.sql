-- =====================================================================
-- Home Inventory: complete database setup for a NEW Supabase project.
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
--
-- (It is simply the numbered scripts 001-008 in this folder, one after
-- another. Existing installs only need the numbered scripts they haven't run.)
-- =====================================================================


-- ##################### 001_homes_and_rooms.sql #####################
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


-- ##################### 002_google_connection.sql #####################
-- =====================================================================
-- Step 4: Google Drive connection
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
--
-- Stores the long-term Google key (the "refresh token"), ENCRYPTED.
-- The phone/browser can NEVER read this table: row-level security is on
-- and there are deliberately no rules that allow access. Only our Vercel
-- server functions (using the Supabase secret key) can read or write it.
-- =====================================================================

create table if not exists public.google_connection (
  owner_id                 uuid primary key references auth.users (id) on delete cascade,
  google_email             text,
  refresh_token_encrypted  text not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.google_connection enable row level security;

-- No access at all for the browser, whether logged in or not.
revoke all on public.google_connection from anon, authenticated;

drop trigger if exists google_connection_set_updated_at on public.google_connection;
create trigger google_connection_set_updated_at before update on public.google_connection
  for each row execute function public.set_updated_at();


-- ##################### 003_items_and_photos.sql #####################
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


-- ##################### 004_home_photo.sql #####################
-- =====================================================================
-- Home photo (an outside picture of each home)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
--
-- The full-size photo goes to Google Drive (Home Inventory/[Home]/), and a
-- tiny preview to the private "thumbnails" bucket, like every other photo.
-- The existing row-level security rules on "homes" already protect these.
-- =====================================================================
alter table public.homes add column if not exists photo_drive_file_id text;
alter table public.homes add column if not exists photo_drive_file_name text;
alter table public.homes add column if not exists photo_thumb_path text;
alter table public.homes add column if not exists photo_taken_at timestamptz;


-- ##################### 005_item_quantity.sql #####################
-- =====================================================================
-- Item quantity (e.g. 4 matching stools)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
--
-- Purchase price and replacement value are "each"; the app multiplies by
-- the quantity for totals. Existing items get quantity 1.
-- =====================================================================
alter table public.items add column if not exists quantity integer not null default 1;

alter table public.items drop constraint if exists items_quantity_check;
alter table public.items add constraint items_quantity_check check (quantity >= 1 and quantity <= 10000);


-- ##################### 006_product_link.sql #####################
-- =====================================================================
-- Product link for each item (e.g. the shop's page for that item)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
--
-- Also a one-time tidy-up: a web link found in an item's Notes (for
-- example from the Encircle import) is moved into the new Product link
-- field, and removed from the Notes.
-- =====================================================================
alter table public.items add column if not exists product_url text;

update public.items
set product_url = substring(notes from 'https?://[^[:space:]]+'),
    notes = nullif(btrim(regexp_replace(notes, '[[:space:]]*https?://[^[:space:]]+', '')), '')
where product_url is null
  and notes ~ 'https?://';


-- ##################### 007_pdf_receipts.sql #####################
-- =====================================================================
-- PDF receipts: remember each file's type (photo or PDF)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once. Existing photos stay "image/jpeg".
-- =====================================================================
alter table public.photos add column if not exists mime_type text not null default 'image/jpeg';

alter table public.photos drop constraint if exists photos_mime_type_check;
alter table public.photos add constraint photos_mime_type_check
  check (mime_type in ('image/jpeg', 'application/pdf'));


-- ##################### 008_cover_photo_and_room_review.sql #####################
-- =====================================================================
-- Main photo per item, and "Last reviewed" per room
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once.
-- =====================================================================

-- The photo shown as the item's thumbnail (empty = its oldest photo).
-- Deliberately NOT a database link to the photos table: a second link
-- between items and photos confuses how the app loads "an item with its
-- photos". If the chosen photo is deleted, the app simply uses the oldest.
alter table public.items
  add column if not exists cover_photo_id uuid;

-- Removes that link if an earlier version of this script created it.
alter table public.items
  drop constraint if exists items_cover_photo_id_fkey;

-- When the room was last walked through and checked.
alter table public.rooms
  add column if not exists reviewed_at timestamptz;
