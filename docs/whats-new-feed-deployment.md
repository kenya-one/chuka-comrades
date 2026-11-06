# What's New feed: full community sync

The updated What's New page combines public information from:

- Campus Updates (published announcements, events, opportunities, sports and notices)
- Chuka Soko (public product listings)
- Hostels & Roommates (published hostels with available rooms)
- Chuka O Zone (approved anonymous posts only)
- Study Labs (public digital products)
- Chuka Efootball (public player profiles, account market posts and tournaments)
- Chuka Pool (active pool points and public pool tournaments)
- Chuka Premier League (public team directory)

No private WhatsApp numbers, payment references, private O Zone profiles or student records are copied into the feed.

## Deploy

1. Run `supabase/migrations/202611070001_landing_feed_all_communities.sql` in the Supabase SQL Editor.
2. In Supabase Edge Function secrets, configure:
   - `GAMES_API_URL` = the same Apps Script URL used by `VITE_GAMES_API_URL`
   - `CPL_API_URL` = the same Apps Script URL used by `VITE_CPL_API_URL`
   - `STUDY_LABS_API_URL` = the Apps Script URL used by Study Labs
   - Keep the existing `CHUKA_SOKO_APPS_SCRIPT_URL` and `HOSTEL_API_URL` secrets configured.
   - Set `FRONTEND_ORIGINS` to include your deployed website origin (and localhost during development), so the browser can call the sync function.
   - Optionally set `FRONTEND_URL` to the deployed site origin. If omitted, feed links use same-origin paths.
3. Deploy the updated function:
   `supabase functions deploy landing-feed-sync`
4. Open What's New and press Refresh. The sync is throttled to one run every five minutes. If one source is not configured or temporarily unavailable, its previous feed rows are retained and the other sources continue syncing.

## Image enlargement and mobile cards

- Chuka Soko already opens its full product gallery when the product photo is selected; the mobile product cards have been tightened to fit two columns on small phones.
- Efootball player and account images and Pool venue images open a full-screen viewer. Tap outside or press Escape to close.
- Game cards use two columns on small screens, with compact text and full-width actions to prevent horizontal overflow.
