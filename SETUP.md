# Setting up your own copy

About 1–2 hours. No coding, just careful copying and pasting. Do the parts **in order**,
because later parts need addresses and keys from earlier ones.

**Keep a private note open** (for example in your password manager) to collect these values
as you go. Several are secrets: never post them, email them or put them in any file on GitHub.

| Name | Where it comes from | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Part 2 | no |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Part 2 | no |
| `SUPABASE_SECRET_KEY` | Part 2 | **yes** |
| `APP_SECRET` | Part 1 (you make it up) | **yes** |
| `CRON_SECRET` | Part 1 (you make it up) | **yes** |
| `GOOGLE_CLIENT_ID` | Part 4 | no |
| `GOOGLE_CLIENT_SECRET` | Part 4 | **yes** |
| `ANTHROPIC_API_KEY` | Part 6 (optional) | **yes** |

---

## Part 1: Accounts and two made-up passwords

1. Create free accounts (turn on 2-step verification for each):
   [GitHub](https://github.com), [Vercel](https://vercel.com) (sign in with GitHub),
   [Supabase](https://supabase.com). You need a Google account too.
2. In your password manager, generate **two** long random passwords (40+ characters, letters
   and numbers). Save them as `APP_SECRET` and `CRON_SECRET`.
   - `APP_SECRET` encrypts your Google key. If you ever change it, you'll just need to
     reconnect Google Drive in the app.

## Part 2: Supabase (your database)

1. Supabase → **New project**. Pick a name, a strong database password (save it), and the
   region closest to you. Wait for it to finish setting up.
2. **SQL Editor** → **New query**. Open [`supabase/setup-all.sql`](supabase/setup-all.sql),
   copy **everything**, paste it in, and click **Run**. You should see "Success".
3. **Authentication → Users → Add user → Create new user.** Enter the email and password
   you'll use to log in to the app. Tick **Auto Confirm User**.
4. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up".
   Only the user you just created can ever log in.
5. Collect three values:
   - **Project Settings → Data API:** the **Project URL** → `VITE_SUPABASE_URL`
     (it looks like `https://abcdefgh.supabase.co`)
   - **Project Settings → API Keys:** the **Publishable key** (starts with `sb_publishable_`)
     → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Same page, **Secret keys**: create or reveal one (starts with `sb_secret_`)
     → `SUPABASE_SECRET_KEY`. **This one is a secret.**

## Part 3: Your copy of the code, on Vercel

1. On this project's GitHub page, click **Fork** (top right) to copy it into your GitHub
   account. Your copy contains **code only**. Your photos and details never go to GitHub.
2. Vercel → **Add New… → Project** → **Import** your fork. It detects "Vite" by itself.
3. Before clicking Deploy, open **Environment Variables** and add every value from your note
   **except the two Google ones and the Anthropic one** (you don't have those yet):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_SECRET`,
   `CRON_SECRET`. Names must match exactly (underscores, capitals).
4. Click **Deploy**. When it's done, note your app's address, for example
   `https://home-inventory-abc123.vercel.app`. Below, **YOUR-APP** means that address.
5. Open YOUR-APP on your phone or computer and log in with the user from Part 2. You should
   see an empty "Homes" screen.
6. Back in Supabase → **Authentication → URL Configuration:** set **Site URL** to YOUR-APP.
   (Password-reset emails then link to your app.)

## Part 4: Google Drive connection

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a **New Project**
   (for example "Home Inventory").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **Google Auth Platform** (search for it at the top) → **Get started**:
   - App name: "Home Inventory"; support email: yours.
   - Audience: **External**. Contact email: yours. Agree and **Create**.
4. **Branding:** fill in
   - App home page: `YOUR-APP`
   - Privacy policy: `YOUR-APP/privacy.html` (it's already included in the app)
   - Authorized domains: your app's domain **without** `https://`, for example
     `home-inventory-abc123.vercel.app`
5. **Data Access → Add or remove scopes:** tick `.../auth/drive.file` ("See, edit, create and
   delete only the specific Google Drive files you use with this app"). Save.
6. **Clients → Create client:** type **Web application**. Under **Authorized redirect URIs**
   add exactly `YOUR-APP/api/google/callback` (for example
   `https://home-inventory-abc123.vercel.app/api/google/callback`). Create, then copy the
   **Client ID** → `GOOGLE_CLIENT_ID` and **Client secret** → `GOOGLE_CLIENT_SECRET`.
7. **Audience → Publish app** (status becomes "In production").
   **Important:** while it says "Testing", Google disconnects the app after 7 days.
8. In Vercel → your project → **Settings → Environment Variables**, add `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET`. Then **Deployments → ⋯ on the latest → Redeploy**
   (new settings only apply after a redeploy).
9. In the app: **Settings (gear icon) → Connect Google Drive.** If Google says it hasn't
   verified the app, click **Advanced → Go to Home Inventory**: it's your own app.
   Afterwards your Drive has a "Home Inventory" folder with "READ ME FIRST.txt".

## Part 5: Install it on your phone

- **Android (Chrome):** open YOUR-APP → ⋮ menu → **Install app** (or "Add to Home screen").
- **iPhone (Safari):** open YOUR-APP → Share → **Add to Home Screen**. (Built and tested
  mainly on Android; iPhone should work but has had less testing.)

Create a home, add a room, tap **Add New** and take a photo. Within seconds it should appear
in your Drive folder.

## Part 6 (optional): ✨ AI assist with Claude

1. [console.anthropic.com](https://console.anthropic.com) → create an account → **Billing**:
   add a small amount of credit (for example $10–20).
2. **Limits:** set a monthly **spend limit** you're comfortable with.
3. **API Keys → Create key** → `ANTHROPIC_API_KEY`.
4. Add it in Vercel (Settings → Environment Variables) and **Redeploy**.
5. Open an item → ✨ **Suggest details from photos.** Watch your usage in the Console for the
   first few rooms to see what it really costs.

Without this key the rest of the app works normally; only the ✨ buttons will show an error.

## Part 7: Finish the security checklist

Go through **"Your account checklist"** in [`SECURITY.md`](SECURITY.md) once (2-step
verification, sign-ups off, mark Vercel variables as Sensitive, and so on), and read
[`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) so you know where everything lives.

---

## If something doesn't work

- **"Setup needed" screen:** the two `VITE_` values are missing or misspelled in Vercel.
  Fix them and Redeploy.
- **Login says "Invalid path specified in request URL":** `VITE_SUPABASE_URL` should be just
  `https://xxxx.supabase.co`, nothing after it (the app trims it, but check anyway).
- **Google says "redirect_uri_mismatch":** the redirect URI in Part 4 step 6 must match your
  app's address exactly, including `https://` and `/api/google/callback`.
- **Changed a setting in Vercel but nothing happened:** Redeploy.
- **Google Drive disconnects after a week:** the Google app is still in "Testing"; do Part 4
  step 7.
- **"Your database can't be reached":** Supabase paused the free project. Log in to Supabase
  and click **Restore project**. The daily keep-alive normally prevents this.

## Getting updates

When this project gets improvements, open your fork on GitHub and click **Sync fork**.
Vercel redeploys by itself. If an update adds a new file in `supabase/` (for example
`009_...sql`), run just that file in the Supabase SQL Editor, as its notes say.
