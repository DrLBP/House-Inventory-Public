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
