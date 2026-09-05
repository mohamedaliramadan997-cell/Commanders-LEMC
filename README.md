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

The Join form uploads both a personal photo and a bike photo directly
(see "v1.1 update" below) — no separate Google Drive step needed for
new joiners. Existing members added before this update can have their
photo fields updated on Master Record (currently as a pasted link;
direct upload there may come in a future update).

---

## Known limitations (v1)

- No automated email/WhatsApp notifications — the Dashboard and Admin
  page are where you check what needs attention.
- Deleting a ride date or member isn't exposed in the UI yet (do it
  from Supabase's Table Editor directly if you ever need to).
- The public intake form has no spam protection (e.g. CAPTCHA) — fine
  for a link you share directly with prospective joiners, but don't
  post it somewhere fully public without adding that later.

---

## v1.1 update — logo, auto-correction, photo uploads, riding experience by year

If you already set up v1, here's what changed and what you need to do:

### 1. Run the new migration
In Supabase → SQL Editor → New query, paste and run
`supabase/migration_2.sql`. It only *adds* columns and storage buckets —
nothing in your existing data is touched.

### 2. Add your real club logo
Drop your logo file into `docs/assets/` and name it exactly `logo.png`
(a square, high-resolution image — 500×500px or larger works well). The
join form will pick it up automatically; until you add it, a plain
placeholder badge shows instead so the page never looks broken.

### 3. What's new on the Join form (`intake.html`)
- Club logo centered at the top, with a welcome message that includes
  "Gold Black Nation" and "Respect All... Fear None."
- Every text field auto-corrects capitalization and extra/duplicate
  spacing when you tab out of it (and again right before submitting) —
  e.g. `"  ahmed   hosny "` becomes `"Ahmed Hosny"`. Bike brand acronyms
  typed in caps (BMW, KTM) are left alone rather than being lowercased.
- **Riding Experience** is now a 0–70 years dropdown. Behind the scenes
  it's stored as the year they started riding, so next year the same
  member's experience shows one year higher automatically — nobody
  has to go back and edit it.
- **Bike Model** has guiding placeholder text: "Brand, Model, Year."
- **Personal photo** and **bike photo** are real uploads now (not a
  pasted link), with a preview shown after picking a file. Uploaded
  photos land in Supabase Storage and the file's public URL is saved
  automatically.
- **Every field is required** — the form won't submit with anything
  missing, including both photos.

### 4. What's new on Master Record (`members.html`)
- The same "Riding Experience" dropdown (auto-updating year math) is
  used when editing an existing member.
- Bike Model shows the same "Brand, Model, Year" guiding text.
- Auto-correction is intentionally **not** applied here — Master Record
  is where you make deliberate manual edits, so nothing changes your
  typing automatically on this page.

### 5. What's new on Admin (`admin.html`)
- New intake submissions now show a small circular photo thumbnail and
  a link to the bike photo, plus their riding-since year, so you can
  sanity-check a submission at a glance before approving it.
- Approving a submission now carries the photos and riding experience
  straight into the new Master Record entry — nothing to re-enter.

---

## v1.2 update — full detail view, edit/delete on Master Record, submission review modal, mobile pass

### 1. Run nothing new in Supabase
This update is code-only — no new migration needed.

### 2. What's new on Master Record (`members.html`)
- Clicking a member now opens a **read-only profile view** first — a
  proper profile card with their photo, bike photo, rank, title, and
  every field laid out for easy reading. Nothing changes by accident;
  you have to deliberately click **Edit** to modify anything.
- **Edit** switches the same window into an editable form (Save / Cancel).
  Cancel discards changes and returns to the read-only view.
- **Delete Record** requires two steps: click it, then confirm on a
  distinct red warning panel showing the member's name — a stray click
  can no longer delete someone by accident.
- **Rank** (Hang-around / Prospect / Full-Batch / Honor Member) and
  **Officer Title** are both editable right there. This is the same
  `membership_level` field the Admin page's one-click promotion
  approval writes to — editing it here or approving a promotion on
  Admin both update the same record, so they can never drift apart.

> Note: you wrote "Owner Member" in your request — I've kept it as
> **Honor Member**, matching your original club data and the rest of
> the platform. Let me know if you actually want a distinct "Owner"
> rank added instead.

### 3. What's new on Admin (`admin.html`)
- Each new intake submission is now a clickable card. Clicking it opens
  the full application — every field, both photos — in an editable
  form, so you can fix a typo or fill in something missing before it
  becomes an official record.
- From that same window: **Approve & Add to Master Record** (uses your
  edits, if any) or **Dismiss** (now also asks for a second
  confirmation before removing it from the queue).

### 4. Mobile-friendly pass
- All the new detail/edit windows resize properly on phones, stack to
  a single column, and scroll independently of the page behind them.
- Tables, stat cards, and forms across the app already collapsed to a
  single column below ~820px; this update extends the same treatment
  to the new profile view and review windows, and tightens table/text
  sizing further below ~640px (typical phone width).

