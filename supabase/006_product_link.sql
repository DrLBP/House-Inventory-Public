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
