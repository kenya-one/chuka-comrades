-- Chuka Efootball schema. Apply in Supabase SQL Editor.
-- The application currently signs users in with Firebase. Do NOT enable public writes
-- or expose private contact columns until a Firebase-token-verifying Edge Function is deployed.
create extension if not exists pgcrypto;

create table if not exists public.efootball_members (
  user_id text primary key,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.efootball_player_submissions (
  id uuid primary key default gen_random_uuid(), user_id text not null,
  username text not null, whatsapp text not null, squad_image_url text,
  mpesa_code text not null, fee_kes integer not null default 30 check (fee_kes=30),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), reviewed_at timestamptz
);

create table if not exists public.efootball_market_submissions (
  id uuid primary key default gen_random_uuid(), user_id text not null,
  username text not null, listing_type text not null check (listing_type in ('buy','sell')),
  asking_price numeric(12,2), description text not null, market_image_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), reviewed_at timestamptz
);

create table if not exists public.efootball_tournament_submissions (
  id uuid primary key default gen_random_uuid(), user_id text not null,
  name text not null, poster_url text, max_members integer not null check (max_members between 2 and 256),
  room_number text not null, instructions text,
  status text not null default 'pending' check (status in ('pending','open','full','completed','rejected')),
  winner text, created_at timestamptz not null default now(), reviewed_at timestamptz
);

-- Backwards-compatible addition for existing Supabase projects.
alter table public.efootball_market_submissions add column if not exists market_image_url text;

-- Public player view intentionally excludes phone numbers and payment references.
create or replace view public.efootball_public_listings as
 select id, username, squad_image_url, 'player'::text as listing_type,
        null::numeric as asking_price, null::text as description, status, created_at
 from public.efootball_player_submissions where status='approved';

-- Approved account listings are exposed separately; no contact fields are included.
drop view if exists public.efootball_market_public;
create view public.efootball_market_public as
 select id, username, listing_type, asking_price, description, market_image_url, status, created_at
 from public.efootball_market_submissions where status='approved';

create table if not exists public.efootball_private_contacts (
  listing_id uuid primary key, owner_firebase_uid text not null, whatsapp text not null,
  created_at timestamptz not null default now()
);

-- Storage bucket for squad and tournament images.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('efootball-media','efootball-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- IMPORTANT SECURITY DEPLOYMENT CHECKLIST:
-- 1) Enable RLS on all four submission/member tables and private contacts.
-- 2) Deny anon direct writes and deny public SELECT on private contacts.
-- 3) Deploy Firebase-ID-token-verifying Edge Functions for create submission,
--    admin approve/reject, and member-only contact retrieval.
-- 4) Edge Function must verify Firebase JWT (aud=Firebase project ID), enforce
--    admin allowlist, and only return a phone number to an approved member.
-- 5) Do not rely on the VITE_EFOOTBALL_ADMIN_EMAIL variable as authorization.

-- Enable row-level security. The browser app authenticates through Firebase,
-- so writes and private-contact reads must be proxied through a server/Edge Function
-- that verifies the Firebase ID token. Do not add permissive anon policies.
alter table public.efootball_members enable row level security;
alter table public.efootball_player_submissions enable row level security;
alter table public.efootball_market_submissions enable row level security;
alter table public.efootball_tournament_submissions enable row level security;
alter table public.efootball_private_contacts enable row level security;
revoke all on public.efootball_members from anon, authenticated;
revoke all on public.efootball_private_contacts from anon, authenticated;
revoke all on public.efootball_player_submissions from anon, authenticated;
revoke all on public.efootball_market_submissions from anon, authenticated;
revoke all on public.efootball_tournament_submissions from anon, authenticated;
grant select on public.efootball_public_listings to anon, authenticated;
grant select on public.efootball_market_public to anon, authenticated;

-- =========================================================
-- EFOOTBALL ADDITIONS: MARKETPLACE, TOURNAMENTS, APPROVAL
-- =========================================================

-- Public tournament view: expose only non-sensitive tournament information.
create or replace view public.efootball_tournaments_public as
select
  id,
  name,
  poster_url,
  max_members,
  status,
  winner,
  created_at
from public.efootball_tournament_submissions
where status in ('open', 'full');

grant select on public.efootball_tournaments_public to anon, authenticated;
-- Marketplace listings require an approved player registration.
create or replace function public.efootball_require_approved_player()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.efootball_player_submissions p
    where p.user_id = new.user_id
      and p.status = 'approved'
  ) then
    raise exception 'An approved Efootball player registration is required before creating a marketplace listing.';
  end if;

  return new;
end;
$$;

drop trigger if exists efootball_market_require_player
on public.efootball_market_submissions;

create trigger efootball_market_require_player
before insert or update of user_id
on public.efootball_market_submissions
for each row
execute function public.efootball_require_approved_player();

-- Atomically approve a player and activate their membership.
create or replace function public.efootball_approve_player(p_submission_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
begin
  select user_id
  into v_user_id
  from public.efootball_player_submissions
  where id = p_submission_id
    and status in ('pending', 'approved')
  for update;

  if v_user_id is null then
    raise exception 'Player submission not found or cannot be approved.';
  end if;

  update public.efootball_player_submissions
  set status = 'approved',
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.efootball_members (user_id, status)
  values (v_user_id, 'approved')
  on conflict (user_id)
  do update set status = 'approved';

  return v_user_id;
end;
$$;

-- Only the server-side service role may execute the approval function.
revoke all on function public.efootball_approve_player(uuid)
from public, anon, authenticated;

grant execute on function public.efootball_approve_player(uuid)
to service_role;