### Files that changed in this update
Replace: `docs/members.html`, `docs/js/members.js`, `docs/js/admin.js`,
`docs/css/style.css`. Add (new file): `docs/js/modal.js`.
`docs/intake.html` and `docs/js/intake.js` are also included again in
this package unchanged from the last update, to eliminate any doubt
about a stale copy being the cause of the confirmation-message issue.

---

## v1.3 update — photo pan/zoom adjustment, bike photo moved to bottom of profile

### 1. Run the new migration
In Supabase → SQL Editor → New query, paste and run
`supabase/migration_3.sql`. Purely additive — adds six numeric columns
to `members` and six to `intake_submissions` for storing each photo's
zoom level and pan position. No existing data is touched.

### 2. What's new
- **Photo framing is now adjustable, without re-uploading.** Both on
  the Admin submission-review screen (before you approve someone) and
  on Master Record's Edit view (for existing members), each photo now
  shows with a **Zoom** slider and **Horizontal/Vertical position**
  sliders underneath it. Drag them and the preview updates live —
  once you save/approve, that framing is remembered everywhere the
  photo is shown.
- **Bike photo moved to the bottom** of the Master Record profile
  view — personal photo and info now come first, bike photo sits
  below the details grid.

### How it works
Rather than cropping and re-saving the image file itself, the
platform stores three small numbers per photo (zoom, horizontal
position, vertical position) and uses them to control how the
existing photo is framed inside its circle/rectangle — the same way a
phone's camera app lets you drag to reposition a contact photo. This
is simpler and faster than a full image editor, and works for both
faces (personal photo) and vehicles (bike photo).

### Files that changed in this update
Replace: `docs/js/members.js`, `docs/js/admin.js`, `docs/css/style.css`.
Add (new files): `docs/js/photoAdjust.js`, `supabase/migration_3.sql`.

---

## v1.4 update — bigger/full bike photos, touch drag & pinch-zoom, birthday notifications, WhatsApp summary

### 1. Run the new migration
In Supabase → SQL Editor → New query, paste and run
`supabase/migration_4.sql`. Adds one new table (`notification_acks`)
for tracking which birthday reminders you've already acknowledged.
Purely additive.

### 2. Bike photos — bigger, and shows the whole photo by default
The bike photo frame is now much larger (up to ~480px tall on Master
Record, ~380px in the Admin review/edit windows) and, at the default
zoom level, shows the **entire photo uncropped** — no more guessing
what got cut off. If you do want to crop in on a detail, zooming in
past 1x switches to the usual fill-the-frame behavior.

### 3. Touch drag & pinch-to-zoom
Both photo adjustment screens (Admin review, Master Record edit) now
respond to:
- **Drag directly on the photo** (finger or mouse) to reposition it.
- **Pinch with two fingers** (or scroll/trackpad on desktop) to zoom.
- The sliders are still there too — drag/pinch and sliders stay in
  sync with each other, use whichever is easier in the moment.

### 4. Birthday notifications + sidebar badge
- A new **Notifications** panel at the top of the Admin page shows
  any member whose birthday is **tomorrow**, with an **Acknowledge**
  button — once acknowledged, it won't show again until next year's
  birthday.
- The sidebar's "Admin — Review & Approve" link now shows a **red
  circle with a number** whenever there's anything needing your
  attention — new intake submissions, promotion-ready members, and
  birthday reminders are all counted together. Taking action on any
  of them (approve, dismiss, acknowledge) updates the number
  immediately, no page reload needed. This badge appears on every
  page's sidebar, not just Admin.

### 5. WhatsApp — what's built now, and what a fuller integration would need
I've added a **"Send Summary via WhatsApp"** button on the Admin page,
plus a **"Send via WhatsApp"** button on each birthday reminder. These
open WhatsApp (app or web) with a message already typed out — you
pick who to send it to (yourself, another officer, a group) and tap
send. No setup, no cost, works today.

**What this is not**: a message that lands on your phone automatically
without you opening the platform. That would need a proper WhatsApp
Business API integration (via Meta directly or a provider like
Twilio), which involves:
- Creating and verifying a WhatsApp Business account
- Getting message templates pre-approved by Meta
- A small server-side function (e.g. a Supabase Edge Function) that
  runs on a daily schedule and calls the WhatsApp API
- An ongoing per-message cost (typically small, but not free)

