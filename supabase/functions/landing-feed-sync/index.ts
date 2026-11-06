import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Fills public.landing_feed (the "What's new" page) from live sources:
 *   - Chuka Soko   (Google Sheet via Apps Script)  -> section "marketplace"
 *   - Hostels      (Apps Script)                   -> section "hostels"
 *   - Chuka O Zone (approved anonymous messages)   -> section "discussions"
 *   - Study Labs   (Project Hub, Apps Script)      -> section "digital_products"   [needs STUDY_LABS_API_URL]
 *
 * Safe by design:
 *   - Only public, already-approved data is copied. No contact numbers, names or private O Zone profiles.
 *   - Throttled: runs at most once every 5 minutes no matter how often it is called.
 *   - A source that fails keeps its existing rows (nothing is deleted on a failed fetch).
 *   - Rows added by hand (source IS NULL) are never touched.
 */
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceKey) throw new Error("Missing environment variables.");

const list = (v?: string) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const origins = list(Deno.env.get("FRONTEND_ORIGINS") || "http://localhost:5173");
const SOKO_URL = Deno.env.get("CHUKA_SOKO_APPS_SCRIPT_URL") || "";
const HOSTEL_URL = Deno.env.get("HOSTEL_API_URL") ||
  "https://script.google.com/macros/s/AKfycbxtB8jELgHp4N_8PxigHI20siQAl3neMQcwtGhjF0GN81RZzHmwPBRVZyAzRMwB7tWX/exec";
const STUDY_URL = Deno.env.get("STUDY_LABS_API_URL") || "";
const THROTTLE_MINUTES = 5;
const PER_SOURCE = 12;

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = {
  source: string; source_key: string; section: string; title: string;
  description: string | null; image_url: string | null; price: string | null;
  location: string | null; link_url: string | null; created_at?: string;
};

const cors = (o: string | null) => ({
  ...(o && origins.includes(o) ? { "Access-Control-Allow-Origin": o } : {}),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});
const json = (d: unknown, s = 200, o: string | null = null) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

