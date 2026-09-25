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
