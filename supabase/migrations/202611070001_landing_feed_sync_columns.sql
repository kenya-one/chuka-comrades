-- Columns and state table the landing-feed-sync function needs (they were missing from landing_feed.sql).
alter table public.landing_feed add column if not exists source text;
alter table public.landing_feed add column if not exists source_key text;
create unique index if not exists landing_feed_source_key_idx on public.landing_feed (source_key);

alter table public.landing_feed drop constraint if exists landing_feed_section_check;
alter table public.landing_feed add constraint landing_feed_section_check check (section in (
  'marketplace','hostels','events','sports','discussions','digital_products','opportunities','campus_updates'
));

create table if not exists public.landing_feed_sync_state (
  id int primary key,
  last_run timestamptz not null default 'epoch'
);
insert into public.landing_feed_sync_state (id) values (1) on conflict (id) do nothing;
alter table public.landing_feed_sync_state enable row level security;
