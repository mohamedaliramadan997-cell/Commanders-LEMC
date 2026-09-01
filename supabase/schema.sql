-- ============================================================
-- COMMANDERS LEMC — MEMBERSHIP & ATTENDANCE PLATFORM
-- Supabase (Postgres) schema, roles, and security policies
-- ============================================================
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query
-- > paste this whole file > Run.
-- ============================================================

-- ---------- CHAPTERS (Egypt / KSA / UAE) ----------
create table chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into chapters (name) values ('UAE'), ('Egypt'), ('KSA');

-- ---------- PROFILES (one row per logged-in officer/admin) ----------
-- Supabase Auth creates a row in auth.users automatically when someone
-- signs in; this table adds the "who are they in the club" info and the
-- read-only vs full-access role.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'officer' check (role in ('admin', 'officer')),
  chapter_id uuid references chapters (id),
  created_at timestamptz not null default now()
);

-- Every new auth.users signup automatically gets a profile row (role
-- defaults to 'officer' — you promote yourself to 'admin' once, manually,
-- see README "First-time setup").
create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'officer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- MEMBERS (Master Record) ----------
create table members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  membership_level text not null default 'Hang-around'
    check (membership_level in ('Hang-around', 'Prospect', 'Full-Batch', 'Honor Member')),
  officer_title text,
  chapter_id uuid references chapters (id),
  city text,
  neighborhood text,
  date_joined date not null default current_date,
  promotion_date_prospect date,
  promotion_date_fullbatch date,
  mobile text,
  whatsapp text,
  email text,
  date_of_birth date,
  bike_model text,
  profession text,
  riding_experience text,
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_mobile text,
  photo_url text,
  bike_photo_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- RIDES (one row per official ride date) ----------
create table rides (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters (id),
  ride_date date not null,
  label text,
  created_at timestamptz not null default now(),
  unique (chapter_id, ride_date)
);

-- ---------- ATTENDANCE (one row per member per ride) ----------
create table attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  ride_id uuid not null references rides (id) on delete cascade,
  status text not null check (status in ('attended', 'missed', 'excused')),
  marked_by uuid references profiles (id),
  marked_at timestamptz not null default now(),
  unique (member_id, ride_id)
);

-- ---------- INTAKE SUBMISSIONS (public join-form landing zone) ----------
-- Anyone with the link can submit here (no login required). Nothing here
-- becomes an official member until the Admin reviews it and clicks
-- "Add to Master Record" in the dashboard — this keeps the public form
-- from being able to write directly into your official roster.
create table intake_submissions (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  chapter_id uuid references chapters (id),
  city text,
  neighborhood text,
  mobile text,
  whatsapp text,
  email text,
  date_of_birth date,
  bike_model text,
  profession text,
  riding_experience text,
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_mobile text,
  submitted_at timestamptz not null default now(),
  reviewed boolean not null default false
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table members enable row level security;
alter table rides enable row level security;
alter table attendance enable row level security;
alter table intake_submissions enable row level security;
alter table chapters enable row level security;

-- Helper: is the current logged-in user an admin?
create function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Helper: is the current request logged in at all (admin or officer)?
create function is_logged_in()
returns boolean as $$
  select auth.uid() is not null;
$$ language sql security definer stable;

-- CHAPTERS — anyone logged in can read; only admin can change
create policy "chapters_read" on chapters for select using (is_logged_in());
create policy "chapters_write" on chapters for all using (is_admin()) with check (is_admin());

-- PROFILES — you can read your own profile; admin can read/manage everyone's
create policy "profiles_self_read" on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles_admin_write" on profiles for update using (is_admin()) with check (is_admin());

-- MEMBERS — admin: full read/write. Officer: read-only. Public: no access.
create policy "members_admin_all" on members for all using (is_admin()) with check (is_admin());
create policy "members_officer_read" on members for select using (is_logged_in());

-- RIDES — same pattern
create policy "rides_admin_all" on rides for all using (is_admin()) with check (is_admin());
create policy "rides_officer_read" on rides for select using (is_logged_in());

-- ATTENDANCE — admin: full read/write. Officer: read-only.
create policy "attendance_admin_all" on attendance for all using (is_admin()) with check (is_admin());
create policy "attendance_officer_read" on attendance for select using (is_logged_in());

-- INTAKE SUBMISSIONS — anyone (even logged-out visitors) can INSERT only.
-- Only admin can read/review/delete. No one can update except admin.
create policy "intake_public_insert" on intake_submissions for insert with check (true);
create policy "intake_admin_read" on intake_submissions for select using (is_admin());
create policy "intake_admin_manage" on intake_submissions for update using (is_admin());
create policy "intake_admin_delete" on intake_submissions for delete using (is_admin());

-- ============================================================
-- Done. Next: see README.md "First-time setup" to create your
-- Admin account and invite officers.
-- ============================================================
