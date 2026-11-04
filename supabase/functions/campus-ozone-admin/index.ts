import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const list = (v?: string) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const adminUids = list(Deno.env.get("CAMPUS_ADMIN_UIDS") || Deno.env.get("EFOOTBALL_ADMIN_UIDS"));
const origins = list(Deno.env.get("FRONTEND_ORIGINS") || "http://localhost:5173");
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET");
const rateSalt = Deno.env.get("ANON_RATE_SALT") || "change-me";
const BUCKET = "campus-updates";

if (!projectId || !supabaseUrl || !serviceKey) throw new Error("Missing environment variables.");

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

const cors = (o: string | null) => ({
  ...(o && origins.includes(o) ? { "Access-Control-Allow-Origin": o } : {}),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});
const json = (d: unknown, s = 200, o: string | null = null) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

async function optionalUid(req: Request): Promise<string | null> {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], keys, {
      issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ["RS256"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}
async function requireUid(req: Request) {
  const uid = await optionalUid(req);
  if (!uid) throw new Error("Please sign in to continue.");
  return uid;
}
const isAdmin = (uid: string) => adminUids.includes(uid);
const needAdmin = (uid: string) => { if (!isAdmin(uid)) throw new Error("Administrator access required."); };

function str(v: unknown, label: string, max: number, min = 1) {
  const s = String(v ?? "").trim();
  if (s.length < min || s.length > max) throw new Error(`${label} must be ${min}-${max} characters.`);
  return s;
}
const uuid = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error("Invalid id.");
  return s;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], label: string): T => {
  if (!allowed.includes(v as T)) throw new Error(`Invalid ${label}.`);
  return v as T;
};
const safePath = (p: unknown) => {
  const s = String(p ?? "");
  if (!/^updates\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(s) || s.includes("..")) throw new Error("Invalid file path.");
  return s;
};
async function audit(actor: string, action: string, type: string, id?: string | null, details: Record<string, unknown> = {}) {
  await db.from("admin_audit_log").insert({ actor_uid: actor, action, target_type: type, target_id: id ?? null, details });
}
const ok = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };

async function signMedia(rows: Array<Record<string, any>>) {
  return await Promise.all(rows.map(async (m) => {
    const { data } = await db.storage.from(BUCKET).createSignedUrl(m.storage_path, 3600);
    return { id: m.id, kind: m.kind, caption: m.caption, sort_order: m.sort_order, storage_path: m.storage_path, url: data?.signedUrl ?? null };
  }));
}
async function withMedia(updates: Array<Record<string, any>>) {
  if (!updates.length) return [];
  const media = ok(await db.from("campus_update_media").select("*").in("update_id", updates.map((u) => u.id)).order("sort_order"));
  const signed = await signMedia(media as any[]);
  const by: Record<string, any[]> = {};
  (media as any[]).forEach((m, i) => (by[m.update_id] ||= []).push(signed[i]));
  return updates.map((u) => ({ ...u, media: by[u.id] || [] }));
}

/* ---------- campus updates ---------- */
const CATS = ["general", "academic", "events", "notices", "opportunities", "security", "sports"] as const;

