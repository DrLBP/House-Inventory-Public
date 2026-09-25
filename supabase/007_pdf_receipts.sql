-- =====================================================================
-- PDF receipts: remember each file's type (photo or PDF)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run more than once. Existing photos stay "image/jpeg".
-- =====================================================================
alter table public.photos add column if not exists mime_type text not null default 'image/jpeg';

alter table public.photos drop constraint if exists photos_mime_type_check;
alter table public.photos add constraint photos_mime_type_check
  check (mime_type in ('image/jpeg', 'application/pdf'));
