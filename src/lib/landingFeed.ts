import { campusApi } from "./campusApi";
import { hostelApi } from "./hostelApi";
import { listStudyItems, str } from "./studyLabs";
import { cplApi } from "./cplApi";
import { gamesApi, formatDate, formatTime, type Tournament } from "./gamesApi";

/**
 * Pulls public, already-approved items straight from every page's own source so the
 * "What's new" cards fill in without depending on the server-side sync.
 * Each source is independent: if one fails it simply returns nothing.
 */
export type FeedItem = {
  id: string; section: string; title: string; description: string | null; image_url: string | null;
  price: string | null; location: string | null; link_url: string | null; created_at: string;
};


/** Makes any stored image address safe to load from this site (https, correct base path). */
export function resolveImage(url: unknown): string | null {
  let u = String(url ?? "").trim();
  if (!u || u === "null" || u === "undefined") return null;
  if (/^(data:|blob:)/i.test(u)) return u;
  if (u.startsWith("//")) u = `https:${u}`;
  else if (/^http:\/\//i.test(u)) u = u.replace(/^http:/i, "https:");
  else if (u.startsWith("/")) u = `${import.meta.env.BASE_URL}${u.slice(1)}`;
  else if (!/^https:\/\//i.test(u)) u = `${import.meta.env.BASE_URL}${u}`;
  return u;
}
const driveId = (u: string) =>
  u.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1] || u.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || u.match(/googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/)?.[1] || "";
/** Same fallbacks Chuka Soko uses: the stored URL first, then other public Google Drive forms. */
export function imageCandidates(url: string): string[] {
  const id = driveId(url);
  return id
    ? Array.from(new Set([url, `https://drive.google.com/thumbnail?id=${id}&sz=w800`, `https://lh3.googleusercontent.com/d/${id}=w800`, `https://drive.google.com/uc?export=view&id=${id}`]))
    : [url];
}

const PER_SOURCE = 6;
const clip = (v: unknown, n: number): string | null => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
};
const kes = (n: unknown) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;
const iso = (v: unknown): string => {
  const d = new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
};
const driveThumb = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const stored = String(o.driveUrl || o.url || "");
    const id = String(o.driveFileId || "") || stored.match(/[?&]id=([^&]+)/)?.[1] || "";
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w800` : stored || null;
  }
  return String(value);
};

/* ---- Chuka Soko (marketplace) ---- */
const SOKO_BASE = (import.meta.env.VITE_CHUKA_SOKO_API_URL ||
  (import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chuka-soko-api` : "")) as string;
async function sokoItems(): Promise<FeedItem[]> {
  if (!SOKO_BASE) return [];
  const url = new URL(SOKO_BASE.replace(/\/$/, ""));
  url.searchParams.set("action", "products");
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const res = await fetch(url.toString(), { headers: key ? { apikey: key } : {} });
  const json = await res.json();
  const list: Array<Record<string, unknown>> = Array.isArray(json?.data) ? json.data : [];
  return list
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p?.id || p?.productId)
    .filter(({ p }) => p.title && String(p.availability || "").toLowerCase() !== "sold out" && String(p.status || "active").toLowerCase() !== "hidden")
    .sort((a, b) => b.index - a.index)
    .slice(0, PER_SOURCE)
    .map(({ p, index }) => {
      const store = (p.store || {}) as Record<string, unknown>;
      return {
        id: `soko-${p.id || p.productId}`, section: "marketplace", title: clip(p.title, 90)!,
        description: clip(p.description, 140),
        image_url: driveThumb(Array.isArray(p.images) ? p.images[0] : undefined),
        price: p.price ? kes(p.price) : null, location: clip(p.location || store.location, 60), link_url: null,
        created_at: iso(p.createdAt || p.created_at || new Date(Date.now() - index * 1000)),
      };
    });
}

/* ---- Hostels & Roommates ---- */
async function hostelItems(): Promise<FeedItem[]> {
  const { listings } = await hostelApi.publicListings();
  return listings
    .filter((h) => h.id && h.name && h.status !== "unavailable" && Number(h.available_rooms || 0) > 0)
    .slice(0, PER_SOURCE)
    .map((h) => {
      const rooms = Number(h.available_rooms || 0);
      const bits = [clip(h.room_type, 40), `${rooms} room${rooms === 1 ? "" : "s"} available`, h.verified ? "Verified" : null].filter(Boolean);
      return {
        id: `hostel-${h.id}`, section: "hostels", title: clip(h.name, 90)!, description: bits.join(" · "),
        image_url: h.image_urls?.[0] || null,
        price: h.rent_amount ? `${kes(h.rent_amount)} / ${h.rent_period === "semester" ? "semester" : "month"}` : null,
        location: clip(h.area, 60), link_url: null, created_at: iso((h as unknown as Record<string, unknown>).created_at || h.available_from),
      };
    });
}

