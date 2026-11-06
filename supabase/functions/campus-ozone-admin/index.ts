import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

/**
 * Chuka Updates + Chuka O Zone API.
 * - Verifies Firebase ID tokens itself (deploy with verify_jwt = false).
 * - The only admin is the verified Google account in CAMPUS_ADMIN_EMAIL (default below).
 * - Stores no payment data of any kind.
 */
const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const list = (v?: string) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const adminEmail = (Deno.env.get("CAMPUS_ADMIN_EMAIL") || "sidneywafula30@gmail.com").trim().toLowerCase();
const legacyAdminUids = list(Deno.env.get("CAMPUS_ADMIN_UIDS")); // optional extra uids; leave unset for a single admin
const origins = list(Deno.env.get("FRONTEND_ORIGINS") || "http://localhost:5173");
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET");
const BUCKET = "campus-updates";
const RULES_VERSION = "2026-11-v1";
const PRIVACY_VERSION = "2026-11-v1";

if (!projectId || !supabaseUrl || !serviceKey) throw new Error("Missing environment variables.");
const rateSalt = Deno.env.get("ANON_RATE_SALT") || serviceKey; // never fall back to a guessable value

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

/** Errors whose message is safe to show to the user. Anything else becomes a generic 500. */
class UserError extends Error {}
const bad = (m: string): never => { throw new UserError(m); };

const cors = (o: string | null) => ({
  ...(o && origins.includes(o) ? { "Access-Control-Allow-Origin": o } : {}),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});
const json = (d: unknown, s = 200, o: string | null = null) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

/* ------------------------------------------------------------------ auth */
type Caller = { uid: string; email: string; verified: boolean };

async function optionalCaller(req: Request): Promise<Caller | null> {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], keys, {
      issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string") return null;
    return {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : "",
      verified: payload.email_verified === true,
    };
  } catch { return null; }
}
async function requireCaller(req: Request) {
  const c = await optionalCaller(req);
  if (!c) bad("Please sign in to continue.");
  return c as Caller;
}
const isAdmin = (c: Caller) => (c.verified && c.email === adminEmail) || legacyAdminUids.includes(c.uid);
const needAdmin = (c: Caller) => { if (!isAdmin(c)) bad("Administrator access required."); };

/* --------------------------------------------------------------- helpers */
function str(v: unknown, label: string, max: number, min = 1) {
  const s = String(v ?? "").trim();
  if (s.length < min || s.length > max) bad(`${label} must be ${min}-${max} characters.`);
  return s;
}
const uuid = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) bad("Invalid id.");
  return s;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], label: string): T => {
  if (!allowed.includes(v as T)) bad(`Invalid ${label}.`);
  return v as T;
};
const safePath = (p: unknown) => {
  const s = String(p ?? "");
  if (!/^updates\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(s) || s.includes("..")) bad("Invalid file path.");
  return s;
};
const PHONE_RE = /(?:\+?254|0)\s?[71]\d(?:[\s-]?\d){7,8}/;
const noContactInfo = (text: string, what: string) => {
  if (PHONE_RE.test(text) || /@|https?:\/\/|www\./i.test(text)) bad(`Keep phone numbers, emails and links out of ${what}.`);
};
const cleanPhone = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!/^[+0-9\s()-]{9,20}$/.test(s)) bad("Enter a valid WhatsApp number (private).");
  return s;
};
async function audit(actor: string, action: string, type: string, id?: string | null, details: Record<string, unknown> = {}) {
  await db.from("admin_audit_log").insert({ actor_uid: actor, action, target_type: type, target_id: id ?? null, details });
}
const ok = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };
const now = () => new Date().toISOString();

/* -------------------------------------------------------------- settings */
const SETTING_KEYS = ["updates_channel_url", "ozone_channel_url", "ozone_admin_whatsapp", "ozone_ngl_url"] as const;

async function settingsPublic() {
  const rows = ok(await db.from("campus_settings").select("key,value")) as { key: string; value: string }[];
  const out: Record<string, string> = Object.fromEntries(SETTING_KEYS.map((k) => [k, ""]));
  for (const r of rows) if ((SETTING_KEYS as readonly string[]).includes(r.key)) out[r.key] = r.value;
  return { settings: out };
}
async function settingsSave(c: Caller, b: Record<string, any>) {
  const input = (b.settings && typeof b.settings === "object") ? b.settings : {};
  const rows: { key: string; value: string; updated_by: string; updated_at: string }[] = [];
  for (const key of SETTING_KEYS) {
    if (!(key in input)) continue;
    let value = String(input[key] ?? "").trim();
    if (value) {
      if (key === "updates_channel_url" || key === "ozone_channel_url") {
        if (!/^https:\/\/(www\.)?(whatsapp\.com\/channel\/|chat\.whatsapp\.com\/)[A-Za-z0-9_-]+\/?$/i.test(value)) {
          bad("Use a WhatsApp channel or group link (https://whatsapp.com/channel/… or https://chat.whatsapp.com/…).");
        }
      } else if (key === "ozone_admin_whatsapp") {
        value = value.replace(/\D/g, "");
        if (value.startsWith("0")) value = "254" + value.slice(1);
        if (value.length < 9 || value.length > 15) bad("Enter the admin WhatsApp number with country code, e.g. 2547…");
      } else if (key === "ozone_ngl_url") {
        if (!/^https:\/\/[^\s]+$/i.test(value)) bad("The NGL link must start with https://");
      }
    }
    rows.push({ key, value, updated_by: c.uid, updated_at: now() });
  }
  if (rows.length) ok(await db.from("campus_settings").upsert(rows, { onConflict: "key" }));
  await audit(c.uid, "settings_save", "campus_settings", null, { keys: rows.map((r) => r.key) });
  return await settingsPublic();
}

