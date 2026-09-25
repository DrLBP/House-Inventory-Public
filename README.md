# Home Inventory

A phone-first app for photographing and documenting everything in your home for
insurance, built so that **your inventory survives even if your phone and your house don't**.

You run your own private copy with your own free accounts. Your photos and details live in
**your** Google Drive and **your** database. Nobody else, including the author, ever sees them.

> **Built by a non-developer with AI.** I'm a physician, not a programmer. I built this with
> [Claude Code](https://claude.com/claude-code) over a few days, in small tested steps, with a
> strong focus on security and on never losing data. The rules I gave the AI are in
> [`CLAUDE.md`](CLAUDE.md). It's a personal project shared as-is. Feedback and suggestions are
> very welcome.

## What it does

- **Room-by-room capture.** Homes → rooms → items. The in-app camera snaps photos fast; each
  photo keeps its original date and time (also for photos picked from the gallery).
- **Only the photo is needed at first.** Details can be filled in later; the Dashboard lists
  items that still need details.
- **Item details:** name, category, brand, model, serial number, quantity, purchase date and
  price, replacement value, product link, notes. Receipts as photos **or PDFs**.
- **✨ AI assist (optional, uses Claude):**
  - *Suggest details from photos*: identifies the item and reads brand, model and serial
    numbers from labels and receipts.
  - *Look up current price*: searches the web for today's replacement price and a product link.
  - *Suggest for items in a room*: does the above for many items at once, then you review
    each item's suggestions.
  - Suggestions are shown as "current → suggested" with tick boxes. **Nothing is saved until
    you approve it.**
- **Insurance report (PDF):** cover page, summary by room, every item with photos, details and
  receipts. Made on your phone and downloaded; never uploaded.
- **Backups everywhere:**
  - Full-size photos and receipts go to your Google Drive, in "Home Inventory / Home / Room"
    folders with readable file names.
  - A spreadsheet (`inventory-backup.csv`) of every detail is refreshed in Drive after each
    change, plus a monthly copy.
  - A "READ ME FIRST.txt" in Drive explains the folder to anyone (for example an adjuster).
  - One-tap full backup (.zip) for an offline copy.
- **Works offline:** photos wait on the phone and upload automatically when back online.
- **Search, dashboard (totals by home, room and category), move photos between items, choose
  an item's main photo, and a "Last reviewed" date per room** for yearly re-inventories.
- Installable on the phone's home screen (a "PWA"). Built and tested mainly on Android with
  Chrome.

## How your data is protected

- **Your own accounts only:** your Supabase database, your Google Drive, your Vercel app.
- **Login required**, with sign-ups turned off: only the account you create can get in.
- **Row-level security on every database table:** each record belongs to one login.
- **Google Drive:** the app asks only for the `drive.file` permission, so it can see only the
  files it created, never the rest of your Drive. It never creates sharing links.
- **Thumbnails** live in a private storage bucket, shown only through links that expire.
- **Secrets stay on the server:** the Google key is stored encrypted; the AI key never reaches
  the browser.
- **Strict browser security headers**, and search engines are told not to index the app.

Details and a one-time account checklist: [`SECURITY.md`](SECURITY.md).
What to do if something goes wrong: [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).

## What it costs to run

| Service | What it's used for | Cost |
|---|---|---|
| [Vercel](https://vercel.com) (Hobby) | Hosts the app and its small server functions | Free for personal use |
| [Supabase](https://supabase.com) (Free) | Login, item details, small previews | Free (a daily keep-alive stops it pausing) |
| Google Drive | Full-size photos, receipts, backups | Free within your Google storage |
| [Anthropic API](https://console.anthropic.com) | ✨ AI assist (optional) | Pay per use. Roughly 5–15¢ per item for details, a bit more with a price lookup. Set a spending limit. |

## Set it up

Follow **[SETUP.md](SETUP.md)**. It takes about 1–2 hours, no coding needed, just careful
copying and pasting between a few websites.

## Good to know

- **AI can be wrong.** Always check serial and model numbers against the label.
- This is **not insurance or legal advice**. Check what your insurer needs.
- It is for household belongings. Don't use it for medical or other regulated data.
- Not affiliated with Google, Anthropic, Supabase, Vercel or any insurance company.

## For the technically curious

- React 19 + Vite, installable PWA (vite-plugin-pwa)
- Vercel serverless functions in `api/` (Google sign-in, keep-alive, AI)
- Supabase: Postgres with row-level security, auth, private storage (`supabase/`)
- Google Drive API with the `drive.file` scope
- Claude API (Anthropic SDK): structured outputs for suggestions, web search for prices
- jsPDF for the report, pdf.js for PDF receipts, client-zip for the backup

To run it on a computer: install Node.js 20+, copy `.env.example` to `.env.local` and fill
it in, then run `npm install` and `npm run dev`.

**Advanced:** Settings → "Import from file" loads a JSON inventory in the format described at
the top of `src/lib/importer.js` (for moving over from another app).

## License

[MIT](LICENSE). Use it, change it, share it. No warranty.
