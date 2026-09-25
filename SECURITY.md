# Security & Privacy Review

Last reviewed: September 25, 2026

This app holds sensitive household information: your address, what you own, serial
numbers, receipts and values. It does **not** hold patient data (PHI) and must not be
used for it. HIPAA doesn't apply to this app, but it's treated with the same care.

## What protects your data (checked in the code)

| Area | Protection | Status |
|---|---|---|
| **Login** | One family email + password. No sign-up button, and new sign-ups are turned off in Supabase. | ✅ |
| **Database** | Row-level security on **every** table (homes, rooms, items, photos). Only our login can read or change our rows. Logged-out visitors get no access at all. Tested with a second fake account, which saw nothing. | ✅ |
| **Google key** | The long-term Google key is **encrypted** (AES-256) and stored in a table the phone can never read. Only the Vercel server functions can use it. The phone only ever gets a 1-hour pass. | ✅ |
| **Google Drive permission** | Only `drive.file`: the app can see **only files it created**, not the rest of your Drive. | ✅ |
| **Drive sharing** | The app never creates sharing links or changes sharing settings (the code contains no sharing calls). | ✅ |
| **Thumbnails** | Private Supabase bucket. Shown only through **temporary signed links (1 hour)**. Each login can only touch its own folder. | ✅ |
| **PDF / zip / CSV downloads** | Made **on the phone** and saved to the phone only. Never uploaded; no links. | ✅ |
| **Secrets** | No passwords or keys in the code or in its history. Server secrets live only in Vercel's settings, and none of them start with `VITE_`, so they can never reach the browser. | ✅ |
| **Browser protections** | Strict security headers (`vercel.json`): only our own code can run; data may only go to Supabase and Google; the app can't be embedded in other websites; the camera is allowed only for this app; search engines are told not to index it. All features were re-tested with these on. | ✅ |
| **Spreadsheet safety** | Text that starts with `=`, `+`, `-` or `@` is neutralized, so a spreadsheet can't treat it as a formula. | ✅ |
| **Libraries** | `npm audit`: 0 known vulnerabilities. | ✅ |
| **GitHub** | The code on GitHub contains **no data and no secrets**. Your photos and details live only in your Supabase project and Google Drive; your keys only in Vercel's settings. | ✅ |
| **AI assist (Claude)** | Only when you tap a ✨ button (for one item, or for the items you choose in a room): each item's photos/receipts (photos shrunk; PDF receipts sent as-is) and its current details go to Anthropic through our server, which holds the key (`ANTHROPIC_API_KEY`, never in the browser; only our login can use it). Anthropic does not train on API data by default and keeps it only for a limited time. Suggestions are never saved without your approval. | ✅ |

### Known limits (accepted)
- **The phone stays logged in.** That's convenient, but anyone holding your *unlocked* phone
  could open the app. A **screen lock** on the phone is the protection here.
- **Photos waiting to upload** are stored on the phone until they reach Drive (normally seconds).
- **Your Google account is the heart of the backup.** If it were lost or hacked, the Drive
  copy would be at risk. Hence 2-step verification, plus an occasional offline zip backup (below).
- **Supabase free tier** pauses after about a week without use. A daily keep-alive
  (`api/keepalive.js`, protected by the `CRON_SECRET` setting) prevents this and also keeps
  the Google key from expiring after 6 months unused. See DISASTER_RECOVERY.md.

## Your account checklist (please do these once)

- [ ] **2-step verification** turned on for **Google**, **GitHub**, **Vercel** and **Supabase**.
- [ ] **Supabase → Authentication → Sign In / Providers:** "Allow new users to sign up" is **OFF**.
- [ ] **Supabase → Authentication → URL Configuration:** set **Site URL** to your app's address
      (e.g. `https://house-inventory-abc.vercel.app`). That way a password-reset email links to
      your app instead of a placeholder address.
- [ ] **Supabase → Advisors → Security Advisor:** click **Rerun linter**. There should be no
      red "Error" items. (Yellow "Warning" items are worth a look; send them to me if unsure.)
- [ ] **Supabase → Table Editor:** homes, rooms, items, photos and google_connection each show
      **"RLS enabled"**. **Storage:** the **thumbnails** bucket shows **Private**.
- [ ] **Vercel → Settings → Deployment Protection:** "Vercel Authentication" is on (the default).
      This keeps test copies of the app private to you.
- [ ] **Vercel → Settings → Environment Variables:** the six secrets (including `CRON_SECRET` and `ANTHROPIC_API_KEY`) are marked **Sensitive**.
- [ ] **Google → myaccount.google.com/permissions:** "Home Inventory" appears, with access only
      to files it created.
- [ ] **Phone:** screen lock (PIN / fingerprint) is on.
- [ ] **Family password** is long (12+ characters) and saved in a password manager.
      It can be changed in the app under **Settings → Change password**.