/* ---- Chuka O Zone (approved anonymous messages only) ---- */
async function ozoneItems(): Promise<FeedItem[]> {
  // Profiles are 18+ and only visible to signed-in members, so the landing page shows counts only:
  // never an alias, area, bio or contact. If the new action is not deployed yet this simply adds nothing.
  const [messagesResult, profilesResult] = await Promise.allSettled([
    campusApi<{ messages: Array<{ id: string; body: string; kind: string; created_at: string }> }>(null, "anon_approved"),
    campusApi<{ total: number; recent: number; latest_at: string | null }>(null, "profiles_feed_public"),
  ]);
  if (messagesResult.status === "rejected" && profilesResult.status === "rejected") throw messagesResult.reason;
  const profileItems: FeedItem[] = [];
  if (profilesResult.status === "fulfilled" && profilesResult.value.total > 0) {
    const { total, recent, latest_at } = profilesResult.value;
    profileItems.push({
      id: `ozone-profiles-${total}-${recent}`, section: "discussions", title: recent > 0 ? `${recent} new O Zone profile${recent === 1 ? "" : "s"} this week` : "O Zone profiles",
      description: `${total} active profile${total === 1 ? "" : "s"} on Chuka O Zone. Sign in and accept the rules to browse and request introductions.`,
      image_url: null, price: null, location: null, link_url: null, created_at: iso(latest_at),
    });
  }
  const r = messagesResult.status === "fulfilled" ? messagesResult.value : { messages: [] };
  const label: Record<string, string> = { confession: "Anonymous confession", question: "Anonymous question", message: "Anonymous message" };
  return [...profileItems, ...(r.messages || [])
    .filter((m) => m.body && ["message", "confession", "question"].includes(m.kind))
    .slice(0, PER_SOURCE)
    .map((m) => ({
      id: `ozone-${m.id}`, section: "discussions", title: label[m.kind] || "Anonymous message",
      description: clip(m.body, 160), image_url: null, price: null, location: null, link_url: null, created_at: iso(m.created_at),
    }))];
}

/* ---- Study Labs / Project Hub (digital products) ---- */
async function studyItems(): Promise<FeedItem[]> {
  const items = await listStudyItems("Products");
  return items
    .filter((i) => str(i, "id") && str(i, "title"))
    .slice(0, PER_SOURCE)
    .map((i) => {
      const price = Number(i.price_kes) || 0;
      const cover = str(i, "cover_url");
      return {
        id: `study-${str(i, "id")}`, section: "digital_products", title: clip(str(i, "title"), 90)!,
        description: clip(str(i, "description"), 140), image_url: cover || null,
        price: price === 0 ? "Free" : kes(price), location: null, link_url: null,
        created_at: iso(str(i, "created_at", "createdAt")),
      };
    });
}

