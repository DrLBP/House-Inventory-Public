# Disaster Recovery Guide

The goal: **if the phone and the house are both gone, everything can still be recovered.**

## Where your information lives

| Copy | What's in it | Survives if… |
|---|---|---|
| **Google Drive → "Home Inventory"** | All full-size photos and receipts (by home and room), `inventory-backup.csv` with every detail (refreshed after each change), monthly copies in "Backup history", and "READ ME FIRST.txt" | …the phone, the app **and** Supabase are all gone |
| **Supabase** | Item details and tiny previews (what the app shows) | …the phone is gone |
| **Full backup zip** (Reports → Download full backup) | Everything above in one file | …even your Google account is lost, **if** you keep a copy offline |

## What to do if…

**The phone is lost, stolen or destroyed**
1. On any phone or computer, open the app's web address and log in with the family email and password.
2. Everything is there. On a new phone, use Chrome → ⋮ → "Install app".
3. Reconnect Google Drive in Settings if asked.
4. Optional: change the family password (Settings → Change password), in case the old
   phone was unlocked.

**You need to file an insurance claim quickly**
- From the app: **Reports → Create PDF (email size)** and email it to the adjuster.
- Without the app: open Google Drive → Home Inventory → `inventory-backup.csv`, plus the room
  folders of photos. "READ ME FIRST.txt" explains the folder to anyone.

**The app says it can't connect / Supabase is paused**
- A daily keep-alive (run by Vercel) normally stops this. If it happens anyway, the app shows
  a red "Your database can't be reached" message with an **Open Supabase** button.
- Log in to **supabase.com**, open the project and click **Restore project**. Nothing is lost,
  but restore it promptly (Supabase keeps paused projects for a limited time). Supabase also
  emails the account owner about pausing.
- Meanwhile, Google Drive still has everything.

**Photos were deleted in Google Drive by mistake**
- Drive → **Trash** → right-click → **Restore** (possible for 30 days).
- Photos deleted *in the app* also go to Drive's Trash, so they're recoverable the same way.

**Items were deleted or changed by mistake**
- Drive → Home Inventory → right-click `inventory-backup.csv` → **Manage versions** for recent
  copies, or open **Backup history** for monthly copies.

**Forgot the family password**
- Supabase → Authentication → Users → the family user → **Send password recovery**. The
  email link opens the app logged in. Then go to **Settings → Change password**.
  (This needs the "Site URL" set; see SECURITY.md.)

**The app, Vercel or GitHub disappears**
- Google Drive (and any zip backup) still holds all photos and details. The zip's
  `inventory-data.json` contains everything in a form a new app could load.

**The Google account is lost or hacked**
- This is why the **offline zip backup** matters (below). Also keep Google's recovery phone
  number and email up to date.

## Good habits
- **Every few months:** Reports → **Download full backup** on Wi-Fi. Copy the zip to a
  computer or an encrypted USB drive kept **outside the house** (e.g. at work or in a
  safe-deposit box). Then delete it from the phone's Downloads.
- **After big purchases:** snap the item and its receipt the same day.
- **Every year or two (re-inventory):** walk through each room. **Keep the old photos**: dated
  photos prove how long you've owned things. Add new room overview photos; add new items; delete
  items that are gone; add a photo only if something's condition changed; refresh values with
  ✨ Suggest for items (choose All, only "Look up current prices"). Then tap "Mark reviewed today"
  at the bottom of the room.

## Disaster drill (do this once)
Do this once, on a **computer** (not the phone), to prove recovery works:
1. Open **drive.google.com** → **Home Inventory**. You should see **READ ME FIRST.txt**,
   **inventory-backup.csv**, **Backup history**, and a folder for each home.
2. Open **inventory-backup.csv**. Pick two items. Using the "Photo files" column, find
   their photos in the right room folder. Check a photo's date and description.
3. Open **Backup history** and check this month's copy is there.
4. In the computer's browser, open the app's address and log in. You should see the same
   homes, rooms, items and photos as on your phone.
5. Optional: download a full backup (Reports → Download full backup), open it and check it matches.