async function updatesList() {
  const rows = ok(await db.from("campus_updates").select("id,title,body,category,is_pinned,published_at,created_at")
    .eq("status", "published").is("deleted_at", null)
    .order("is_pinned", { ascending: false }).order("published_at", { ascending: false }).limit(60));
  return { updates: await withMedia(rows as any[]) };
}
async function adminUpdatesList() {
  const rows = ok(await db.from("campus_updates").select("*")
    .order("created_at", { ascending: false }).limit(100));
  return { updates: await withMedia(rows as any[]) };
}
async function updateSave(uid: string, b: Record<string, any>) {
  const status = oneOf(b.status, ["draft", "published"] as const, "status");
  const patch: Record<string, unknown> = {
    title: str(b.title, "Title", 140, 3),
    body: str(b.body, "Message", 8000),
    category: oneOf(b.category, CATS, "category"),
    status,
    is_pinned: b.is_pinned === true,
    updated_at: new Date().toISOString(),
  };
  let id: string;
  if (b.id) {
    id = uuid(b.id);
    const { data: cur } = await db.from("campus_updates").select("published_at").eq("id", id).single();
    if (status === "published" && !cur?.published_at) patch.published_at = new Date().toISOString();
    ok(await db.from("campus_updates").update(patch).eq("id", id));
  } else {
    patch.created_by_uid = uid;
    if (status === "published") patch.published_at = new Date().toISOString();
    id = ok(await db.from("campus_updates").insert(patch).select("id").single()).id;
  }
  for (const rid of Array.isArray(b.media_remove) ? b.media_remove : []) {
    const m = ok(await db.from("campus_update_media").select("storage_path").eq("id", uuid(rid)).eq("update_id", id).maybeSingle());
    if (m) {
      await db.storage.from(BUCKET).remove([(m as any).storage_path]);
      await db.from("campus_update_media").delete().eq("id", rid);
    }
  }
  const add = Array.isArray(b.media_add) ? b.media_add.slice(0, 10) : [];
  if (add.length) {
    ok(await db.from("campus_update_media").insert(add.map((m: any, i: number) => ({
      update_id: id, kind: oneOf(m.kind, ["image", "video"] as const, "media type"),
      storage_path: safePath(m.storage_path), caption: m.caption ? str(m.caption, "Caption", 200) : null, sort_order: i,
    }))));
  }
  await audit(uid, b.id ? "update_edit" : "update_create", "campus_update", id, { status });
  return { id };
}
async function mediaSignUpload(uid: string, b: Record<string, any>) {
  const kind = oneOf(b.kind, ["image", "video"] as const, "media type");
  const ext = kind === "video" ? (b.ext === "webm" ? "webm" : "mp4") : (["png", "webp"].includes(b.ext) ? b.ext : "jpg");
  const path = `updates/${crypto.randomUUID()}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  await audit(uid, "media_sign", "campus_update", null, { kind });
  return { path, token: data.token };
}
async function updateDelete(uid: string, b: Record<string, any>) {
  const id = uuid(b.id);
  if (b.permanent === true) {
    const media = ok(await db.from("campus_update_media").select("storage_path").eq("update_id", id)) as any[];
    if (media.length) await db.storage.from(BUCKET).remove(media.map((m) => m.storage_path));
    await db.from("campus_update_media").delete().eq("update_id", id);
    ok(await db.from("campus_updates").delete().eq("id", id));
    await audit(uid, "update_purge", "campus_update", id);
  } else if (b.restore === true) {
    ok(await db.from("campus_updates").update({ deleted_at: null }).eq("id", id));
    await audit(uid, "update_restore", "campus_update", id);
  } else {
    ok(await db.from("campus_updates").update({ deleted_at: new Date().toISOString() }).eq("id", id));
    await audit(uid, "update_delete", "campus_update", id);
  }
  return { ok: true };
}

/* ---------- O Zone curated ---------- */
const PUBLIC_COLS = "id,alias,age_band,gender,looking_for,category,area,bio,interests,avatar_key,published_at";
const AGE_BANDS = ["18-20", "21-23", "24-26", "27-30", "31+"] as const;
const GENDERS = ["Woman", "Man", "Non-binary", "Prefer not to say"] as const;
const LOOKING = ["Women", "Men", "Everyone"] as const;

async function profilesList() {
  return { profiles: ok(await db.from("ozc_profiles").select(PUBLIC_COLS).eq("status", "published")
    .eq("age_18_confirmed", true).eq("consent_confirmed", true).order("published_at", { ascending: false }).limit(200)) };
}
async function adminProfilesList() {
  const profiles = ok(await db.from("ozc_profiles").select("*").neq("status", "removed").order("created_at", { ascending: false })) as any[];
  const priv = ok(await db.from("ozc_profile_private").select("*").in("profile_id", profiles.map((p) => p.id).concat(["00000000-0000-0000-0000-000000000000"]))) as any[];
  const map = Object.fromEntries(priv.map((p) => [p.profile_id, p]));
  return { profiles: profiles.map((p) => ({ ...p, private: map[p.id] || null })) };
}
async function profileSave(uid: string, b: Record<string, any>) {
  const status = oneOf(b.status, ["draft", "published", "paused"] as const, "status");
  const age18 = b.age_18_confirmed === true, consent = b.consent_confirmed === true;
  if (status === "published" && !(age18 && consent)) throw new Error("Cannot publish: confirm the person is 18+ and has consented.");
  const interests = (Array.isArray(b.interests) ? b.interests : []).map((i: unknown) => String(i).trim()).filter(Boolean).slice(0, 8);
  const row: Record<string, unknown> = {
    alias: str(b.alias, "Alias", 40, 2),
    age_band: oneOf(b.age_band, AGE_BANDS, "age band"),
    gender: oneOf(b.gender, GENDERS, "gender"),
    looking_for: oneOf(b.looking_for, LOOKING, "preference"),
    category: oneOf(b.category, ["dating", "hookup"] as const, "category"),
    area: str(b.area, "Area", 60, 2),
    bio: String(b.bio ?? "").trim().slice(0, 400),
    interests, status,
    age_18_confirmed: age18, consent_confirmed: consent, share_in_group_ok: b.share_in_group_ok === true,
    updated_at: new Date().toISOString(),
  };
  if (/(?:\+?254|0)\s?[71]\d(?:[\s-]?\d){7,8}|@|https?:\/\//i.test(`${row.bio} ${row.alias} ${row.area}`)) {
    throw new Error("Keep phone numbers, emails and links out of the public profile.");
  }
  let id: string;
  if (b.id) {
    id = uuid(b.id);
    if (status === "published") row.published_at = new Date().toISOString();
    ok(await db.from("ozc_profiles").update(row).eq("id", id));
  } else {
    row.created_by_uid = uid;
    if (status === "published") row.published_at = new Date().toISOString();
    id = ok(await db.from("ozc_profiles").insert(row).select("id").single()).id;
  }
  const wa = String(b.whatsapp ?? "").trim();
  if (wa || !b.id) {
    if (!/^[+0-9\s()-]{9,20}$/.test(wa)) throw new Error("Enter a valid WhatsApp number (private, admin only).");
    ok(await db.from("ozc_profile_private").upsert({
      profile_id: id, whatsapp: wa, real_name: b.real_name ? str(b.real_name, "Name", 100) : null,
      admin_notes: b.admin_notes ? str(b.admin_notes, "Notes", 1000) : null,
      consent_note: b.consent_note ? str(b.consent_note, "Consent note", 300) : null,
    }, { onConflict: "profile_id" }));
  } else if (b.real_name !== undefined || b.admin_notes !== undefined) {
    ok(await db.from("ozc_profile_private").update({ real_name: b.real_name || null, admin_notes: b.admin_notes || null }).eq("profile_id", id));
  }
  await audit(uid, b.id ? "profile_edit" : "profile_create", "ozc_profile", id, { status });
  return { id };
}
async function profileSetStatus(uid: string, b: Record<string, any>) {
  const id = uuid(b.id);
  const status = oneOf(b.status, ["paused", "published", "removed"] as const, "status");
  if (status === "published") {
    const p = ok(await db.from("ozc_profiles").select("age_18_confirmed,consent_confirmed").eq("id", id).single()) as any;
    if (!p.age_18_confirmed || !p.consent_confirmed) throw new Error("Cannot publish without 18+ and consent confirmation.");
  }
  ok(await db.from("ozc_profiles").update({ status, updated_at: new Date().toISOString(), ...(status === "published" ? { published_at: new Date().toISOString() } : {}) }).eq("id", id));
  await audit(uid, "profile_" + status, "ozc_profile", id);
  return { ok: true };
}
async function profileDelete(uid: string, b: Record<string, any>) {
  const id = uuid(b.id);
  await db.from("ozc_profile_private").delete().eq("profile_id", id);
  await db.from("ozc_intro_requests").delete().eq("profile_id", id);
  await db.from("ozc_reports").delete().eq("profile_id", id);
  ok(await db.from("ozc_profiles").delete().eq("id", id));
  await audit(uid, "profile_purge", "ozc_profile", id);
  return { ok: true };
}
async function introRequest(uid: string, b: Record<string, any>) {
  const profile_id = uuid(b.profile_id);
  const p = ok(await db.from("ozc_profiles").select("id").eq("id", profile_id).eq("status", "published").maybeSingle());
  if (!p) throw new Error("This profile is no longer available.");
  const open = ok(await db.from("ozc_intro_requests").select("id").eq("profile_id", profile_id).eq("requester_uid", uid)
    .in("status", ["pending", "forwarded"]).maybeSingle());
  if (open) throw new Error("You already have an open request for this profile.");
  const message = String(b.message ?? "").trim().slice(0, 300);
  if (/(?:\+?254|0)\s?[71]\d(?:[\s-]?\d){7,8}|https?:\/\//i.test(message)) throw new Error("Do not put phone numbers or links in your message. The admin will connect you.");
  ok(await db.from("ozc_intro_requests").insert({ profile_id, requester_uid: uid, message }));
  return { ok: true };
}
async function reportProfile(uid: string, b: Record<string, any>) {
  ok(await db.from("ozc_reports").insert({ profile_id: uuid(b.profile_id), reporter_uid: uid, reason: str(b.reason, "Reason", 500, 3) }));
  return { ok: true };
}
async function introList() {
  const reqs = ok(await db.from("ozc_intro_requests").select("*").order("created_at", { ascending: false }).limit(150)) as any[];
  const pids = [...new Set(reqs.map((r) => r.profile_id))];
  const uids = [...new Set(reqs.map((r) => r.requester_uid))];
  const profs = pids.length ? ok(await db.from("ozc_profiles").select("id,alias").in("id", pids)) as any[] : [];
  const sp = uids.length ? ok(await db.from("student_profiles").select("firebase_uid,display_name").in("firebase_uid", uids)) as any[] : [];
  return { requests: reqs.map((r) => ({
    ...r, alias: profs.find((p) => p.id === r.profile_id)?.alias ?? "(removed)",
    requester_name: sp.find((s) => s.firebase_uid === r.requester_uid)?.display_name ?? "Member",
  })) };
}
async function introSetStatus(uid: string, b: Record<string, any>) {
  const id = uuid(b.id);
  ok(await db.from("ozc_intro_requests").update({ status: oneOf(b.status, ["pending", "forwarded", "accepted", "declined", "closed"] as const, "status"), updated_at: new Date().toISOString() }).eq("id", id));
  await audit(uid, "intro_" + b.status, "ozc_intro", id);
  return { ok: true };
}
async function reportsList() {
  const rows = ok(await db.from("ozc_reports").select("*").order("created_at", { ascending: false }).limit(100)) as any[];
  const pids = [...new Set(rows.map((r) => r.profile_id))];
  const profs = pids.length ? ok(await db.from("ozc_profiles").select("id,alias").in("id", pids)) as any[] : [];
  return { reports: rows.map((r) => ({ ...r, alias: profs.find((p) => p.id === r.profile_id)?.alias ?? "(removed)" })) };
}
async function reportSetStatus(uid: string, b: Record<string, any>) {
  const id = uuid(b.id);
  ok(await db.from("ozc_reports").update({ status: oneOf(b.status, ["open", "actioned", "dismissed"] as const, "status") }).eq("id", id));
  await audit(uid, "report_" + b.status, "ozc_report", id);
  return { ok: true };
}

/* ---------- anonymous box ---------- */
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function anonSubmit(req: Request, b: Record<string, any>) {
  if (b.website) return { ok: true }; // honeypot: pretend success
  const body = str(b.body, "Message", 500, 2);
  if (/https?:\/\/|www\./i.test(body)) throw new Error("Links are not allowed in anonymous messages.");
  if (turnstileSecret) {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: turnstileSecret, response: String(b.turnstile_token ?? "") }),
    });
    if (!(await r.json()).success) throw new Error("Bot check failed. Please try again.");
  }
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const rate_hash = await sha256(`${ip}|${day}|${rateSalt}`);
  await db.from("anon_messages").update({ rate_hash: null }).lt("created_at", new Date(Date.now() - 864e5).toISOString()).not("rate_hash", "is", null);
  const { count } = await db.from("anon_messages").select("id", { count: "exact", head: true }).eq("rate_hash", rate_hash);
  if ((count ?? 0) >= 5) throw new Error("You have sent enough messages for today. Try again tomorrow.");
  ok(await db.from("anon_messages").insert({ body, rate_hash }));
  return { ok: true };
}
async function anonList() {
  return { messages: ok(await db.from("anon_messages").select("id,body,status,created_at").order("created_at", { ascending: false }).limit(200)) };
}
async function anonSet(uid: string, b: Record<string, any>) {
  const ids: string[] = (Array.isArray(b.ids) ? b.ids : [b.id]).map(uuid);
  if (b.delete === true) {
    ok(await db.from("anon_messages").delete().in("id", ids));
    await audit(uid, "anon_delete", "anon_message", null, { count: ids.length });
  } else {
    ok(await db.from("anon_messages").update({ status: oneOf(b.status, ["unread", "read", "flagged", "approved"] as const, "status") }).in("id", ids));
  }
  return { ok: true };
}
async function anonApproved() {
  return { messages: ok(await db.from("anon_messages").select("id,body,created_at").eq("status", "approved").order("created_at", { ascending: false }).limit(30)) };
}

Deno.serve(async (req) => {
  const o = req.headers.get("Origin");
  if (o && !origins.includes(o)) return json({ error: "Origin not allowed." }, 403, o);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(o) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, o);
  try {
    if (Number(req.headers.get("Content-Length") || 0) > 64_000) return json({ error: "Request is too large." }, 413, o);
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Invalid request.");
    // public actions
    if (b.action === "updates_list") return json(await updatesList(), 200, o);
    if (b.action === "anon_submit") return json(await anonSubmit(req, b), 200, o);
    if (b.action === "anon_approved") return json(await anonApproved(), 200, o);

    const uid = await requireUid(req);
    let r: unknown;
    switch (b.action) {
      case "me": r = { is_admin: isAdmin(uid) }; break;
      // members
      case "profiles_list": r = await profilesList(); break;
      case "intro_request": r = await introRequest(uid, b); break;
      case "report_profile": r = await reportProfile(uid, b); break;
      default: {
        needAdmin(uid);
        switch (b.action) {
          case "admin_updates_list": r = await adminUpdatesList(); break;
          case "update_save": r = await updateSave(uid, b); break;
          case "update_delete": r = await updateDelete(uid, b); break;
          case "media_sign_upload": r = await mediaSignUpload(uid, b); break;
          case "admin_profiles_list": r = await adminProfilesList(); break;
          case "profile_save": r = await profileSave(uid, b); break;
          case "profile_set_status": r = await profileSetStatus(uid, b); break;
          case "profile_delete": r = await profileDelete(uid, b); break;
          case "intro_list": r = await introList(); break;
          case "intro_set_status": r = await introSetStatus(uid, b); break;
          case "reports_list": r = await reportsList(); break;
          case "report_set_status": r = await reportSetStatus(uid, b); break;
          case "anon_list": r = await anonList(); break;
          case "anon_set": r = await anonSet(uid, b); break;
          default: throw new Error("Unknown action.");
        }
      }
    }
    return json(r, 200, o);
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message || "Request failed.";
    const safe = /sign in|Administrator|must be|Invalid|Cannot|Enter|Keep|Do not|already|Links|Bot|enough|no longer|Unknown/.test(msg);
    if (!safe) console.error(e);
    return json({ error: safe ? msg : "Something went wrong. Please try again." }, safe ? 400 : 500, o);
  }
});
