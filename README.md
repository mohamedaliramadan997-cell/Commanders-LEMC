# Commanders LEMC — UAE Chapter Platform

A membership & attendance platform for Commanders LEMC, built as plain
HTML/CSS/JavaScript (hosted free on GitHub Pages) backed by Supabase
(free hosted Postgres database + login + storage — no server to run or
pay for).

- **Master Record** — full member roster with contact, bike, emergency
  contact, and rank info.
- **Attendance Tracker** — click-to-mark grid grouped Full-Batch →
  Prospect → Hang-around → Honor Members, with live attendance %,
  promotion streaks, and poor-attendance warnings.
- **Intake Form** — public link, no login required, feeds a review
  queue (not directly into the roster — see "Why a review queue" below).
- **Admin page** — one-click promotion approval, one-click "add this
  intake submission to the roster," and officer role management.
- **Access control** — you (Admin) have full read/write. Officers you
  invite get strictly read-only access, tied to their own individual
  login — nothing shared.

---

## Why this stack

| Piece | What it does | Cost |
|---|---|---|
| **GitHub Pages** | Hosts the HTML/CSS/JS files | Free |
| **Supabase** | Database, login, file storage, security rules | Free tier (plenty for a club this size) |

Nothing here needs a server you maintain. You push code to GitHub;
GitHub Pages serves it. The browser talks directly to Supabase.

---

## First-time setup

### 1. Create your Supabase project
1. Go to [supabase.com](https://supabase.com) → Sign up → **New project**.
2. Pick a name (e.g. `commanders-lemc-uae`), a strong database password
   (save it somewhere safe), and a region close to the UAE.
3. Wait ~2 minutes for it to spin up.

### 2. Run the database schema
1. In your Supabase project, go to **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy the whole file, paste
   it in, and click **Run**.
3. This creates every table, security rule, and the auto-profile trigger.

### 3. Get your API keys
1. Go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `docs/js/supabaseClient.js` in this repo and paste them into
   `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

> The anon key is safe to put in public client-side code — it can only
> do what the Row Level Security rules in `schema.sql` allow, which is
> why we set those up first.

### 4. Create your own Admin account
1. In Supabase, go to **Authentication → Users → Add user**.
2. Enter your own email and a password. Click **Create user**.
3. This automatically creates a `profiles` row for you with role
   `officer` (the default for everyone). To make yourself Admin, go to
   **Table Editor → profiles**, find your row, and change `role` from
   `officer` to `admin`. Save.
4. That's it — you're the sole Admin.

### 5. Push this code to GitHub and turn on Pages
1. Create a new repository on GitHub (public or private both work).
2. Upload this whole folder's contents to the repo (drag-and-drop the
   files/folders on the GitHub web "Add file → Upload files" screen
   works fine, or use `git push` if you're comfortable with that).
3. Go to your repo's **Settings → Pages**.
4. Under "Build and deployment," set **Source: Deploy from a branch**,
   **Branch: main**, **Folder: /docs**. Save.
5. GitHub gives you a live URL in a minute or two, e.g.
   `https://yourusername.github.io/commanders-lemc-platform/`.

### 6. Try it
- Visit `.../login.html` and sign in with the Admin account you made.
- Visit `.../intake.html` — this is the public link you'll share with
  new joiners.
- Add your first ride date on **Attendance Tracker**, add a member (or
  approve an intake submission) on **Master Record** / **Admin**, and
  click through the ride grid to mark attendance.

---

## Inviting an officer (read-only access)

1. Supabase → **Authentication → Users → Add user**. Enter their
   email, set a temporary password, share it with them privately (they
   can't reset it themselves unless you also set up email sending —
   see "Optional: email invites" below).
2. That's it. They automatically get role `officer` = read-only
   everywhere. You can see and manage everyone's role on the **Admin**
   page in the app.
3. To later make someone else an Admin (e.g. if you hand off the
   Secretary role), use the "Make Admin" button on that same page.

### Optional: email invites instead of manual passwords
Supabase can send a proper "set your password" email instead of you
handing out a temporary one. This needs a few extra minutes configuring
an email provider in **Authentication → Email Templates / SMTP
Settings** in Supabase — worth doing once you have more than a couple
of officers. Not required to get started.

---

## Why a review queue instead of auto-adding intake submissions

The original spec asked for new joiners to be added to the roster
automatically. In practice, letting a public, no-login form write
directly into your official Master Record is a security risk (anyone
with the link could, in principle, spam or corrupt your roster) and
also removes your ability to sanity-check a submission before it
becomes official. Instead:

- The public form writes to a separate `intake_submissions` table that
  **only you (Admin) can read**.
- On the **Admin** page, you see every new submission and click **Add
  to Master Record as Hang-around** — one click, same end result, but
  with a chance to catch typos or spam first.

---

## Photos (member + bike photos)

This build doesn't include file upload yet — `photo_url` and
`bike_photo_url` are plain text fields where you paste a link (e.g. to
a photo you've uploaded to Google Drive/Photos with link sharing on).
Supabase does support real file uploads (Storage buckets) if you want
this to become a proper upload button later — that's a good "v2"
addition once the core platform is running smoothly.

---

## Known limitations (v1)

- No file upload for photos yet (see above) — paste a link instead.
- No automated email/WhatsApp notifications — the Dashboard and Admin
  page are where you check what needs attention.
- Deleting a ride date or member isn't exposed in the UI yet (do it
  from Supabase's Table Editor directly if you ever need to).
- The public intake form has no spam protection (e.g. CAPTCHA) — fine
  for a link you share directly with prospective joiners, but don't
  post it somewhere fully public without adding that later.

---

## File structure

```
commanders-lemc-platform/
  README.md
  supabase/
    schema.sql          <- run this once in Supabase SQL Editor
  docs/                  <- GitHub Pages serves this folder
    index.html            Dashboard
    login.html             Officer/Admin sign-in
    members.html            Master Record
    attendance.html          Attendance Tracker
    admin.html                Review & Approve (Admin only)
    intake.html                 Public join form
    css/style.css
    js/
      supabaseClient.js    <- put your Project URL + anon key here
      auth.js
      streaks.js           <- attendance %, streak, promotion logic
      members.js
      attendance.js
      admin.js
```