/* ---- Chuka Premier League (results, fixtures, news) ---- */
async function cplItems(): Promise<FeedItem[]> {
  const b = await cplApi.bootstrap();
  const teamName = new Map((b.teams || []).map((t) => [t.id, t.name]));
  const fixtureById = new Map((b.fixtures || []).map((f) => [f.id, f]));
  const out: FeedItem[] = [];

  for (const r of b.results || []) {
    if (r.status !== "official") continue;
    const f = fixtureById.get(r.fixtureId);
    if (!f) continue;
    out.push({
      id: `cpl-result-${r.fixtureId}`, section: "sports", title: "Full time",
      description: `${teamName.get(f.homeTeamId) || "Home"} ${r.homeScore} – ${r.awayScore} ${teamName.get(f.awayTeamId) || "Away"}`,
      image_url: null, price: null, location: clip(f.venue, 60), link_url: null,
      created_at: iso(r.verifiedAt || f.kickoffAt),
    });
  }
  const now = Date.now();
  for (const f of b.fixtures || []) {
    if (f.status !== "scheduled" || new Date(f.kickoffAt).getTime() < now - 6 * 3600000) continue;
    out.push({
      id: `cpl-fixture-${f.id}`, section: "sports", title: "Upcoming match",
      description: `${teamName.get(f.homeTeamId) || "Home"} vs ${teamName.get(f.awayTeamId) || "Away"} · ${new Date(f.kickoffAt).toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      image_url: null, price: null, location: clip(f.venue, 60), link_url: null, created_at: iso(f.kickoffAt),
    });
  }
  for (const n of b.news || []) {
    out.push({
      id: `cpl-news-${n.id}`, section: "sports", title: clip(n.title, 90) || "CPL news",
      description: clip(n.body, 140), image_url: null, price: null, location: null, link_url: null, created_at: iso(n.createdAt),
    });
  }
  return out.sort((a, b2) => new Date(b2.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, PER_SOURCE);
}

/* ---- Chuka Efootball & Chuka Pool (tournaments, accounts for sale, pool points) ---- */
// Public data only. Organizer / seller WhatsApp numbers and room codes are never read here.
const tournamentItem = (t: Tournament, section: "efootball" | "pool"): FeedItem => {
  const status = t.status === "open" ? "Registration open" : t.status === "full" ? "Registration closed" : t.winner ? `Winner: ${t.winner}` : "Completed";
  const when = [t.date ? formatDate(t.date) : "", t.time ? formatTime(t.time) : ""].filter(Boolean).join(" · ");
  const bits = [when, `${t.registered}/${t.max} players`, status].filter(Boolean);
  const when_ms = new Date(`${t.date}T00:00:00`).getTime();
  return {
    id: `${section}-tournament-${t.id}`, section, title: clip(t.name, 90) || "Tournament", description: bits.join(" · "),
    image_url: driveThumb(t.poster) || null, price: null, location: null, link_url: null,
    // An upcoming date must not sort ahead of "now", so it is clamped.
    created_at: Number.isNaN(when_ms) ? new Date(0).toISOString() : new Date(Math.min(when_ms, Date.now())).toISOString(),
  };
};
async function efootballItems(): Promise<FeedItem[]> {
  const [tournaments, market] = await Promise.allSettled([gamesApi.tournaments("eFootball"), gamesApi.market()]);
  if (tournaments.status === "rejected" && market.status === "rejected") throw tournaments.reason;
  const out: FeedItem[] = [];
  if (tournaments.status === "fulfilled") out.push(...tournaments.value.filter((t) => t.id && t.game !== "Pool").slice(0, PER_SOURCE).map((t) => tournamentItem(t, "efootball")));
  if (market.status === "fulfilled") {
    out.push(...market.value.filter((l) => l.id && String(l.status || "").toLowerCase() !== "sold").slice(0, PER_SOURCE).map((l) => ({
      id: `efootball-account-${l.id}`, section: "efootball", title: "eFootball account for sale",
      description: clip(l.description, 120) || `Seller: ${l.username}`, image_url: driveThumb(l.image) || null,
      price: l.price ? kes(l.price) : null, location: null, link_url: null, created_at: iso(l.created),
    })));
  }
  return out;
}
async function poolItems(): Promise<FeedItem[]> {
  const [tournaments, points] = await Promise.allSettled([gamesApi.tournaments("Pool"), gamesApi.poolPoints()]);
  if (tournaments.status === "rejected" && points.status === "rejected") throw tournaments.reason;
  const out: FeedItem[] = [];
  if (tournaments.status === "fulfilled") out.push(...tournaments.value.filter((t) => t.id).slice(0, PER_SOURCE).map((t) => tournamentItem(t, "pool")));
  if (points.status === "fulfilled") {
    out.push(...points.value.filter((p) => p.id && p.name && (p.status || "active").toLowerCase() !== "hidden").slice(0, 3).map((p, i) => ({
      id: `pool-point-${p.id}`, section: "pool", title: clip(p.name, 90)!, description: clip(p.description, 130) || "Pool point",
      image_url: driveThumb(p.image) || null, price: null, location: clip(p.location, 60), link_url: null,
      created_at: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    })));
  }
  return out;
}

/** Loads every source in parallel. Returns whatever succeeded; never throws. */
export async function loadDirectFeed(): Promise<{ items: FeedItem[]; okCount: number }> {
  const results = await Promise.allSettled([sokoItems(), hostelItems(), ozoneItems(), studyItems(), cplItems(), efootballItems(), poolItems()]);
  const items: FeedItem[] = [];
  let okCount = 0;
  for (const r of results) {
    if (r.status === "fulfilled") { okCount += 1; items.push(...r.value); }
    else console.warn("What's new: a source could not be loaded", r.reason);
  }
  return { items: items.map((i) => ({ ...i, image_url: resolveImage(i.image_url) })), okCount };
}
