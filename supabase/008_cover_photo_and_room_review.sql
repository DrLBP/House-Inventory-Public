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
