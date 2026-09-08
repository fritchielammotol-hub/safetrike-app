-- ===========================================================================
-- SAKAY / SafeTrike - Database schema (Supabase / PostgreSQL)
-- ===========================================================================
-- HOW TO RUN THIS:
--   1. Open your Supabase project.
--   2. Go to the "SQL Editor".
--   3. Paste this whole file in and click "Run".
--
-- This replaces the old Firebase Firestore collections with real SQL tables.
-- Old Firestore path                         -> New table
--   artifacts/.../drivers, students, ...     -> profiles   (one row per user)
--   artifacts/.../rides                      -> rides
--   artifacts/.../driver_locations           -> driver_locations
--   artifacts/.../alerts                     -> alerts
--   (new)                                    -> trip_history
-- ===========================================================================

-- gen_random_uuid() and crypt() live in this extension. Supabase enables it
-- by default, but this line is here just in case.
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------------
-- profiles : one row per signed-in user, holding their role + details.
-- The "id" matches the user id created by Supabase Auth (auth.users.id).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                text not null default 'student'
                        check (role in ('student','parent','driver','guard','admin')),
  full_name           text default '',
  phone               text default '',          -- GCash / Maya number for drivers
  plate_number        text default '',          -- drivers only
  license_number      text default '',          -- drivers only
  address             text default '',
  verification_status text default 'Verified',  -- 'Pending' | 'Verified' | 'Rejected'
  rating              numeric default 0,        -- running average, updated by app
  created_at          timestamptz default now()
);


-- ---------------------------------------------------------------------------
-- rides : one row per booking. "path" stores the recorded GPS trail as a
-- JSON array of points: [{ "lat":.., "lng":.., "t":<ms>, "speed":<km/h> }, ...]
-- ---------------------------------------------------------------------------
create table if not exists public.rides (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid,                    -- who booked (may be a parent)
  driver_id      uuid,                    -- assigned driver, null until accepted
  student_name   text default '',
  origin_lat     double precision,
  origin_lng     double precision,
  dest_lat       double precision,
  dest_lng       double precision,
  status         text default 'Requested',
                   -- Requested -> Accepted -> Picked Up -> In Progress -> Completed
                   -- (also 'Emergency' when a panic alert is raised)
  otp            text default '',
  fare           integer default 0,
  passengers     text[] default '{}',     -- e.g. {student,student,senior}
  payment_method text default 'cash',     -- 'cash' | 'gcash'
  booking_source text default 'student',  -- 'student' | 'parent'
  rating         integer,                 -- 1..5, set after the trip
  comment        text,
  path           jsonb default '[]'::jsonb,
  created_at     timestamptz default now(),
  accepted_at    timestamptz,
  picked_up_at   timestamptz,
  completed_at   timestamptz
);

create index if not exists rides_status_idx    on public.rides (status);
create index if not exists rides_driver_id_idx  on public.rides (driver_id);
create index if not exists rides_student_id_idx on public.rides (student_id);


-- ---------------------------------------------------------------------------
-- driver_locations : the LATEST known position of each driver (one row each).
-- The driver app "upserts" (insert-or-update) this row a few times a minute.
-- Parents / students subscribe to it for the live moving marker.
-- ---------------------------------------------------------------------------
create table if not exists public.driver_locations (
  driver_id  uuid primary key references auth.users(id) on delete cascade,
  lat        double precision,
  lng        double precision,
  speed      integer default 0,          -- km/h
  heading    double precision,           -- degrees, optional
  updated_at timestamptz default now()
);


-- ---------------------------------------------------------------------------
-- alerts : panic / emergency events raised from the parent app.
-- ---------------------------------------------------------------------------
create table if not exists public.alerts (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid references public.rides(id) on delete set null,
  type       text default 'PANIC_EMERGENCY',
  lat        double precision,
  lng        double precision,
  status     text default 'ACTIVE',
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------------
-- trip_history : a permanent summary written ONCE when a ride is completed.
-- Parents browse this list to review past trips.
-- ---------------------------------------------------------------------------
create table if not exists public.trip_history (
  id               uuid primary key default gen_random_uuid(),
  ride_id          uuid,
  student_id       uuid,
  driver_id        uuid,
  driver_name      text default '',
  student_name     text default '',
  origin_lat       double precision,
  origin_lng       double precision,
  dest_lat         double precision,
  dest_lng         double precision,
  distance_km      numeric default 0,
  duration_seconds integer default 0,
  fare             integer default 0,
  payment_method   text default 'cash',
  path             jsonb default '[]'::jsonb,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz default now()
);

create index if not exists trip_history_student_id_idx on public.trip_history (student_id);
create index if not exists trip_history_created_at_idx on public.trip_history (created_at desc);


-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- The app passes { role, full_name } in the sign-up options; we read those
-- here so every user immediately has a profile with the right role.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- Realtime: let the browser subscribe to live changes on these tables.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.rides;
alter publication supabase_realtime add table public.driver_locations;
alter publication supabase_realtime add table public.alerts;


-- ===========================================================================
-- Row Level Security (RLS)
-- ===========================================================================
-- IMPORTANT (say this to your panel): these policies are DELIBERATELY OPEN.
-- Any signed-in user can read and write any row. That keeps the research
-- demo simple. A real deployment would lock rows down with auth.uid() so a
-- parent could only see their own child's rides, etc.
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.rides            enable row level security;
alter table public.driver_locations enable row level security;
alter table public.alerts           enable row level security;
alter table public.trip_history     enable row level security;

-- profiles
create policy "profiles read (any signed-in user)"
  on public.profiles for select to authenticated using (true);
create policy "profiles insert own row"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update own row"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- rides / driver_locations / alerts / trip_history : full access for any
-- signed-in user (demo only).
create policy "rides all"            on public.rides            for all to authenticated using (true) with check (true);
create policy "driver_locations all" on public.driver_locations for all to authenticated using (true) with check (true);
create policy "alerts all"           on public.alerts           for all to authenticated using (true) with check (true);
create policy "trip_history all"     on public.trip_history     for all to authenticated using (true) with check (true);

-- ===========================================================================
-- Done. Next: create your demo accounts - either through the app's
-- Sign Up screen, or in Dashboard -> Authentication -> Add user, or by
-- running supabase/seed.sql (optional).
-- ===========================================================================
