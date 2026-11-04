-- Public, moderated content feed used by the Chuka Comrades landing page.
-- Run this in Supabase SQL Editor. Do not put private student records in this table.
create table if not exists public.landing_feed (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in (
    'marketplace', 'hostels', 'events', 'sports', 'discussions', 'digital_products', 'opportunities'
  )),
  title text not null,
  description text,
  image_url text,
  price text,
  location text,
  link_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists landing_feed_published_created_idx
  on public.landing_feed (is_published, created_at desc);

alter table public.landing_feed enable row level security;

drop policy if exists "Anyone can read published landing feed" on public.landing_feed;
create policy "Anyone can read published landing feed"
  on public.landing_feed for select
  using (is_published = true);

grant select on public.landing_feed to anon, authenticated;

-- Enable Realtime for this table in Supabase Dashboard > Database > Publications
-- if it is not already enabled. The page also refreshes automatically every 60 seconds.