/* ---------------------------------------------------------------- helpers */
const clip = (v: unknown, n: number): string | null => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
};
const validDate = (v: unknown): string | undefined => {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000 ? undefined : d.toISOString();
};
const kes = (n: unknown) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;
const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map(String).filter(Boolean); } catch { /* not JSON */ }
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
};
const driveThumb = (image: Record<string, unknown> | undefined): string | null => {
  if (!image) return null;
  const stored = String(image.driveUrl || image.url || "");
  const id = String(image.driveFileId || "") || stored.match(/[?&]id=([^&]+)/)?.[1] || "";
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w800` : (stored || null);
};

/** Apps Script answers either plain JSON or JSONP (cb({...})). Handle both. */
async function fetchScript(base: string, params: Record<string, string>): Promise<any> {
  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  const text = (await res.text()).trim();
  const wrapped = text.match(/^[\w$.]+\(([\s\S]*)\);?$/);
  return JSON.parse(wrapped ? wrapped[1] : text);
}

/* ---------------------------------------------------------------- sources */
async function sokoRows(): Promise<Row[]> {
  if (!SOKO_URL) throw new Error("CHUKA_SOKO_APPS_SCRIPT_URL is not set.");
  const result = await fetchScript(SOKO_URL, { action: "products" });
  const data: any[] = Array.isArray(result?.data) ? result.data : [];
  return data
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p?.productId && p?.title && String(p.availability || "").toLowerCase() !== "sold out")
    .sort((a, b) => (Number(isTrue(b.p.featured)) - Number(isTrue(a.p.featured))) || b.index - a.index)
    .slice(0, PER_SOURCE)
    .map(({ p }) => ({
      source: "soko", source_key: `soko:${p.productId}`, section: "marketplace",
      title: clip(p.title, 90)!, description: clip(p.description, 140),
      image_url: driveThumb(Array.isArray(p.images) ? p.images[0] : undefined),
      price: p.price ? kes(p.price) : null, location: clip(p.location, 60), link_url: null,
      created_at: validDate(p.createdAt || p.created_at),
    }));
}
const isTrue = (v: unknown) => v === true || String(v).toLowerCase() === "true";

async function hostelRows(): Promise<Row[]> {
  const result = await fetchScript(HOSTEL_URL, { action: "public_listings" });
  if (!result?.success) throw new Error(result?.error || "Hostel service error.");
  const data: any[] = Array.isArray(result.hostels) ? result.hostels : [];
  return data
    .filter((h) => h?.id && h?.name && h.status !== "unavailable" && Number(h.available_rooms || 0) > 0)
    .slice(0, PER_SOURCE)
    .map((h) => {
      const rooms = Number(h.available_rooms || 0);
      const bits = [clip(h.room_type, 40), `${rooms} room${rooms === 1 ? "" : "s"} available`, isTrue(h.verified) ? "Verified" : null].filter(Boolean);
      return {
        source: "hostels", source_key: `hostel:${h.id}`, section: "hostels",
        title: clip(h.name, 90)!, description: bits.join(" · "),
        image_url: asArray(h.image_urls)[0] || null,
        price: h.rent_amount ? `${kes(h.rent_amount)} / ${h.rent_period === "semester" ? "semester" : "month"}` : null,
        location: clip(h.area, 60), link_url: null, created_at: validDate(h.created_at),
      };
    });
}

async function ozoneRows(): Promise<Row[]> {
  // Only admin-approved anonymous messages that are already public on the O Zone page.
  // Private profiles, intro requests and contact details are never read here.
  const { data, error } = await db.from("anon_messages")
    .select("id,body,kind,created_at").eq("status", "approved")
    .in("kind", ["message", "confession", "question"])
    .order("created_at", { ascending: false }).limit(PER_SOURCE);
  if (error) throw error;
  const label: Record<string, string> = { confession: "Anonymous confession", question: "Anonymous question", message: "Anonymous message" };
  return (data || []).map((m: any) => ({
    source: "ozone", source_key: `ozone:${m.id}`, section: "discussions",
    title: label[m.kind] || "Anonymous message", description: clip(m.body, 160),
    image_url: null, price: null, location: null, link_url: null, created_at: validDate(m.created_at),
  }));
}

async function studyRows(): Promise<Row[]> {
  if (!STUDY_URL) throw new Error("STUDY_LABS_API_URL is not set.");
  const result = await fetchScript(STUDY_URL, { action: "list", table: "Products", limit: String(PER_SOURCE) });
  if (!result?.ok) throw new Error(result?.error || "Study Labs error.");
  const items: any[] = Array.isArray(result.items) ? result.items : [];
  return items.filter((i) => i?.id && i?.title).slice(0, PER_SOURCE).map((i) => {
    const price = Number(i.price_kes) || 0;
    return {
      source: "study", source_key: `study:${i.id}`, section: "digital_products",
      title: clip(i.title, 90)!, description: clip(i.description, 140),
      image_url: i.cover_url ? String(i.cover_url) : null, price: price === 0 ? "Free" : kes(price),
      location: null, link_url: null, created_at: validDate(i.created_at),
    };
  });
}

/* ------------------------------------------------------------------- sync */
async function syncSource(name: string, load: () => Promise<Row[]>) {
  let rows: Row[];
  try { rows = await load(); }
  catch (e) { console.error(`landing-feed-sync: ${name} failed`, e); return { name, ok: false as const }; }

  const withDate = rows.filter((r) => r.created_at);
  const withoutDate = rows.filter((r) => !r.created_at).map(({ created_at: _c, ...r }) => r);
  for (const batch of [withDate, withoutDate]) {
    if (!batch.length) continue;
    const { error } = await db.from("landing_feed")
      .upsert(batch.map((r) => ({ ...r, is_published: true })), { onConflict: "source_key" });
    if (error) { console.error(`landing-feed-sync: ${name} upsert failed`, error); return { name, ok: false as const }; }
  }

  // Remove rows for items that are no longer public (sold out, hidden, deleted).
  const { data: existing } = await db.from("landing_feed").select("source_key").eq("source", name);
  const keep = new Set(rows.map((r) => r.source_key));
  const stale = (existing || []).map((r: any) => r.source_key as string).filter((k) => !keep.has(k));
  if (stale.length) await db.from("landing_feed").delete().in("source_key", stale);
  return { name, ok: true as const, count: rows.length, removed: stale.length };
}

Deno.serve(async (req) => {
  const o = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(o) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, o);
  try {
    // Atomically claim the run slot so concurrent visitors cannot trigger parallel syncs.
    const threshold = new Date(Date.now() - THROTTLE_MINUTES * 60000).toISOString();
    const { data: claimed, error } = await db.from("landing_feed_sync_state")
      .update({ last_run: new Date().toISOString() }).eq("id", 1).lt("last_run", threshold).select("id");
    if (error) throw error;
    if (!claimed?.length) return json({ synced: false, reason: "recently synced" }, 200, o);

    const results = await Promise.all([
      syncSource("soko", sokoRows), syncSource("hostels", hostelRows),
      syncSource("ozone", ozoneRows), syncSource("study", studyRows),
    ]);
    return json({ synced: true, results }, 200, o);
  } catch (e) {
    console.error("landing-feed-sync error", e);
    return json({ error: "Sync failed." }, 500, o);
  }
});