That's a genuinely separate, bigger project with real account setup
only you can do (I can't create business accounts on your behalf).
If you want to go that route, let me know and we can plan it as its
own phase — the groundwork here (the notifications table and pending
logic) is already built in a way that a scheduled function could
reuse directly.

### Files that changed in this update
Replace: `docs/js/members.js`, `docs/js/admin.js`, `docs/js/auth.js`,
`docs/css/style.css`, `docs/admin.html`. Add (new files):
`docs/js/photoAdjust.js` (replacing the earlier version),
`docs/js/notifications.js`, `supabase/migration_4.sql`.

---

## v1.6 update — photo display fix, real photo re-upload, rolling birthday list, Attendance Tracker edit-lock + ride delete + seasons

### 1. Run the new migration
In Supabase → SQL Editor → New query, paste and run
`supabase/migration_5.sql`. Adds a `seasons` table, adds a `season_id`
column to `rides`, and automatically files every ride you already have
into a "Season 1" record so nothing currently on your Attendance
Tracker disappears. Purely additive.

### 2. Photo overlap bug — fixed
Root cause: the pan/zoom effect uses `transform: scale()`, but the
read-only profile view wasn't wrapping photos in a frame that clips
overflow, so a zoomed-in photo visually ballooned past its circle/box
and over nearby text and buttons. Both the personal photo circle and
the bike photo now sit inside a proper clipping frame, matching how
the edit screens already worked correctly.

### 3. Real photo re-upload on Master Record
Editing a member now shows an actual **file upload** button under each
photo (labeled "Replace" if one exists, "Upload" if not) — pick a new
file, it uploads immediately, resets the framing to default, and you
can then adjust and Save as normal. No more needing to manually paste
a URL.

### 4. Notifications — always shows the next 3 upcoming birthdays
Rebuilt as a rolling, always-populated list: the 3 members with the
nearest upcoming birthday, nearest first, labeled "Today!", "Tomorrow",
or "In N days." As soon as one passes, it recalculates to next year
automatically and the next-nearest member takes its place — no
acknowledgment step needed. (The sidebar's red badge now counts only
genuine action items — new submissions and promotion-ready members —
since a birthday isn't something to "approve" or "dismiss.")

### 5. Attendance Tracker — Edit lock, batched save, ride deletion
- The grid is **read-only by default**. Click **Edit** to unlock it —
  clicking cells now queues changes locally (nothing is saved yet) and
  shows a running "N unsaved change(s)" count. Click **Save Changes**
  to commit everything at once, or **Discard** to throw the queued
  changes away and leave the real data untouched.
- Each ride's column header now has a small **✕** (visible only in
  Edit mode) to delete that ride entirely. Clicking it doesn't delete
  immediately — the header switches to a **Yes / No** confirmation
  first, same protective pattern as deleting a member record.

### 6. Seasons — close one, start a new one, keep archives accessible
- A **Season** dropdown now sits above the grid. Your existing rides
  were automatically filed into "Season 1."
- **Close Season & Start New** (Admin only, only shown while viewing
  the active season) closes the current season — it becomes a
  permanent, **read-only archive** — and creates a new active one you
  name yourself, in one step.
- Switching the dropdown to any past season shows that season's grid
  exactly as it was, with editing, ride deletion, and "Add Ride"
  disabled — a clean historical record.
- **Important:** promotion streaks, attendance %, and poor-attendance
  warnings always look across a member's **entire ride history, every
  season combined** — closing a season never resets anyone's progress.
  Only which ride *columns* are displayed changes per season.

### On your promotion-status question
A few likely explanations for why the 3 test rides didn't move the
needle, worth checking in order:
1. **Required streak**: Hang-around → Prospect needs **4** consecutive
   rides, not 3 — at 3, the Promotion Status column should already
   show *"1 ride away — review soon"* in gold. If it still shows *"In
   progress"* with no gold flag, something else is off.
2. **Date Joined vs ride dates**: a ride only counts toward a member's
   streak if its date is on/after their "Date Joined (Hang-around)"
   field on Master Record. If your 3 test rides were dated *before*
   that field's value, they're silently excluded. Worth double
   checking that field for your test member.
3. **Rank**: promotion tracking only applies to Hang-around and
   Prospect. If the test member is already Full-Batch or an Honor
   Member, there's no "next rank" to track toward, so the column
   correctly always shows "—".
4. **Where promotion alerts actually show**: they're in the **"READY
   FOR PROMOTION APPROVAL"** panel on the Admin page — a separate
   panel from **Notifications** (which is birthdays only). If you were
   checking Notifications for a promotion alert, that's the mismatch —
   nothing was missing, it's just filed under a different panel.
5. Also worth confirming the 3 cells actually show green
   checkmarks (attended) and not red (missed) or amber (excused) —
   easy to click one too many times while testing and land on the
   wrong status.

If you check all of the above and it's still not updating after using
the new Edit → Save Changes flow, let me know which of these you've
ruled out and I'll dig further.

### What "Streak" means
It's the count of **consecutive rides a member has attended in a row**,
counting backward from the most recent ride, without an unexcused
miss breaking it. A few specifics:
- An **excused** absence doesn't break the streak — it's simply
  skipped, as if that ride didn't happen for streak purposes.
- Any **unexcused miss** resets the streak straight back to 0.
- This is what promotion is measured against: **4** in a row moves a
  Hang-around to Prospect, **8** in a row moves a Prospect to
  Full-Batch.
- There's a second, separate streak — **consecutive misses** — which
  is what triggers the red "poor attendance" warning at 3 in a row.
  It works the same way in reverse (attending resets it to 0, excused
  is skipped, only real unexcused misses count).

### Files that changed in this update
Replace: `docs/js/members.js`, `docs/js/admin.js`, `docs/js/utils.js`,
`docs/js/intake.js`, `docs/css/style.css`, `docs/attendance.html`.
Add (new files): `docs/js/attendance.js` (full rewrite),
`docs/js/notifications.js` (full rewrite), `supabase/migration_5.sql`.

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