/* --------------------------------------------------------- campus updates */
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
const CATS = ["general", "academic", "events", "notices", "opportunities", "security", "sports"] as const;

async function updatesList() {
  const rows = ok(await db.from("campus_updates").select("id,title,body,category,is_pinned,published_at,created_at")
    .eq("status", "published").is("deleted_at", null)
    .order("is_pinned", { ascending: false }).order("published_at", { ascending: false }).limit(60));
  return { updates: await withMedia(rows as any[]) };
}
async function adminUpdatesList() {
  const rows = ok(await db.from("campus_updates").select("*").order("created_at", { ascending: false }).limit(100));
  return { updates: await withMedia(rows as any[]) };
}
async function updateSave(c: Caller, b: Record<string, any>) {
  const status = oneOf(b.status, ["draft", "published"] as const, "status");
  const patch: Record<string, unknown> = {
    title: str(b.title, "Title", 140, 3),
    body: str(b.body, "Message", 8000),
    category: oneOf(b.category, CATS, "category"),
    status,
    is_pinned: b.is_pinned === true,
    updated_at: now(),
  };
  let id: string;
  if (b.id) {
    id = uuid(b.id);
    const { data: cur } = await db.from("campus_updates").select("published_at").eq("id", id).single();
    if (status === "published" && !cur?.published_at) patch.published_at = now();
    ok(await db.from("campus_updates").update(patch).eq("id", id));
  } else {
    patch.created_by_uid = c.uid;
    if (status === "published") patch.published_at = now();
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
  await audit(c.uid, b.id ? "update_edit" : "update_create", "campus_update", id, { status });
  return { id };
}
async function mediaSignUpload(c: Caller, b: Record<string, any>) {
  const kind = oneOf(b.kind, ["image", "video"] as const, "media type");
  const ext = kind === "video" ? (b.ext === "webm" ? "webm" : "mp4") : (["png", "webp"].includes(b.ext) ? b.ext : "jpg");
  const path = `updates/${crypto.randomUUID()}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  await audit(c.uid, "media_sign", "campus_update", null, { kind });
  return { path, token: data.token };
}
async function updateDelete(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  if (b.permanent === true) {
    const media = ok(await db.from("campus_update_media").select("storage_path").eq("update_id", id)) as any[];
    if (media.length) await db.storage.from(BUCKET).remove(media.map((m) => m.storage_path));
    await db.from("campus_update_media").delete().eq("update_id", id);
    ok(await db.from("campus_updates").delete().eq("id", id));
    await audit(c.uid, "update_purge", "campus_update", id);
  } else if (b.restore === true) {
    ok(await db.from("campus_updates").update({ deleted_at: null }).eq("id", id));
    await audit(c.uid, "update_restore", "campus_update", id);
  } else {
    ok(await db.from("campus_updates").update({ deleted_at: now() }).eq("id", id));
    await audit(c.uid, "update_delete", "campus_update", id);
  }
  return { ok: true };
}

/* ------------------------------------------------------------- O Zone: shared */
const PUBLIC_COLS = "id,alias,age_band,gender,looking_for,category,area,bio,interests,avatar_key,published_at";
const AGE_BANDS = ["18-20", "21-23", "24-26", "27-30", "31+"] as const;
const GENDERS = ["Woman", "Man", "Non-binary", "Prefer not to say"] as const;
const LOOKING = ["Women", "Men", "Everyone"] as const;
const INTENTIONS = ["dating", "hookup"] as const;
const ZERO = "00000000-0000-0000-0000-000000000000";

async function hasAcceptedRules(uid: string) {
  const r = ok(await db.from("ozc_agreements").select("uid").eq("uid", uid).eq("version", RULES_VERSION).maybeSingle());
  return !!r;
}
async function needRules(uid: string) {
  if (!(await hasAcceptedRules(uid))) bad("Please read and accept the O Zone safety rules first.");
}
async function ownProfile(uid: string) {
  return ok(await db.from("ozc_profiles").select("*").eq("owner_uid", uid).neq("status", "removed").maybeSingle()) as any;
}
function publicFields(b: Record<string, any>) {
  const interests = (Array.isArray(b.interests) ? b.interests : []).map((i: unknown) => String(i).trim()).filter(Boolean).slice(0, 8);
  const row = {
    alias: str(b.alias, "Alias", 40, 2),
    age_band: oneOf(b.age_band, AGE_BANDS, "age band"),
    gender: oneOf(b.gender, GENDERS, "gender"),
    looking_for: oneOf(b.looking_for, LOOKING, "preference"),
    category: oneOf(b.category, INTENTIONS, "category"),
    area: str(b.area, "Area", 60, 2),
    bio: String(b.bio ?? "").trim().slice(0, 400),
    interests,
  };
  noContactInfo(`${row.bio} ${row.alias} ${row.area} ${interests.join(" ")}`, "the public profile");
  return row;
}
async function savePrivate(profile_id: string, b: Record<string, any>, requireWhatsapp: boolean) {
  const wa = String(b.whatsapp ?? "").trim();
  if (wa || requireWhatsapp) {
    ok(await db.from("ozc_profile_private").upsert({
      profile_id, whatsapp: cleanPhone(wa),
      real_name: b.real_name ? str(b.real_name, "Name", 100) : null,
      ...(b.admin_notes !== undefined ? { admin_notes: b.admin_notes ? str(b.admin_notes, "Notes", 1000) : null } : {}),
      ...(b.consent_note !== undefined ? { consent_note: b.consent_note ? str(b.consent_note, "Consent note", 300) : null } : {}),
    }, { onConflict: "profile_id" }));
  } else if (b.real_name !== undefined || b.admin_notes !== undefined) {
    ok(await db.from("ozc_profile_private").update({
      ...(b.real_name !== undefined ? { real_name: b.real_name || null } : {}),
      ...(b.admin_notes !== undefined ? { admin_notes: b.admin_notes || null } : {}),
    }).eq("profile_id", profile_id));
  }
}

/* ---------------------------------------------------- O Zone: student actions */
async function ozAcceptRules(c: Caller, b: Record<string, any>) {
  if (b.accepted !== true || Number(b.statements) !== 8) bad("You must accept all eight statements to continue.");
  ok(await db.from("ozc_agreements").upsert({
    uid: c.uid, version: RULES_VERSION, privacy_version: PRIVACY_VERSION, statements_accepted: 8, accepted_at: now(),
  }, { onConflict: "uid,version" }));
  return { ok: true, version: RULES_VERSION };
}

async function ozProfileSave(c: Caller, b: Record<string, any>) {
  await needRules(c.uid);
  const row = publicFields(b);
  const cur = await ownProfile(c.uid);
  let id: string;
  if (cur) {
    if (cur.status === "suspended") bad("Your profile is suspended. Please contact the O Zone admin.");
    id = cur.id;
    ok(await db.from("ozc_profiles").update({ ...row, updated_at: now() }).eq("id", id));
    await savePrivate(id, b, false);
  } else {
    id = ok(await db.from("ozc_profiles").insert({
      ...row, status: "pending", owner_uid: c.uid, created_by_uid: c.uid,
      age_18_confirmed: true, consent_confirmed: true, share_in_group_ok: false,
      rules_version: RULES_VERSION, rules_accepted_at: now(),
    }).select("id").single()).id;
    await savePrivate(id, b, true);
  }
  return { id };
}
async function ozSetVisibility(c: Caller, b: Record<string, any>) {
  const p = await ownProfile(c.uid);
  if (!p) bad("Create your profile first.");
  if (p.status === "suspended") bad("Your profile is suspended. Please contact the O Zone admin.");
  if (b.visible === true) {
    // Only a profile the admin has already activated can be shown again.
    if (!p.activated_by) bad("Your profile has not been activated by the admin yet.");
    ok(await db.from("ozc_profiles").update({ status: "published", updated_at: now() }).eq("id", p.id));
  } else {
    if (p.status === "published") ok(await db.from("ozc_profiles").update({ status: "paused", updated_at: now() }).eq("id", p.id));
  }
  return { ok: true };
}
async function ozDeleteMine(c: Caller) {
  const p = await ownProfile(c.uid);
  if (!p) return { ok: true };
  await db.from("ozc_intro_requests").delete().eq("profile_id", p.id);
  await db.from("ozc_intro_requests").delete().eq("requester_uid", c.uid);
  await db.from("ozc_reports").delete().eq("profile_id", p.id);
  await db.from("ozc_profile_private").delete().eq("profile_id", p.id);
  ok(await db.from("ozc_profiles").delete().eq("id", p.id));
  await audit(c.uid, "profile_self_delete", "ozc_profile", p.id);
  return { ok: true };
}

function counterpartContact(released: boolean, alias: string, priv: any) {
  return released && priv ? { name: priv.real_name || alias, whatsapp: priv.whatsapp } : null;
}
async function ozMe(c: Caller) {
  const admin = isAdmin(c);
  const accepted = await hasAcceptedRules(c.uid);
  const mine = await ownProfile(c.uid);
  let profile: any = null;
  if (mine) {
    const priv = ok(await db.from("ozc_profile_private").select("whatsapp,real_name").eq("profile_id", mine.id).maybeSingle()) as any;
    profile = { ...mine, whatsapp: priv?.whatsapp ?? "", real_name: priv?.real_name ?? "" };
  }

  // Requests I sent
  const sent = ok(await db.from("ozc_intro_requests").select("*").eq("requester_uid", c.uid).order("created_at", { ascending: false }).limit(50)) as any[];
  const targetIds = [...new Set(sent.map((r) => r.profile_id))];
  const targets = targetIds.length ? ok(await db.from("ozc_profiles").select("id,alias").in("id", targetIds)) as any[] : [];
  const tPriv = targetIds.length ? ok(await db.from("ozc_profile_private").select("profile_id,whatsapp,real_name").in("profile_id", targetIds)) as any[] : [];
  const outgoing = sent.map((r) => {
    const alias = targets.find((t) => t.id === r.profile_id)?.alias ?? "(removed)";
    return {
      id: r.id, code: r.code, intention: r.intention ?? "dating", status: r.status, decision: r.recipient_decision,
      alias, created_at: r.created_at, my_contact_ok: r.requester_contact_ok, their_contact_ok: r.recipient_contact_ok,
      contact: counterpartContact(!!r.contact_released_at, alias, tPriv.find((p) => p.profile_id === r.profile_id)),
    };
  });

  // Requests to my profile
  let incoming: any[] = [];
  if (mine) {
    const recv = ok(await db.from("ozc_intro_requests").select("*").eq("profile_id", mine.id).order("created_at", { ascending: false }).limit(50)) as any[];
    const rpIds = [...new Set(recv.map((r) => r.requester_profile_id).filter(Boolean))];
    const rps = rpIds.length ? ok(await db.from("ozc_profiles").select("id,alias,age_band,bio,gender").in("id", rpIds)) as any[] : [];
    const rPriv = rpIds.length ? ok(await db.from("ozc_profile_private").select("profile_id,whatsapp,real_name").in("profile_id", rpIds)) as any[] : [];
    incoming = recv.map((r) => {
      const rp = rps.find((p) => p.id === r.requester_profile_id);
      const alias = rp?.alias ?? "A member";
      return {
        id: r.id, code: r.code, intention: r.intention ?? "dating", status: r.status, decision: r.recipient_decision,
        message: r.message, created_at: r.created_at, alias, age_band: rp?.age_band ?? null, bio: rp?.bio ?? "",
        my_contact_ok: r.recipient_contact_ok, their_contact_ok: r.requester_contact_ok,
        contact: counterpartContact(!!r.contact_released_at, alias, rPriv.find((p) => p.profile_id === r.requester_profile_id)),
      };
    });
  }
  return { is_admin: admin, rules: { accepted, version: RULES_VERSION }, profile, outgoing, incoming };
}

async function profilesList(c: Caller) {
  await needRules(c.uid);
  const q = db.from("ozc_profiles").select(PUBLIC_COLS).eq("status", "published")
    .eq("age_18_confirmed", true).eq("consent_confirmed", true).order("published_at", { ascending: false }).limit(200);
  const rows = ok(await q) as any[];
  const mine = await ownProfile(c.uid);
  return { profiles: rows.filter((p) => p.id !== mine?.id) };
}

async function introRequest(c: Caller, b: Record<string, any>) {
  await needRules(c.uid);
  const mine = await ownProfile(c.uid);
  if (!mine) bad("Create your own O Zone profile before requesting an introduction.");
  if (mine.status !== "published") bad("Your profile must be active before you can request introductions. Message the admin to activate it.");
  const profile_id = uuid(b.profile_id);
  if (profile_id === mine.id) bad("You cannot request an introduction to yourself.");
  const intention = oneOf(b.intention, INTENTIONS, "introduction type");
  const target = ok(await db.from("ozc_profiles").select("id,owner_uid").eq("id", profile_id).eq("status", "published").maybeSingle()) as any;
  if (!target) bad("This profile is no longer available.");
  const open = ok(await db.from("ozc_intro_requests").select("id").eq("profile_id", profile_id).eq("requester_uid", c.uid)
    .in("status", ["pending", "forwarded", "accepted"]).maybeSingle());
  if (open) bad("You already have an open request for this profile.");
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from("ozc_intro_requests").select("id", { count: "exact", head: true }).eq("requester_uid", c.uid).gte("created_at", since);
  if ((count ?? 0) >= 5) bad("You have reached the daily limit of 5 introduction requests. Try again tomorrow.");
  const message = String(b.message ?? "").trim().slice(0, 300);
  if (PHONE_RE.test(message) || /https?:\/\/|www\./i.test(message)) bad("Do not put phone numbers or links in your message. The admin will connect you.");
  const row = ok(await db.from("ozc_intro_requests").insert({
    profile_id, requester_uid: c.uid, requester_profile_id: mine.id, intention, message,
  }).select("id,code").single()) as any;
  return { id: row.id, code: row.code, intention };
}

/** Profile owner answers a request. Only the owner can do this in the app. */
async function introRespond(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  const decision = oneOf(b.decision, ["accepted", "declined"] as const, "decision");
  const mine = await ownProfile(c.uid);
  const r = ok(await db.from("ozc_intro_requests").select("*").eq("id", id).maybeSingle()) as any;
  if (!r || !mine || r.profile_id !== mine.id) bad("This request is not available.");
  if (r.recipient_decision !== "pending" || ["closed", "declined", "introduced"].includes(r.status)) bad("This request has already been answered.");
  ok(await db.from("ozc_intro_requests").update({
    recipient_decision: decision, decision_source: "student", decided_at: now(),
    status: decision === "accepted" ? "accepted" : "declined", updated_at: now(),
  }).eq("id", id));
  return { ok: true };
}
/** Each party separately says whether the admin may share their WhatsApp with the other. */
async function introContactConsent(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  const yes = b.ok === true;
  const mine = await ownProfile(c.uid);
  const r = ok(await db.from("ozc_intro_requests").select("*").eq("id", id).maybeSingle()) as any;
  if (!r) bad("This request is not available.");
  const isRequester = r.requester_uid === c.uid;
  const isRecipient = !!mine && r.profile_id === mine.id;
  if (!isRequester && !isRecipient) bad("This request is not available.");
  if (r.recipient_decision !== "accepted" || r.status !== "accepted") bad("Contact can be shared only after the introduction is accepted.");
  ok(await db.from("ozc_intro_requests").update({
    ...(isRequester ? { requester_contact_ok: yes } : { recipient_contact_ok: yes }), updated_at: now(),
  }).eq("id", id));
  return { ok: true };
}
async function introCancel(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  const mine = await ownProfile(c.uid);
  const r = ok(await db.from("ozc_intro_requests").select("requester_uid,profile_id,status").eq("id", id).maybeSingle()) as any;
  if (!r || (r.requester_uid !== c.uid && r.profile_id !== mine?.id)) bad("This request is not available.");
  if (r.status === "introduced") bad("This introduction is already complete.");
  ok(await db.from("ozc_intro_requests").update({
    status: "closed", requester_contact_ok: false, recipient_contact_ok: false, updated_at: now(),
  }).eq("id", id));
  return { ok: true };
}
async function reportProfile(c: Caller, b: Record<string, any>) {
  const profile_id = uuid(b.profile_id);
  const dup = ok(await db.from("ozc_reports").select("id").eq("profile_id", profile_id).eq("reporter_uid", c.uid).eq("status", "open").maybeSingle());
  if (dup) bad("You have already reported this profile. The admin will review it.");
  ok(await db.from("ozc_reports").insert({ profile_id, reporter_uid: c.uid, reason: str(b.reason, "Reason", 500, 3) }));
  return { ok: true };
}

/* ------------------------------------------------------- O Zone: admin actions */
async function adminProfilesList() {
  const profiles = ok(await db.from("ozc_profiles").select("*").neq("status", "removed").order("created_at", { ascending: false })) as any[];
  const priv = ok(await db.from("ozc_profile_private").select("*").in("profile_id", profiles.map((p) => p.id).concat([ZERO]))) as any[];
  const map = Object.fromEntries(priv.map((p) => [p.profile_id, p]));
  return { profiles: profiles.map((p) => ({ ...p, private: map[p.id] || null })) };
}
/** Admin-curated profile (someone who asked the admin to list them). */
async function profileSave(c: Caller, b: Record<string, any>) {
  const status = oneOf(b.status, ["draft", "pending", "published", "paused"] as const, "status");
  const age18 = b.age_18_confirmed === true, consent = b.consent_confirmed === true;
  if (status === "published" && !(age18 && consent)) bad("Cannot publish: confirm the person is 18+ and has consented.");
  const row: Record<string, unknown> = {
    ...publicFields(b), status, age_18_confirmed: age18, consent_confirmed: consent,
    share_in_group_ok: b.share_in_group_ok === true, updated_at: now(),
  };
  let id: string;
  if (b.id) {
    id = uuid(b.id);
    if (status === "published") { row.published_at = now(); row.activated_by = c.uid; row.activated_at = now(); }
    ok(await db.from("ozc_profiles").update(row).eq("id", id));
  } else {
    row.created_by_uid = c.uid;
    if (status === "published") { row.published_at = now(); row.activated_by = c.uid; row.activated_at = now(); }
    id = ok(await db.from("ozc_profiles").insert(row).select("id").single()).id;
  }
  await savePrivate(id, b, !b.id);
  await audit(c.uid, b.id ? "profile_edit" : "profile_create", "ozc_profile", id, { status });
  return { id };
}
/** Activation = status 'published'. The admin checks the activation off-app; the app records only who and when. */
async function profileSetStatus(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  const status = oneOf(b.status, ["pending", "published", "paused", "suspended", "removed"] as const, "status");
  const p = ok(await db.from("ozc_profiles").select("age_18_confirmed,consent_confirmed,activated_at").eq("id", id).single()) as any;
  const patch: Record<string, unknown> = { status, updated_at: now() };
  if (status === "published") {
    if (!p.age_18_confirmed || !p.consent_confirmed) bad("Cannot activate without 18+ and consent confirmation.");
    patch.published_at = now(); patch.activated_by = c.uid; patch.activated_at = p.activated_at ?? now();
  }
  ok(await db.from("ozc_profiles").update(patch).eq("id", id));
  if (status === "suspended" || status === "removed") {
    await db.from("ozc_intro_requests").update({ status: "closed", updated_at: now() })
      .eq("profile_id", id).in("status", ["pending", "forwarded", "accepted"]);
  }
  await audit(c.uid, "profile_" + status, "ozc_profile", id);
  return { ok: true };
}
async function profileDelete(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  await db.from("ozc_profile_private").delete().eq("profile_id", id);
  await db.from("ozc_intro_requests").delete().eq("profile_id", id);
  await db.from("ozc_reports").delete().eq("profile_id", id);
  ok(await db.from("ozc_profiles").delete().eq("id", id));
  await audit(c.uid, "profile_purge", "ozc_profile", id);
  return { ok: true };
}
async function introList(c: Caller) {
  const reqs = ok(await db.from("ozc_intro_requests").select("*").order("created_at", { ascending: false }).limit(150)) as any[];
  const pids = [...new Set(reqs.flatMap((r) => [r.profile_id, r.requester_profile_id]).filter(Boolean))];
  const profs = pids.length ? ok(await db.from("ozc_profiles").select("id,alias").in("id", pids)) as any[] : [];
  const privs = pids.length ? ok(await db.from("ozc_profile_private").select("profile_id,whatsapp,real_name").in("profile_id", pids)) as any[] : [];
  const uids = [...new Set(reqs.map((r) => r.requester_uid))];
  const sp = uids.length ? ok(await db.from("student_profiles").select("firebase_uid,display_name").in("firebase_uid", uids)) as any[] : [];
  const released = reqs.filter((r) => r.contact_released_at).length;
  if (released) await audit(c.uid, "intro_list_with_contacts", "ozc_intro", null, { released });
  return { requests: reqs.map((r) => {
    const tp = privs.find((p) => p.profile_id === r.profile_id);
    const rp = privs.find((p) => p.profile_id === r.requester_profile_id);
    return {
      id: r.id, code: r.code, intention: r.intention ?? "dating", status: r.status, message: r.message, created_at: r.created_at,
      decision: r.recipient_decision, decision_source: r.decision_source, admin_note: r.admin_note,
      requester_contact_ok: r.requester_contact_ok, recipient_contact_ok: r.recipient_contact_ok,
      alias: profs.find((p) => p.id === r.profile_id)?.alias ?? "(removed)",
      requester_alias: profs.find((p) => p.id === r.requester_profile_id)?.alias ?? null,
      requester_name: sp.find((s) => s.firebase_uid === r.requester_uid)?.display_name ?? "Member",
      // WhatsApp details are included only once both people consented and the admin released them.
      released: r.contact_released_at ? {
        requester: rp ? { name: rp.real_name, whatsapp: rp.whatsapp } : null,
        recipient: tp ? { name: tp.real_name, whatsapp: tp.whatsapp } : null,
      } : null,
    };
  }) };
}
async function introSetStatus(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  const status = oneOf(b.status, ["pending", "forwarded", "declined", "closed"] as const, "status");
  const patch: Record<string, unknown> = { status, updated_at: now() };
  if (b.admin_note !== undefined) patch.admin_note = b.admin_note ? str(b.admin_note, "Note", 500) : null;
  if (status === "declined") { patch.recipient_decision = "declined"; patch.decision_source = "admin_whatsapp"; patch.decided_at = now(); }
  if (status === "closed" || status === "declined") { patch.requester_contact_ok = false; patch.recipient_contact_ok = false; }
  ok(await db.from("ozc_intro_requests").update(patch).eq("id", id));
  await audit(c.uid, "intro_" + status, "ozc_intro", id);
  return { ok: true };
}
/** The recipient told the admin on WhatsApp that they accept. Logged as admin-recorded. */
async function introRecordDecision(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  const decision = oneOf(b.decision, ["accepted", "declined"] as const, "decision");
  const r = ok(await db.from("ozc_intro_requests").select("recipient_decision,status").eq("id", id).maybeSingle()) as any;
  if (!r) bad("This request is not available.");
  if (["closed", "introduced"].includes(r.status)) bad("This request is already finished.");
  ok(await db.from("ozc_intro_requests").update({
    recipient_decision: decision, decision_source: "admin_whatsapp", decided_at: now(),
    status: decision === "accepted" ? "accepted" : "declined", updated_at: now(),
  }).eq("id", id));
  await audit(c.uid, "intro_decision_recorded", "ozc_intro", id, { decision });
  return { ok: true };
}
/** Releases WhatsApp details only when the owner accepted AND both people consented to share contact. */
async function introRelease(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  const r = ok(await db.from("ozc_intro_requests").select("*").eq("id", id).maybeSingle()) as any;
  if (!r) bad("This request is not available.");
  if (r.recipient_decision !== "accepted" || r.status !== "accepted") bad("The profile owner has not accepted this introduction.");
  if (!r.requester_contact_ok || !r.recipient_contact_ok) bad("Both people must agree to share their WhatsApp before contact is released.");
  ok(await db.from("ozc_intro_requests").update({
    status: "introduced", contact_released_at: now(), contact_released_by: c.uid, updated_at: now(),
  }).eq("id", id));
  await audit(c.uid, "contact_release", "ozc_intro", id);
  return { ok: true };
}
async function reportsList() {
  const rows = ok(await db.from("ozc_reports").select("*").order("created_at", { ascending: false }).limit(100)) as any[];
  const pids = [...new Set(rows.map((r) => r.profile_id))];
  const profs = pids.length ? ok(await db.from("ozc_profiles").select("id,alias,status").in("id", pids)) as any[] : [];
  return { reports: rows.map((r) => {
    const p = profs.find((x) => x.id === r.profile_id);
    return { ...r, alias: p?.alias ?? "(removed)", profile_status: p?.status ?? null };
  }) };
}
async function reportSetStatus(c: Caller, b: Record<string, any>) {
  const id = uuid(b.id);
  ok(await db.from("ozc_reports").update({ status: oneOf(b.status, ["open", "actioned", "dismissed"] as const, "status") }).eq("id", id));
  await audit(c.uid, "report_" + b.status, "ozc_report", id);
  return { ok: true };
}
async function adminOverview() {
  const count = async (table: string, f: (q: any) => any) => {
    const { count } = await f(db.from(table).select("id", { count: "exact", head: true }));
    return count ?? 0;
  };
  return {
    pending_profiles: await count("ozc_profiles", (q) => q.eq("status", "pending")),
    active_profiles: await count("ozc_profiles", (q) => q.eq("status", "published")),
    new_requests: await count("ozc_intro_requests", (q) => q.eq("status", "pending")),
    open_reports: await count("ozc_reports", (q) => q.eq("status", "open")),
    unread_anon: await count("anon_messages", (q) => q.eq("status", "unread")),
  };
}

/* ------------------------------------------------------------ anonymous box */
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const ANON_KINDS = ["message", "confession", "question", "matchmaking", "complaint", "abuse"] as const;

async function anonSubmit(req: Request, b: Record<string, any>) {
  if (b.website) return { ok: true }; // honeypot: pretend success
  const body = str(b.body, "Message", 500, 2);
  if (/https?:\/\/|www\./i.test(body)) bad("Links are not allowed in anonymous messages.");
  const kind = b.kind ? oneOf(b.kind, ["message", "confession", "question", "matchmaking"] as const, "message type") : "message";
  if (turnstileSecret) {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: turnstileSecret, response: String(b.turnstile_token ?? "") }),
    });
    if (!(await r.json()).success) bad("Bot check failed. Please try again.");
  }
  // Only a salted daily hash is kept for rate limiting; no IP, account or name is stored, and the hash is wiped after 24h.
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const rate_hash = await sha256(`${ip}|${day}|${rateSalt}`);
  await db.from("anon_messages").update({ rate_hash: null }).lt("created_at", new Date(Date.now() - 864e5).toISOString()).not("rate_hash", "is", null);
  const { count } = await db.from("anon_messages").select("id", { count: "exact", head: true }).eq("rate_hash", rate_hash);
  if ((count ?? 0) >= 5) bad("You have sent enough messages for today. Try again tomorrow.");
  ok(await db.from("anon_messages").insert({ body, kind, rate_hash }));
  return { ok: true };
}
async function anonList() {
  return { messages: ok(await db.from("anon_messages").select("id,body,kind,status,created_at").order("created_at", { ascending: false }).limit(200)) };
}
async function anonSet(c: Caller, b: Record<string, any>) {
  const ids: string[] = (Array.isArray(b.ids) ? b.ids : [b.id]).map(uuid);
  if (b.delete === true) {
    ok(await db.from("anon_messages").delete().in("id", ids));
    await audit(c.uid, "anon_delete", "anon_message", null, { count: ids.length });
  } else {
    const patch: Record<string, unknown> = {};
    if (b.status !== undefined) patch.status = oneOf(b.status, ["unread", "read", "flagged", "approved"] as const, "status");
    if (b.kind !== undefined) patch.kind = oneOf(b.kind, ANON_KINDS, "message type");
    if (!Object.keys(patch).length) bad("Nothing to update.");
    ok(await db.from("anon_messages").update(patch).in("id", ids));
    if (patch.status === "approved") await audit(c.uid, "anon_publish", "anon_message", ids[0], { count: ids.length });
  }
  return { ok: true };
}
async function anonApproved() {
  return { messages: ok(await db.from("anon_messages").select("id,body,kind,created_at").eq("status", "approved").order("created_at", { ascending: false }).limit(30)) };
}

/** Public and anonymous: only counts and a date. No alias, area, bio, interests or contact details. */
async function profilesFeedPublic() {
  const rows = ok(await db.from("ozc_profiles").select("published_at").eq("status", "published")
    .eq("age_18_confirmed", true).eq("consent_confirmed", true).order("published_at", { ascending: false }).limit(1000)) as any[];
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = rows.filter((r) => r.published_at && new Date(r.published_at).getTime() >= weekAgo).length;
  return { total: rows.length, recent, latest_at: rows[0]?.published_at ?? null };
}

/* ------------------------------------------------------------------ router */
Deno.serve(async (req) => {
  const o = req.headers.get("Origin");
  if (o && !origins.includes(o)) return json({ error: "Origin not allowed." }, 403, o);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(o) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, o);
  try {
    if (Number(req.headers.get("Content-Length") || 0) > 64_000) return json({ error: "Request is too large." }, 413, o);
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) bad("Invalid request.");

    // public actions (no sign-in)
    if (b.action === "updates_list") return json(await updatesList(), 200, o);
    if (b.action === "settings_public") return json(await settingsPublic(), 200, o);
    if (b.action === "anon_submit") return json(await anonSubmit(req, b), 200, o);
    if (b.action === "anon_approved") return json(await anonApproved(), 200, o);
    if (b.action === "profiles_feed_public") return json(await profilesFeedPublic(), 200, o);

    const c = await requireCaller(req);
    let r: unknown;
    switch (b.action) {
      case "me": r = { is_admin: isAdmin(c) }; break;
      // students
      case "oz_me": r = await ozMe(c); break;
      case "oz_accept_rules": r = await ozAcceptRules(c, b); break;
      case "oz_profile_save": r = await ozProfileSave(c, b); break;
      case "oz_set_visibility": r = await ozSetVisibility(c, b); break;
      case "oz_delete_mine": r = await ozDeleteMine(c); break;
      case "profiles_list": r = await profilesList(c); break;
      case "intro_request": r = await introRequest(c, b); break;
      case "intro_respond": r = await introRespond(c, b); break;
      case "intro_contact_consent": r = await introContactConsent(c, b); break;
      case "intro_cancel": r = await introCancel(c, b); break;
      case "report_profile": r = await reportProfile(c, b); break;
      default: {
        needAdmin(c);
        switch (b.action) {
          case "admin_overview": r = await adminOverview(); break;
          case "settings_save": r = await settingsSave(c, b); break;
          case "admin_updates_list": r = await adminUpdatesList(); break;
          case "update_save": r = await updateSave(c, b); break;
          case "update_delete": r = await updateDelete(c, b); break;
          case "media_sign_upload": r = await mediaSignUpload(c, b); break;
          case "admin_profiles_list": r = await adminProfilesList(); break;
          case "profile_save": r = await profileSave(c, b); break;
          case "profile_set_status": r = await profileSetStatus(c, b); break;
          case "profile_delete": r = await profileDelete(c, b); break;
          case "intro_list": r = await introList(c); break;
          case "intro_set_status": r = await introSetStatus(c, b); break;
          case "intro_record_decision": r = await introRecordDecision(c, b); break;
          case "intro_release": r = await introRelease(c, b); break;
          case "reports_list": r = await reportsList(); break;
          case "report_set_status": r = await reportSetStatus(c, b); break;
          case "anon_list": r = await anonList(); break;
          case "anon_set": r = await anonSet(c, b); break;
          default: bad("Unknown action.");
        }
      }
    }
    return json(r, 200, o);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400, o);
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500, o);
  }
});
