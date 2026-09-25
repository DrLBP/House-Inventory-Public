# CLAUDE.md — Working rules for this project

This file tells Claude (and any future helper) how to work on this project. These are the
rules the app was built with; keep them if you extend it with an AI assistant.

## About the owner
- **Not a professional developer**, building with AI help and learning as we go.
- Explain what you're doing in **plain language, briefly**. Avoid jargon; when a technical
  term is unavoidable, define it in one short sentence.

## How to work
1. **Small steps.** Do one change at a time.
2. **After each step:** explain how to test it (exact taps/clicks), then **stop and wait**
   for the owner to confirm it works before moving on.
3. **Commit after each working step** with a clear message, so we can always roll back.
4. **Ask before big decisions:** new services, paid accounts, anything that costs money,
   major structural changes, or deleting data.
5. **Keep code simple and well-commented** so the owner can understand it later.
6. Record important decisions (what and why) in the project's notes.

## Secrets — never in the code
- **Never** put passwords, API keys, tokens, or secrets in any file in this repository.
- Use environment variables (a `.env.local` file that is git-ignored for local work,
  and the Vercel dashboard for the live app). Explain step by step how to set each one.
- Provide a `.env.example` listing variable **names only**, never values.
- Before every commit, check that no secret is being committed.

## Security & privacy rules (always apply)
- Google Drive: use only the `drive.file` permission (the app can see **only files it created**).
  Never make Drive files or folders shareable by link.
- Supabase: row-level security (RLS) on every table; only our account can read/write our data.
- Thumbnails live in a **private** Supabase storage bucket. No public URLs, only short-lived signed links.
- The PDF report is made on demand on the device and downloaded. Never uploaded or shared by link.
- The Google "long-term key" (refresh token) is kept only on the server side, encrypted, and
  never sent to the browser.
- This app is for household belongings. It is **not** built for patient data (PHI) and must not
  be used for it. HIPAA rules don't apply to this app, but we still treat the data (address,
  serial numbers, receipts, values) as sensitive.

## Core rule
All data and photos must end up backed up in the cloud automatically. The owner's
Google Drive "Home Inventory" folder alone should be enough to rebuild everything
(photos + a CSV of all item details), even if this app or Supabase disappears.

## Tech stack (summary)
- React + Vite, installable Progressive Web App (PWA)
- Hosting + small server functions: Vercel (its own separate project)
- Login + item data + thumbnails: Supabase (its own separate project)
- Full-size photos, receipts, CSV backups: owner's personal Google Drive
