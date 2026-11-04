-- Chuka Comrades hostel directory: landlord submissions, admin approval and public contact consent.
-- This migration is additive. It does not alter Efootball, O Zone or other community tables.

create extension if not exists pgcrypto;

-- Ensure the base hostel tables exist even if the optional roommate add-on
-- migration has not yet been applied in this Supabase project.
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

create table if not exists public.hostel_private_contacts (
  hostel_id uuid primary key references public.hostel_listings(id) on delete cascade,
  landlord_contact text not null,
  updated_at timestamptz not null default now()
);

alter table public.hostel_listings enable row level security;
alter table public.hostel_private_contacts enable row level security;
drop policy if exists "Public can view published hostels" on public.hostel_listings;
create policy "Public can view published hostels"
  on public.hostel_listings for select using (status = 'published');

alter table public.hostel_private_contacts
  add column if not exists public_contact boolean not null default false;

create table if not exists public.hostel_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by text not null,
  name text not null,
  description text,
  area text not null,
  landmark text,
  location_url text,
  image_urls text[] not null check (cardinality(image_urls) = 2),
  rent_amount integer not null check (rent_amount >= 0),
  rent_period text not null check (rent_period in ('month','semester')),
  room_type text not null,
  total_rooms integer check (total_rooms is null or total_rooms >= 0),
  available_rooms integer not null default 0 check (available_rooms >= 0),
  available_from date,
  facilities text[] not null default '{}',
  landlord_name text not null,
  landlord_whatsapp text not null,
  contact_public boolean not null default true,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_note text,
  listing_id uuid references public.hostel_listings(id) on delete set null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hostel_submissions_pending_idx
  on public.hostel_submissions(status, created_at desc);

alter table public.hostel_submissions enable row level security;
revoke all on public.hostel_submissions from anon, authenticated;

-- Only explicitly consented contacts on published listings are visible to the public.
drop policy if exists "Public can view consented published landlord contacts" on public.hostel_private_contacts;
create policy "Public can view consented published landlord contacts"
  on public.hostel_private_contacts for select
  using (
    public_contact = true
    and exists (
      select 1 from public.hostel_listings h
      where h.id = hostel_private_contacts.hostel_id
        and h.status = 'published'
    )
  );

grant select on public.hostel_listings to anon, authenticated;
grant select on public.hostel_private_contacts to anon, authenticated;

create or replace view public.hostel_listings_public
with (security_invoker = true) as
select
  h.id, h.name, h.description, h.area, h.landmark, h.location_url,
  h.image_urls, h.rent_amount, h.rent_period, h.room_type,
  h.total_rooms, h.available_rooms, h.occupied_rooms, h.available_from,
  h.facilities, h.contact_name, c.landlord_contact, h.verified,
  h.status, h.created_at, h.availability_updated_at
from public.hostel_listings h
join public.hostel_private_contacts c on c.hostel_id = h.id
where h.status = 'published' and c.public_contact = true;

grant select on public.hostel_listings_public to anon, authenticated;

-- Public photos are readable, but uploads are performed only by the authenticated Edge Function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hostel-media', 'hostel-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
