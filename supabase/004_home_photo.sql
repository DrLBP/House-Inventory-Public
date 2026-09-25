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
