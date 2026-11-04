-- Chuka Comrades hostel + roommate add-on.
-- Review before applying. RLS is enabled; no browser write policies are created here.
-- Connect writes to your existing verified admin/Edge Function flow.
create extension if not exists pgcrypto;

create table if not exists public.hostel_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  area text not null,
  landmark text,
  location_url text,
  image_urls text[] not null default '{}',
  rent_amount integer not null check (rent_amount >= 0),
  rent_period text not null default 'month' check (rent_period in ('month','semester')),
  room_type text not null,
  total_rooms integer check (total_rooms is null or total_rooms >= 0),
  available_rooms integer not null default 0 check (available_rooms >= 0),
  occupied_rooms integer check (occupied_rooms is null or occupied_rooms >= 0),
  available_from date,
  facilities text[] not null default '{}',
  contact_name text,
  verified boolean not null default false,
  availability_updated_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep landlord phone numbers in a separate table with no public read policy.
create table if not exists public.hostel_private_contacts (
  hostel_id uuid primary key references public.hostel_listings(id) on delete cascade,
  landlord_contact text not null,
  updated_at timestamptz not null default now()
);
alter table public.hostel_private_contacts enable row level security;

create table if not exists public.roommate_posts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  course text,
  study_year text,
  gender text,
  area text not null,
  budget_min integer not null default 0 check (budget_min >= 0),
  budget_max integer not null default 0 check (budget_max >= budget_min),
  move_in_date date,
  accommodation_type text not null,
  listing_type text not null check (listing_type in ('seeking_roommate','has_room')),
  roommates_needed integer not null default 1 check (roommates_needed >= 1),
  lifestyle text,
  message text,
  private_contact text not null,
  status text not null default 'pending' check (status in ('pending','published','matched','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hostel_listings_public_idx
  on public.hostel_listings(status, area);
create index if not exists roommate_posts_public_idx
  on public.roommate_posts(status, area, listing_type);

alter table public.hostel_listings enable row level security;
alter table public.roommate_posts enable row level security;

-- Public can view published hostel listing fields. Landlord phone numbers live in
-- hostel_private_contacts, which has RLS enabled and deliberately has no public policy.
drop policy if exists "Public can view published hostels" on public.hostel_listings;
create policy "Public can view published hostels"
  on public.hostel_listings for select
  using (status = 'published');

-- Roommate private_contact must never be selected by public client queries.
-- Prefer a public view containing only approved public fields:
create or replace view public.roommate_posts_public
with (security_barrier = true) as
select id, display_name, course, study_year, gender, area, budget_min, budget_max,
       move_in_date, accommodation_type, listing_type, roommates_needed,
       lifestyle, message, status, created_at
from public.roommate_posts
where status = 'published';

-- No insert/update/delete policies are intentionally added. Use a server-side
-- function with verified admin/student identity and input validation.
