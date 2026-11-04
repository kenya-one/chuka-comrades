-- Chuka O Zone only. This migration does not alter Efootball or existing community tables.
create extension if not exists pgcrypto;

create table if not exists public.ozone_profiles (
  user_id text primary key,
  alias text not null check (char_length(alias) between 2 and 30),
  age smallint not null check (age between 18 and 100),
  gender text not null check (gender in ('female','male','other')),
  whatsapp text not null,
  consent_18 boolean not null default false check (consent_18 = true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ozone_payments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  amount_kes integer not null default 100 check (amount_kes = 100),
  mpesa_code text not null unique,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','refund_due','refunded')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  refund_mpesa_code text unique
);

create table if not exists public.ozone_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  payment_id uuid not null unique references public.ozone_payments(id) on delete restrict,
  category text not null check (category in ('dating','hookup')),
  seeking_gender text not null check (seeking_gender in ('female','male','any')),
  min_age smallint not null check (min_age between 18 and 100),
  max_age smallint not null check (max_age between 18 and 100),
  area text not null,
  intro text not null,
  -- These fields are filled by admin after removing identifying details.
  public_area text,
  public_summary text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','matched','closed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (min_age <= max_age)
);

create table if not exists public.ozone_interests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ozone_requests(id) on delete cascade,
  interested_user_id text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (request_id, interested_user_id)
);

create table if not exists public.ozone_connections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.ozone_requests(id) on delete restrict,
  requester_id text not null,
  interested_user_id text not null,
  status text not null default 'active' check (status in ('active','closed')),
  mutual_at timestamptz not null default now(),
  check (requester_id <> interested_user_id)
);

create table if not exists public.ozone_trendings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  body text not null check (char_length(body) between 10 and 1500),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists ozone_payments_user_status_idx
  on public.ozone_payments(user_id, status, expires_at);
create index if not exists ozone_requests_status_created_idx
  on public.ozone_requests(status, created_at desc);
create index if not exists ozone_interests_request_status_idx
  on public.ozone_interests(request_id, status);
create index if not exists ozone_connections_participants_idx
  on public.ozone_connections(requester_id, interested_user_id, mutual_at);

-- All O Zone data is accessed through the Firebase-token-verifying ozone-api Edge Function.
-- Do not grant browser roles direct access to profiles, payment references or matching records.
alter table public.ozone_profiles enable row level security;
alter table public.ozone_payments enable row level security;
alter table public.ozone_requests enable row level security;
alter table public.ozone_interests enable row level security;
alter table public.ozone_connections enable row level security;
alter table public.ozone_trendings enable row level security;

revoke all on public.ozone_profiles from anon, authenticated;
revoke all on public.ozone_payments from anon, authenticated;
revoke all on public.ozone_requests from anon, authenticated;
revoke all on public.ozone_interests from anon, authenticated;
revoke all on public.ozone_connections from anon, authenticated;
revoke all on public.ozone_trendings from anon, authenticated;

grant all on public.ozone_profiles to service_role;
grant all on public.ozone_payments to service_role;
grant all on public.ozone_requests to service_role;
grant all on public.ozone_interests to service_role;
grant all on public.ozone_connections to service_role;
grant all on public.ozone_trendings to service_role;

-- Atomic mutual-match creation. Only the service-role Edge Function can execute this.
create or replace function public.ozone_accept_interest(
  p_interest_id uuid,
  p_actor_uid text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_owner_uid text;
  v_interested_uid text;
  v_connection_id uuid;
begin
  select i.request_id, r.user_id, i.interested_user_id
    into v_request_id, v_owner_uid, v_interested_uid
  from public.ozone_interests i
  join public.ozone_requests r on r.id = i.request_id
  where i.id = p_interest_id
    and i.status = 'pending'
    and r.status = 'approved'
    and r.user_id = p_actor_uid
  for update of i, r;

  if v_request_id is null then
    raise exception 'This interest is no longer available or you are not the request owner.';
  end if;

  if not exists (
    select 1 from public.ozone_payments
    where user_id = v_owner_uid and status = 'approved' and expires_at > now()
  ) or not exists (
    select 1 from public.ozone_payments
    where user_id = v_interested_uid and status = 'approved' and expires_at > now()
  ) then
    raise exception 'Both members must have an active weekly membership to confirm a match.';
  end if;

  insert into public.ozone_connections(request_id, requester_id, interested_user_id)
  values (v_request_id, v_owner_uid, v_interested_uid)
  returning id into v_connection_id;

  update public.ozone_interests
  set status = 'accepted', updated_at = now()
  where id = p_interest_id;

  update public.ozone_requests
  set status = 'matched', reviewed_at = now()
  where id = v_request_id;

  return jsonb_build_object('connection_id', v_connection_id, 'status', 'matched');
end;
$$;

revoke all on function public.ozone_accept_interest(uuid, text)
from public, anon, authenticated;
grant execute on function public.ozone_accept_interest(uuid, text) to service_role;
