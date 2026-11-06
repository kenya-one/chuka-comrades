import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { Heart, Flag, Share2, ShieldCheck, Trash2, EyeOff, Eye, Send, MessageCircle, Check, X } from "lucide-react";
import { campusApi, fetchSettings, waLink, waShare, EMPTY_SETTINGS, type CampusSettings } from "./lib/campusApi";
import "./OZoneCurated.css";

/* ------------------------------------------------------------------ types */
type Intention = "dating" | "hookup";
type Profile = {
  id: string; alias: string; age_band: string; gender: string; looking_for: string; category: Intention;
  area: string; bio: string; interests: string[]; status?: string; owner_uid?: string | null; activated_by?: string | null;
  age_18_confirmed?: boolean; consent_confirmed?: boolean; share_in_group_ok?: boolean;
  private?: { real_name: string | null; whatsapp: string; admin_notes: string | null; consent_note: string | null } | null;
};
type MyProfile = Profile & { whatsapp: string; real_name: string };
type Contact = { name: string | null; whatsapp: string } | null;
type MyReq = {
  id: string; code: string; intention: Intention; status: string; decision: string; alias: string; created_at: string;
  my_contact_ok: boolean; their_contact_ok: boolean; contact: Contact; message?: string; age_band?: string | null; bio?: string;
};
type Me = {
  is_admin: boolean; rules: { accepted: boolean; version: string };
  profile: MyProfile | null; outgoing: MyReq[]; incoming: MyReq[];
};
type AdminReq = {
  id: string; code: string; intention: Intention; status: string; message: string; created_at: string; decision: string;
  decision_source: string | null; admin_note: string | null; requester_contact_ok: boolean; recipient_contact_ok: boolean;
  alias: string; requester_alias: string | null; requester_name: string;
  released: { requester: Contact; recipient: Contact } | null;
};
type Report = { id: string; alias: string; reason: string; status: string; created_at: string; profile_status: string | null; profile_id: string };
type Anon = { id: string; body: string; kind: string; status: string; created_at: string };
type Overview = { pending_profiles: number; active_profiles: number; new_requests: number; open_reports: number; unread_anon: number };

const ENV_ADMIN_WA = (import.meta.env.VITE_OZC_ADMIN_WHATSAPP || import.meta.env.VITE_HOSTEL_ADMIN_WHATSAPP || "") as string;
const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const AGE_BANDS = ["18-20", "21-23", "24-26", "27-30", "31+"];
const GENDERS = ["Woman", "Man", "Non-binary", "Prefer not to say"];
const LOOKING = ["Women", "Men", "Everyone"];
const intentionLabel = (i: string) => (i === "hookup" ? "Hookup" : "Dating");
const statusLabel: Record<string, string> = {
  pending: "Pending activation", published: "Active", paused: "Paused", suspended: "Suspended", draft: "Draft", removed: "Removed",
};
const reqLabel: Record<string, string> = {
  pending: "Waiting for admin", forwarded: "Admin contacted them", accepted: "Accepted", declined: "Declined",
  closed: "Closed", introduced: "Introduced",
};

const RULES: string[] = [
  "I confirm that I am at least 18 years old.",
  "I will respect every person's boundaries and decisions, and never pressure anyone into dating, hookups or sharing contacts.",
  "I understand that every introduction needs the other person's agreement, and sharing WhatsApp numbers needs separate consent from both of us.",
  "I will not share anyone's photos, messages, phone number or private details without their permission.",
  "I will not harass, threaten, blackmail, stalk, scam or impersonate anyone, or create fake profiles.",
  "I will not use anonymous messages to abuse people, and I will never try to expose who sent one.",
  "I understand that O Zone does not guarantee matches or introductions, and that the admin cannot force anyone to accept.",
  "I have read and agree to the O Zone Safety Rules, Privacy Notice and Terms of Use below.",
];

type Tab = "discover" | "mine" | "anon" | "a_profiles" | "a_requests" | "a_reports" | "a_inbox" | "a_settings";

/* ------------------------------------------------------------------- root */
export default function OZoneCurated({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const [tab, setTab] = useState<Tab>("discover");
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<CampusSettings>(EMPTY_SETTINGS);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const adminWa = settings.ozone_admin_whatsapp || ENV_ADMIN_WA;

  useEffect(() => { void fetchSettings().then(setSettings); }, []);

  const loadMe = useCallback(async () => {
    if (!user) { setMe(null); setOverview(null); return; }
    setLoading(true); setErr("");
    try {
      const r = await campusApi<Me>(user, "oz_me");
      setMe(r);
      if (r.is_admin) setOverview(await campusApi<Overview>(user, "admin_overview"));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void loadMe(); }, [loadMe]);
  useEffect(() => { if (!user) setTab((t) => (t === "anon" ? t : "discover")); }, [user]);

  const isAdmin = !!me?.is_admin;
  const tabs: [Tab, string, number?][] = [["discover", "Discover"], ["mine", "My O Zone"], ["anon", "Anonymous box"]];
  if (isAdmin) tabs.push(
    ["a_profiles", "Profiles", overview?.pending_profiles], ["a_requests", "Requests", overview?.new_requests],
    ["a_reports", "Reports", overview?.open_reports], ["a_inbox", "NGL inbox", overview?.unread_anon], ["a_settings", "Settings"]);

  const activateMsg = `Hi Admin, I've created my Chuka O Zone profile${me?.profile ? ` (${me.profile.alias})` : ""}. Please share the activation steps.`;

  return (
    <section className="ozc">
      <header className="ozc-hero">
        <span className="ozc-eyebrow">ADULTS 18+ ONLY</span>
        <h1>Chuka O Zone</h1>
        <p>Private, admin-coordinated introductions for Chuka comrades. Profiles use aliases — no phone numbers shown, and nobody is introduced without agreeing.</p>
        <div className="ozc-hero-actions">
          {settings.ozone_channel_url && <a className="ozc-btn ozc-btn-ghost-light" href={settings.ozone_channel_url} target="_blank" rel="noopener noreferrer">Follow O Zone on WhatsApp</a>}
          {adminWa && <a className="ozc-btn ozc-btn-light" href={waLink(adminWa, "Hi Admin, I have a question about Chuka O Zone.")} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Message admin</a>}
        </div>
      </header>

      <nav className="ozc-tabs" aria-label="O Zone sections">
        {tabs.map(([k, label, n]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}{n ? <span className="ozc-badge">{n}</span> : null}</button>))}
      </nav>
      {err && <p className="ozc-error" role="alert">{err}</p>}

      {tab === "anon" && <AnonBox ngl={settings.ozone_ngl_url} />}
      {tab !== "anon" && !user && (
        <div className="ozc-card ozc-center"><p>Sign in with Google to create a profile and browse. Profiles are never public on the open web.</p>
          <button className="ozc-btn" onClick={onSignIn}>Sign in</button></div>
      )}
      {tab !== "anon" && user && loading && !me && <div className="ozc-card ozc-center">Loading…</div>}
      {tab !== "anon" && user && me && !me.rules.accepted && !tab.startsWith("a_") && <RulesGate user={user} onDone={loadMe} />}
      {user && me && (me.rules.accepted || tab.startsWith("a_")) && <>
        {tab === "discover" && <Discover user={user} me={me} adminWa={adminWa} activateMsg={activateMsg} goMine={() => setTab("mine")} />}
        {tab === "mine" && <Mine user={user} me={me} reload={loadMe} adminWa={adminWa} activateMsg={activateMsg} />}
        {isAdmin && tab === "a_profiles" && <AdminProfiles user={user} onChange={loadMe} />}
        {isAdmin && tab === "a_requests" && <AdminRequests user={user} onChange={loadMe} />}
        {isAdmin && tab === "a_reports" && <AdminReports user={user} onChange={loadMe} />}
        {isAdmin && tab === "a_inbox" && <AdminInbox user={user} onChange={loadMe} />}
        {isAdmin && tab === "a_settings" && <AdminSettings user={user} settings={settings} onSaved={setSettings} />}
      </>}

      <p className="ozc-privacy"><ShieldCheck size={14} /> Privacy: WhatsApp numbers and real names are stored privately and are shown to someone only after the owner accepts an introduction and both people agree to share. This app does not record any payments. You can pause or delete your profile and data at any time.</p>
    </section>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try { setError(""); setData(await fn()); } catch (e) { setError((e as Error).message); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload, setError };
}

/* ------------------------------------------------------------ safety rules */
function RulesGate({ user, onDone }: { user: User; onDone: () => void }) {
  const [checked, setChecked] = useState<boolean[]>(RULES.map(() => false));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const count = checked.filter(Boolean).length;
  const accept = async () => {
    setBusy(true); setErr("");
    try { await campusApi(user, "oz_accept_rules", { accepted: true, statements: count }); onDone(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="ozc-card">
      <h3>Safety first: your privacy, your choices, your responsibility</h3>
      <p className="ozc-sub">O Zone involves dating, adult connections and personal contact details, so you must accept every statement below before using it. Accepting these rules is not consent to any particular introduction or to sharing your number — you will be asked separately each time.</p>
      <details className="ozc-rules"><summary>Read the safety rules</summary>
        <ul>
          <li><b>Eligibility:</b> only adults aged 18+ who are Chuka community members.</li>
          <li><b>Honesty:</b> real photos and truthful details; no impersonation.</li>
          <li><b>Respect:</b> no harassment, discrimination, threats, blackmail or unwanted advances.</li>
          <li><b>Consent:</b> every introduction, contact exchange and meeting is voluntary and can be withdrawn at any time.</li>
          <li><b>Privacy:</b> never leak numbers, private photos, conversations or personal information.</li>
          <li><b>Anonymous messages:</b> no threats, hate, sexual harassment or doxxing.</li>
          <li><b>Money safety:</b> no fraud or extortion, and no claim that paying anyone guarantees acceptance. Only the official admin account arranges introductions.</li>
          <li><b>Meeting safely:</b> meet in public, arrange your own transport and tell someone you trust.</li>
          <li><b>Not allowed (removal possible):</b> fake profiles or stolen photos, unsolicited explicit images, sharing intimate images without consent, scams, impersonating the admin, getting someone's number by other means, or creating extra accounts to dodge a ban.</li>
        </ul>
        <p className="ozc-sub">Your data is handled under the Kenya Data Protection Act, 2019. You can ask the admin to correct or delete it at any time.</p>
      </details>
      {RULES.map((r, i) => (
        <label key={i} className="ozc-check ozc-rule"><input type="checkbox" checked={checked[i]} onChange={(e) => setChecked(checked.map((c, j) => (j === i ? e.target.checked : c)))} /> {r}</label>))}
      <div className="ozc-row"><span className="ozc-sub">{count} of {RULES.length} accepted</span>
        <button className="ozc-btn" disabled={count !== RULES.length || busy} onClick={accept}>{busy ? "Saving…" : "I accept and continue"}</button></div>
      {err && <p className="ozc-error" role="alert">{err}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- discover */
function Discover({ user, me, adminWa, activateMsg, goMine }: { user: User; me: Me; adminWa: string; activateMsg: string; goMine: () => void }) {
  const { data, error, setError } = useLoad(async () => (await campusApi<{ profiles: Profile[] }>(user, "profiles_list")).profiles, [user]);
  const [filter, setFilter] = useState<"all" | Intention>("all");
  const [notice, setNotice] = useState("");
  const [picking, setPicking] = useState<Profile | null>(null);
  const [done, setDone] = useState<{ code: string; alias: string; intention: Intention } | null>(null);
  const active = me.profile?.status === "published";

  const report = async (p: Profile) => {
    const reason = window.prompt("What is wrong with this profile? (fake, abusive, underage, etc.)");
    if (!reason) return;
    try { await campusApi(user, "report_profile", { profile_id: p.id, reason }); setNotice("Thank you. The admin will review your report."); setError(""); }
    catch (e) { setError((e as Error).message); }
  };
  const list = (data ?? []).filter((p) => filter === "all" || p.category === filter);

  return <>
    {!me.profile && <div className="ozc-card"><b>Create your profile to request introductions.</b> <button className="ozc-btn ozc-btn-quiet" onClick={goMine}>Create profile</button></div>}
    {me.profile && !active && (
      <div className="ozc-card">
        <b>Your profile is {statusLabel[me.profile.status ?? ""]?.toLowerCase() ?? "not active"}.</b> You can browse, but only active profiles can request introductions.
        {me.profile.status === "pending" && adminWa && <> <a className="ozc-btn ozc-btn-quiet" href={waLink(adminWa, activateMsg)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Message admin to activate</a></>}
      </div>)}
    <div className="ozc-filters">{(["all", "dating", "hookup"] as const).map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : intentionLabel(f)}</button>)}</div>
    {notice && <p className="ozc-ok">{notice}</p>}
    {error && <p className="ozc-error" role="alert">{error}</p>}
    {done && <Handoff done={done} adminWa={adminWa} onClose={() => setDone(null)} />}
    {picking && <RequestPicker user={user} target={picking} adminWa={adminWa} onClose={() => setPicking(null)}
      onSent={(d) => { setPicking(null); setDone(d); }} />}
    {data && list.length === 0 && <div className="ozc-card ozc-center"><p>No active profiles to show yet.</p></div>}
    <div className="ozc-grid">
      {list.map((p) => (
        <article key={p.id} className="ozc-card ozc-profile">
          <div className="ozc-avatar" aria-hidden>{p.alias.charAt(0).toUpperCase()}</div>
          <h3>{p.alias}</h3>
          <p className="ozc-sub">{p.gender} · {p.age_band} · {p.area}</p>
          <span className={`ozc-chip ${p.category}`}>{intentionLabel(p.category)}</span>
          <p className="ozc-bio">{p.bio || "No bio yet."}</p>
          <p className="ozc-sub">Looking for: {p.looking_for}</p>
          {p.interests.length > 0 && <div className="ozc-tags">{p.interests.map((i) => <span key={i}>{i}</span>)}</div>}
          <div className="ozc-actions">
            <button className="ozc-btn" disabled={!active} title={active ? "" : "Your profile must be active"} onClick={() => { setDone(null); setPicking(p); }}><Heart size={14} /> Request intro</button>
            <button className="ozc-btn ozc-btn-quiet" onClick={() => report(p)} aria-label="Report profile"><Flag size={14} /> Report</button>
          </div>
        </article>))}
    </div>
  </>;
}

function RequestPicker({ user, target, adminWa, onClose, onSent }: {
  user: User; target: Profile; adminWa: string; onClose: () => void;
  onSent: (d: { code: string; alias: string; intention: Intention }) => void;
}) {
  const [intention, setIntention] = useState<Intention>(target.category);
  const [message, setMessage] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await campusApi<{ code: string }>(user, "intro_request", { profile_id: target.id, intention, message });
      onSent({ code: r.code, alias: target.alias, intention });
    } catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  };
  return (
    <form className="ozc-card ozc-form" onSubmit={send}>
      <div className="ozc-row"><h3>Request an introduction to {target.alias}</h3><button type="button" className="ozc-btn ozc-btn-quiet" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      <p className="ozc-sub">What kind of introduction is this? {target.alias} decides separately for each request, and a dating request is never treated as a hookup request.</p>
      <div className="ozc-choice">
        {(["dating", "hookup"] as const).map((i) => (
          <label key={i} className={`ozc-pick ${intention === i ? "on" : ""}`}>
            <input type="radio" name="intention" checked={intention === i} onChange={() => setIntention(i)} />
            <b>{intentionLabel(i)}</b><span>{i === "dating" ? "A romantic connection." : "A casual connection between consenting adults."}</span>
          </label>))}
      </div>
      <label>A short note for the admin to pass on (optional — no phone numbers or links)
        <textarea rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      <label className="ozc-check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I understand {target.alias} may say no, nothing is guaranteed, and the admin will explain the process and any service charges on WhatsApp{adminWa ? "" : " (admin WhatsApp not set yet)"}.</label>
      {err && <p className="ozc-error" role="alert">{err}</p>}
      <div className="ozc-actions"><button className="ozc-btn" disabled={!sure || busy}>{busy ? "Sending…" : "Send request"}</button></div>
    </form>
  );
}

/** After a request is created, hand the student over to the admin's WhatsApp with the request code prefilled. */
function Handoff({ done, adminWa, onClose }: { done: { code: string; alias: string; intention: Intention }; adminWa: string; onClose: () => void }) {
  const text = `O-Zone Introduction Request\nHello O-Zone Admin,\n\nI would like to request an introduction on Chuka O Zone.\n\nRequest ID: ${done.code}\nRequested profile: ${done.alias}\nRequest type: ${intentionLabel(done.intention)}\n\nKindly share the introduction procedure and any applicable charges.`;
  const opened = useRef(false);
  useEffect(() => {
    if (!adminWa || opened.current) return;
    opened.current = true;
    window.open(waLink(adminWa, text), "_blank", "noopener");
  }, [adminWa, text]);
  return (
    <div className="ozc-card ozc-ok-card">
      <h3>Request {done.code} created</h3>
      <p>The final step is to message the admin on WhatsApp — it only takes a tap. Your request stays private; {done.alias} is told nothing until the admin contacts them.</p>
      <div className="ozc-actions">
        {adminWa
          ? <a className="ozc-btn" href={waLink(adminWa, text)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Open WhatsApp to message admin</a>
          : <span className="ozc-sub">The admin has not set a WhatsApp number yet. Quote <b>{done.code}</b> when you contact them.</span>}
        <button className="ozc-btn ozc-btn-quiet" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- my o zone */
const blankMine = { alias: "", age_band: "21-23", gender: "Woman", looking_for: "Everyone", category: "dating" as Intention, area: "Chuka", bio: "", interests: "", whatsapp: "", real_name: "" };

function Mine({ user, me, reload, adminWa, activateMsg }: { user: User; me: Me; reload: () => Promise<void>; adminWa: string; activateMsg: string }) {
  const p = me.profile;
  const [form, setForm] = useState(blankMine);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(!p);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!p) return;
    setForm({ alias: p.alias, age_band: p.age_band, gender: p.gender, looking_for: p.looking_for, category: p.category, area: p.area,
      bio: p.bio, interests: p.interests.join(", "), whatsapp: p.whatsapp, real_name: p.real_name });
  }, [p]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setErr(""); setNotice("");
    try { await fn(); if (ok) setNotice(ok); await reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await campusApi(user, "oz_profile_save", { ...form, interests: form.interests.split(",").map((s) => s.trim()).filter(Boolean) });
      setEditing(false);
    }, p ? "Profile updated." : "Profile created. It is not visible yet — message the admin to activate it.");
  };
  const shareProfile = () => window.open(waShare(`💜 Meet new people on *Chuka O Zone* — private, admin-coordinated introductions for Chuka comrades (18+).\n\nJoin here: ${window.location.origin}${window.location.pathname}`), "_blank", "noopener");

  return <>
    {notice && <p className="ozc-ok">{notice}</p>}
    {err && <p className="ozc-error" role="alert">{err}</p>}

    {p && (
      <div className="ozc-card">
        <div className="ozc-row"><h3>{p.alias}</h3><span className={`ozc-chip ${p.status}`}>{statusLabel[p.status ?? ""] ?? p.status}</span></div>
        {p.status === "pending" && <p>Your profile is saved but <b>not visible yet</b>. The admin activates it after confirming your activation on WhatsApp.</p>}
        {p.status === "published" && <p>Your profile is <b>active</b> and visible to signed-in members.</p>}
        {p.status === "paused" && <p>Your profile is <b>paused</b> and hidden from everyone.</p>}
        {p.status === "suspended" && <p>Your profile has been <b>suspended</b> by the admin. Please message the admin if you think this is a mistake.</p>}
        <div className="ozc-actions">
          {p.status === "pending" && adminWa && <a className="ozc-btn" href={waLink(adminWa, activateMsg)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Message admin to activate</a>}
          {p.status === "published" && <>
            <button className="ozc-btn ozc-btn-quiet" disabled={busy} onClick={() => run(() => campusApi(user, "oz_set_visibility", { visible: false }), "Profile paused.")}><EyeOff size={14} /> Pause profile</button>
            <button className="ozc-btn ozc-btn-quiet" onClick={shareProfile}><Share2 size={14} /> Share O Zone on WhatsApp</button></>}
          {p.status === "paused" && p.activated_by && <button className="ozc-btn ozc-btn-quiet" disabled={busy} onClick={() => run(() => campusApi(user, "oz_set_visibility", { visible: true }), "Profile is visible again.")}><Eye size={14} /> Show my profile again</button>}
          {!editing && p.status !== "suspended" && <button className="ozc-btn ozc-btn-quiet" onClick={() => setEditing(true)}>Edit profile</button>}
        </div>
      </div>)}

    {editing && (
      <form className="ozc-card ozc-form" onSubmit={save}>
        <h3>{p ? "Edit your profile" : "Create your profile"}</h3>
        <p className="ozc-sub"><b>Public</b> — shown to signed-in members. Use a nickname; no phone, links, hostel or exact location.</p>
        <div className="ozc-two">
          <label>Nickname<input value={form.alias} onChange={(e) => set("alias", e.target.value)} maxLength={40} required /></label>
          <label>Area (general)<input value={form.area} onChange={(e) => set("area", e.target.value)} maxLength={60} required /></label>
          <label>Age band<select value={form.age_band} onChange={(e) => set("age_band", e.target.value)}>{AGE_BANDS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Gender<select value={form.gender} onChange={(e) => set("gender", e.target.value)}>{GENDERS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Looking for<select value={form.looking_for} onChange={(e) => set("looking_for", e.target.value)}>{LOOKING.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Mainly interested in<select value={form.category} onChange={(e) => set("category", e.target.value)}><option value="dating">Dating</option><option value="hookup">Hookup</option></select></label>
        </div>
        <label>Short bio<textarea rows={3} maxLength={400} value={form.bio} onChange={(e) => set("bio", e.target.value)} /></label>
        <label>Interests (comma separated)<input value={form.interests} onChange={(e) => set("interests", e.target.value)} /></label>
        <p className="ozc-sub"><b>Private</b> — never shown to members. Released only if you and the other person both agree.</p>
        <div className="ozc-two">
          <label>WhatsApp number<input type="tel" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} required placeholder="07… or 254…" /></label>
          <label>Real name (optional)<input value={form.real_name} onChange={(e) => set("real_name", e.target.value)} maxLength={100} /></label>
        </div>
        <div className="ozc-actions">
          <button className="ozc-btn" disabled={busy}>{busy ? "Saving…" : p ? "Save changes" : "Create profile"}</button>
          {p && <button type="button" className="ozc-btn ozc-btn-quiet" onClick={() => setEditing(false)}>Cancel</button>}
        </div>
      </form>)}

    {p && <Requests user={user} me={me} reload={reload} />}

    {p && (
      <div className="ozc-card">
        <h3>Delete my profile</h3>
        <p className="ozc-sub">Permanently removes your profile, WhatsApp number and requests from O Zone.</p>
        <button className="ozc-btn ozc-btn-danger" disabled={busy} onClick={() => window.confirm("Permanently delete your O Zone profile and all related requests?") && run(() => campusApi(user, "oz_delete_mine"), "Your profile was deleted.")}><Trash2 size={14} /> Delete my profile</button>
      </div>)}
  </>;
}

function Requests({ user, me, reload }: { user: User; me: Me; reload: () => Promise<void> }) {
  const [err, setErr] = useState("");
  const call = async (action: string, payload: Record<string, unknown>) => {
    setErr("");
    try { await campusApi(user, action, payload); await reload(); } catch (e) { setErr((e as Error).message); }
  };
  const open = (r: MyReq) => !["closed", "declined", "introduced"].includes(r.status);

  const consentRow = (r: MyReq) => r.status === "accepted" && (
    <label className="ozc-check ozc-consent">
      <input type="checkbox" checked={r.my_contact_ok} onChange={(e) => call("intro_contact_consent", { id: r.id, ok: e.target.checked })} />
      I agree to share my WhatsApp number and name with this person (separate from accepting the introduction).
      <span className="ozc-sub"> They have {r.their_contact_ok ? "agreed" : "not agreed yet"}.</span>
    </label>);
  const contactBox = (r: MyReq) => r.contact && (
    <p className="ozc-revealed"><b>{r.contact.name}</b><br />WhatsApp: <a href={waLink(r.contact.whatsapp, `Hi ${r.alias}, we were introduced through Chuka O Zone.`)} target="_blank" rel="noopener noreferrer">{r.contact.whatsapp}</a></p>);

  return <>
    {err && <p className="ozc-error" role="alert">{err}</p>}
    <div className="ozc-card">
      <h3>Requests to me</h3>
      <p className="ozc-sub">Only you decide. The admin never sees your answer as a yes unless you give it (or tell them yourself).</p>
      {me.incoming.length === 0 && <p className="ozc-sub">No requests yet.</p>}
      {me.incoming.map((r) => (
        <div key={r.id} className="ozc-req">
          <div className="ozc-row"><b>{r.code} · {r.alias}{r.age_band ? ` · ${r.age_band}` : ""}</b><span className={`ozc-chip ${r.intention}`}>{intentionLabel(r.intention)}</span></div>
          {r.bio && <p className="ozc-sub">{r.bio}</p>}
          {r.message && <blockquote>{r.message}</blockquote>}
          <span className={`ozc-chip ${r.status}`}>{reqLabel[r.status] ?? r.status}</span>
          {r.decision === "pending" && open(r) && (
            <div className="ozc-actions">
              <button className="ozc-btn" onClick={() => call("intro_respond", { id: r.id, decision: "accepted" })}><Check size={14} /> Accept this {intentionLabel(r.intention).toLowerCase()} introduction</button>
              <button className="ozc-btn ozc-btn-quiet" onClick={() => call("intro_respond", { id: r.id, decision: "declined" })}><X size={14} /> Decline</button>
            </div>)}
          {consentRow(r)}{contactBox(r)}
          {open(r) && r.decision === "accepted" && <button className="ozc-btn ozc-btn-quiet" onClick={() => window.confirm("Withdraw from this introduction?") && call("intro_cancel", { id: r.id })}>Withdraw</button>}
        </div>))}
    </div>
    <div className="ozc-card">
      <h3>My requests</h3>
      {me.outgoing.length === 0 && <p className="ozc-sub">You have not requested any introductions.</p>}
      {me.outgoing.map((r) => (
        <div key={r.id} className="ozc-req">
          <div className="ozc-row"><b>{r.code} → {r.alias}</b><span className={`ozc-chip ${r.intention}`}>{intentionLabel(r.intention)}</span></div>
          <span className={`ozc-chip ${r.status}`}>{reqLabel[r.status] ?? r.status}</span>
          {r.status === "declined" && <p className="ozc-sub">The introduction was not accepted. We do not share reasons.</p>}
          {consentRow(r)}{contactBox(r)}
          {open(r) && <button className="ozc-btn ozc-btn-quiet" onClick={() => window.confirm("Cancel this request?") && call("intro_cancel", { id: r.id })}>Cancel request</button>}
        </div>))}
    </div>
  </>;
}

/* ------------------------------------------------------------ anonymous box */
function AnonBox({ ngl }: { ngl: string }) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("message");
  const [trap, setTrap] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  const { data: approved } = useLoad(async () => (await campusApi<{ messages: Anon[] }>(null, "anon_approved")).messages, []);

  useEffect(() => {
    if (!TURNSTILE_KEY || !widget.current) return;
    const render = () => (window as any).turnstile?.render(widget.current, { sitekey: TURNSTILE_KEY, callback: setToken });
    if ((window as any).turnstile) { render(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = render;
    document.head.appendChild(s);
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setState({});
    try {
      await campusApi(null, "anon_submit", { body, kind, website: trap, turnstile_token: token });
      setBody(""); setState({ ok: "Sent anonymously to the O Zone admin. We don't store your name, account or IP address." });
    } catch (err) { setState({ err: (err as Error).message }); } finally { setBusy(false); }
  };

  return <>
    <form className="ozc-card ozc-form" onSubmit={send}>
      <h3>Send an anonymous message to the admin</h3>
      <p className="ozc-sub">Confessions, questions, or “I like someone — can you help?”. Only the admin reads these, and nothing is shown publicly unless the admin approves it. Anonymous does not mean abuse: threats and harassment are deleted. If you are in danger or thinking of harming yourself, please contact someone you trust or a local helpline right away.</p>
      <label>Type of message
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="message">General message</option><option value="confession">Confession</option>
          <option value="question">Question</option><option value="matchmaking">Matchmaking request</option>
        </select></label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={500} minLength={2} required placeholder="Type your message… (don't include phone numbers or links)" />
      <input className="ozc-trap" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} aria-hidden />
      <div ref={widget} />
      <div className="ozc-row"><span className="ozc-sub">{body.length}/500</span>
        <button className="ozc-btn" disabled={busy || (!!TURNSTILE_KEY && !token)}><Send size={14} /> {busy ? "Sending…" : "Send"}</button></div>
      {state.ok && <p className="ozc-ok">{state.ok}</p>}
      {state.err && <p className="ozc-error" role="alert">{state.err}</p>}
      {ngl && <p className="ozc-sub">Prefer NGL? <a href={ngl} target="_blank" rel="noopener noreferrer">Send it there instead</a>.</p>}
    </form>
    {approved && approved.length > 0 && <div className="ozc-card"><h3>Approved by admin</h3>
      {approved.map((m) => <blockquote key={m.id}>{m.body}</blockquote>)}</div>}
  </>;
}

/* -------------------------------------------------------------------- admin */
const blank = { alias: "", age_band: "21-23", gender: "Woman", looking_for: "Everyone", category: "dating", area: "", bio: "", interests: "",
  whatsapp: "", real_name: "", admin_notes: "", consent_note: "", age_18_confirmed: false, consent_confirmed: false, share_in_group_ok: false };

function AdminProfiles({ user, onChange }: { user: User; onChange: () => void }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ profiles: Profile[] }>(user, "admin_profiles_list")).profiles, [user]);
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = async () => { await reload(); onChange(); };

  const edit = (p: Profile) => {
    setForm({ ...blank, id: p.id, alias: p.alias, age_band: p.age_band, gender: p.gender, looking_for: p.looking_for, category: p.category, area: p.area,
      bio: p.bio, interests: p.interests.join(", "), whatsapp: p.private?.whatsapp ?? "", real_name: p.private?.real_name ?? "",
      admin_notes: p.private?.admin_notes ?? "", consent_note: p.private?.consent_note ?? "",
      age_18_confirmed: !!p.age_18_confirmed, consent_confirmed: !!p.consent_confirmed, share_in_group_ok: !!p.share_in_group_ok });
    setOpen(true);
  };
  const save = async (e: FormEvent, status: "draft" | "published") => {
    e.preventDefault();
    try {
      await campusApi(user, "profile_save", { ...form, status, interests: form.interests.split(",").map((s) => s.trim()).filter(Boolean) });
      setOpen(false); setForm(blank); await refresh();
    } catch (err) { setError((err as Error).message); }
  };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await refresh(); } catch (e) { setError((e as Error).message); } };
  const setStatus = (p: Profile, status: string) => act(() => campusApi(user, "profile_set_status", { id: p.id, status }));
  const activate = (p: Profile) => {
    if (!window.confirm(`Activate "${p.alias}"?\n\nOnly continue if you have verified their activation on WhatsApp and checked they are an eligible adult. This app records only that you activated them — no payment details.`)) return;
    void setStatus(p, "published");
  };
  const shareCard = (p: Profile) => {
    if (!p.share_in_group_ok) return setError("This person has not agreed to be shared in the group.");
    window.open(waShare(`💜 *Chuka O Zone*\n\n*${p.alias}* · ${p.age_band} · ${p.area}\n${p.bio}\n\nInterested? Open Chuka Comrades → O Zone → Request intro: ${window.location.origin}`), "_blank", "noopener");
  };
  const list = (data ?? []).filter((p) => filter === "all" || p.status === filter);

  return <>
    {error && <p className="ozc-error" role="alert">{error}</p>}
    <div className="ozc-filters">{["all", "pending", "published", "paused", "suspended"].map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : statusLabel[f]}</button>)}</div>
    {!open && <button className="ozc-btn" onClick={() => { setForm(blank); setOpen(true); }}>+ Add profile (someone who asked you to list them)</button>}
    {open && (
      <form className="ozc-card ozc-form" onSubmit={(e) => save(e, "published")}>
        <h3>{form.id ? "Edit profile" : "New profile"}</h3>
        <p className="ozc-sub"><b>Public</b> — shown to signed-in members. No phone, real name, hostel or photo.</p>
        <div className="ozc-two">
          <label>Alias<input value={form.alias} onChange={(e) => set("alias", e.target.value)} maxLength={40} required /></label>
          <label>Area (general)<input value={form.area} onChange={(e) => set("area", e.target.value)} maxLength={60} required /></label>
          <label>Age band<select value={form.age_band} onChange={(e) => set("age_band", e.target.value)}>{AGE_BANDS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Gender<select value={form.gender} onChange={(e) => set("gender", e.target.value)}>{GENDERS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Looking for<select value={form.looking_for} onChange={(e) => set("looking_for", e.target.value)}>{LOOKING.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Category<select value={form.category} onChange={(e) => set("category", e.target.value)}><option value="dating">Dating</option><option value="hookup">Hookup</option></select></label>
        </div>
        <label>Short bio<textarea rows={3} maxLength={400} value={form.bio} onChange={(e) => set("bio", e.target.value)} /></label>
        <label>Interests (comma separated)<input value={form.interests} onChange={(e) => set("interests", e.target.value)} /></label>
        <p className="ozc-sub"><b>Private</b> — admin only, never sent to members.</p>
        <div className="ozc-two">
          <label>WhatsApp number<input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} required={!form.id} /></label>
          <label>Real name (optional)<input value={form.real_name} onChange={(e) => set("real_name", e.target.value)} /></label>
        </div>
        <label>Consent note (how/when they agreed)<input value={form.consent_note} onChange={(e) => set("consent_note", e.target.value)} maxLength={300} /></label>
        <label>Admin notes<textarea rows={2} maxLength={1000} value={form.admin_notes} onChange={(e) => set("admin_notes", e.target.value)} /></label>
        <label className="ozc-check"><input type="checkbox" checked={form.age_18_confirmed} onChange={(e) => set("age_18_confirmed", e.target.checked)} /> I have confirmed this person is 18 or over</label>
        <label className="ozc-check"><input type="checkbox" checked={form.consent_confirmed} onChange={(e) => set("consent_confirmed", e.target.checked)} /> This person agreed to be listed</label>
        <label className="ozc-check"><input type="checkbox" checked={form.share_in_group_ok} onChange={(e) => set("share_in_group_ok", e.target.checked)} /> OK to share their profile card in the WhatsApp group</label>
        <div className="ozc-actions">
          <button className="ozc-btn" disabled={!form.age_18_confirmed || !form.consent_confirmed}>Save &amp; activate</button>
          <button type="button" className="ozc-btn ozc-btn-quiet" onClick={(e) => save(e, "draft")}>Save draft</button>
          <button type="button" className="ozc-btn ozc-btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>)}
    {data && list.length === 0 && <div className="ozc-card ozc-center">No profiles here.</div>}
    <div className="ozc-grid">
      {list.map((p) => (
        <article key={p.id} className="ozc-card ozc-profile">
          <h3>{p.alias} <span className={`ozc-chip ${p.status}`}>{statusLabel[p.status ?? ""] ?? p.status}</span></h3>
          <p className="ozc-sub">{p.gender} · {p.age_band} · {p.area} · {intentionLabel(p.category)}</p>
          <p className="ozc-sub">{p.owner_uid ? "Self-registered" : "Added by you"}{p.activated_by ? " · activated" : ""}</p>
          <p className="ozc-sub">📞 {p.private?.whatsapp ?? "—"}{p.private?.real_name ? ` · ${p.private.real_name}` : ""}</p>
          <div className="ozc-actions">
            {p.status !== "published" && p.status !== "removed" && <button className="ozc-btn" onClick={() => activate(p)}><Check size={14} /> Activate</button>}
            {p.status === "published" && <button className="ozc-btn ozc-btn-quiet" onClick={() => setStatus(p, "paused")}><EyeOff size={14} /> Pause</button>}
            {p.status !== "suspended" && <button className="ozc-btn ozc-btn-quiet" onClick={() => window.confirm(`Suspend "${p.alias}"? Open requests will be closed.`) && setStatus(p, "suspended")}>Suspend</button>}
            {!p.owner_uid && <button className="ozc-btn ozc-btn-quiet" onClick={() => edit(p)}>Edit</button>}
            {p.status === "published" && <button className="ozc-btn ozc-btn-quiet" onClick={() => shareCard(p)}><Share2 size={14} /> Share</button>}
            <button className="ozc-btn ozc-btn-danger" onClick={() => window.confirm(`Permanently delete "${p.alias}" and all private data?`) && act(() => campusApi(user, "profile_delete", { id: p.id }))}><Trash2 size={14} /> Delete</button>
          </div>
        </article>))}
    </div>
  </>;
}

function AdminRequests({ user, onChange }: { user: User; onChange: () => void }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ requests: AdminReq[] }>(user, "intro_list")).requests, [user]);
  const run = async (action: string, payload: Record<string, unknown>) => {
    try { await campusApi(user, action, payload); await reload(); onChange(); } catch (e) { setError((e as Error).message); }
  };
  const contactLine = (c: Contact) => (c ? `${c.name || "—"} · ${c.whatsapp}` : "—");
  return <>
    {error && <p className="ozc-error">{error}</p>}
    {data?.length === 0 && <div className="ozc-card ozc-center">No intro requests.</div>}
    {data?.map((r) => {
      const finished = ["closed", "declined", "introduced"].includes(r.status);
      const ready = r.status === "accepted" && r.requester_contact_ok && r.recipient_contact_ok;
      return (
        <div key={r.id} className="ozc-card">
          <div className="ozc-row"><b>{r.code} · {r.requester_name}{r.requester_alias ? ` (${r.requester_alias})` : ""} → {r.alias}</b>
            <span><span className={`ozc-chip ${r.intention}`}>{intentionLabel(r.intention)}</span><span className={`ozc-chip ${r.status}`}>{reqLabel[r.status] ?? r.status}</span></span></div>
          <p>{r.message || <i>No message</i>}</p>
          <p className="ozc-sub">
            Owner decision: <b>{r.decision}</b>{r.decision_source === "admin_whatsapp" ? " (recorded by you from WhatsApp)" : r.decision_source === "student" ? " (answered in the app)" : ""}
            {" · "}Contact consent — requester: {r.requester_contact_ok ? "yes" : "no"}, owner: {r.recipient_contact_ok ? "yes" : "no"}
          </p>
          {r.released && <p className="ozc-revealed"><b>Released</b><br />Requester: {contactLine(r.released.requester)}<br />Owner: {contactLine(r.released.recipient)}</p>}
          {!finished && (
            <div className="ozc-actions">
              {r.status === "pending" && <button className="ozc-btn ozc-btn-quiet" onClick={() => run("intro_set_status", { id: r.id, status: "forwarded" })}>Mark: I contacted the owner</button>}
              {r.decision === "pending" && <>
                <button className="ozc-btn ozc-btn-quiet" onClick={() => window.confirm("Record that the owner told you on WhatsApp they ACCEPT? Only do this if they clearly said so.") && run("intro_record_decision", { id: r.id, decision: "accepted" })}>Owner accepted (on WhatsApp)</button>
                <button className="ozc-btn ozc-btn-quiet" onClick={() => run("intro_record_decision", { id: r.id, decision: "declined" })}>Owner declined</button></>}
              <button className="ozc-btn" disabled={!ready} title={ready ? "" : "Needs acceptance and both people's contact consent"} onClick={() => window.confirm("Release both people's WhatsApp details to each other? Both have consented.") && run("intro_release", { id: r.id })}>Release contact</button>
              <button className="ozc-btn ozc-btn-quiet" onClick={() => window.confirm("Close this request?") && run("intro_set_status", { id: r.id, status: "closed" })}>Close</button>
            </div>)}
        </div>);
    })}
  </>;
}

function AdminReports({ user, onChange }: { user: User; onChange: () => void }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ reports: Report[] }>(user, "reports_list")).reports, [user]);
  const set = async (id: string, status: string) => { try { await campusApi(user, "report_set_status", { id, status }); await reload(); onChange(); } catch (e) { setError((e as Error).message); } };
  const suspend = async (r: Report) => {
    if (!window.confirm(`Suspend "${r.alias}" and close their open requests?`)) return;
    try { await campusApi(user, "profile_set_status", { id: r.profile_id, status: "suspended" }); await set(r.id, "actioned"); } catch (e) { setError((e as Error).message); }
  };
  return <>
    {error && <p className="ozc-error">{error}</p>}
    {data?.length === 0 && <div className="ozc-card ozc-center">No reports.</div>}
    {data?.map((r) => (
      <div key={r.id} className="ozc-card">
        <div className="ozc-row"><b>{r.alias}</b><span className={`ozc-chip ${r.status}`}>{r.status}</span></div>
        <p>{r.reason}</p>
        <p className="ozc-sub">{new Date(r.created_at).toLocaleString("en-KE")} · profile: {r.profile_status ? statusLabel[r.profile_status] ?? r.profile_status : "removed"}</p>
        <div className="ozc-actions">
          {r.profile_status && r.profile_status !== "suspended" && <button className="ozc-btn ozc-btn-danger" onClick={() => suspend(r)}>Suspend profile</button>}
          {["actioned", "dismissed", "open"].map((s) => <button key={s} className="ozc-btn ozc-btn-quiet" disabled={r.status === s} onClick={() => set(r.id, s)}>{s}</button>)}
        </div>
      </div>))}
  </>;
}

function AdminInbox({ user, onChange }: { user: User; onChange: () => void }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ messages: Anon[] }>(user, "anon_list")).messages, [user]);
  const [sel, setSel] = useState<string[]>([]);
  const act = async (payload: Record<string, unknown>) => { try { await campusApi(user, "anon_set", payload); setSel([]); await reload(); onChange(); } catch (e) { setError((e as Error).message); } };
  return <>
    {error && <p className="ozc-error">{error}</p>}
    <p className="ozc-sub">Anonymous messages go only to you. We keep no sender identity, so you cannot and should not try to trace anyone. Delete anything threatening or abusive.</p>
    <div className="ozc-actions">
      <button className="ozc-btn ozc-btn-danger" disabled={!sel.length} onClick={() => window.confirm(`Delete ${sel.length} message(s) permanently?`) && act({ ids: sel, delete: true })}>Delete selected ({sel.length})</button>
      <button className="ozc-btn ozc-btn-quiet" onClick={() => setSel((data ?? []).map((m) => m.id))}>Select all</button>
    </div>
    {data?.length === 0 && <div className="ozc-card ozc-center">Inbox is empty.</div>}
    {data?.map((m) => (
      <div key={m.id} className={`ozc-card ${m.status === "unread" ? "ozc-unread" : ""}`}>
        <label className="ozc-check"><input type="checkbox" checked={sel.includes(m.id)} onChange={(e) => setSel(e.target.checked ? [...sel, m.id] : sel.filter((x) => x !== m.id))} />
          <span className={`ozc-chip ${m.status}`}>{m.status}</span><span className="ozc-chip">{m.kind}</span> <span className="ozc-sub">{new Date(m.created_at).toLocaleString("en-KE")}</span></label>
        <p>{m.body}</p>
        <div className="ozc-actions">
          <button className="ozc-btn ozc-btn-quiet" onClick={() => act({ id: m.id, status: "read" })}>Mark read</button>
          <button className="ozc-btn ozc-btn-quiet" onClick={() => act({ id: m.id, status: "flagged" })}>Flag</button>
          <button className="ozc-btn ozc-btn-quiet" onClick={() => window.confirm("Show this message publicly? Check that it names or targets no real person.") && act({ id: m.id, status: "approved" })}>Approve to publish</button>
          <button className="ozc-btn ozc-btn-danger" onClick={() => act({ id: m.id, delete: true })}><Trash2 size={14} /> Delete</button>
        </div>
      </div>))}
  </>;
}

function AdminSettings({ user, settings, onSaved }: { user: User; settings: CampusSettings; onSaved: (s: CampusSettings) => void }) {
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ ok?: string; err?: string }>({});
  useEffect(() => { setForm(settings); }, [settings]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setState({});
    try {
      const r = await campusApi<{ settings: CampusSettings }>(user, "settings_save", {
        settings: { ozone_admin_whatsapp: form.ozone_admin_whatsapp, ozone_channel_url: form.ozone_channel_url, ozone_ngl_url: form.ozone_ngl_url },
      });
      onSaved({ ...EMPTY_SETTINGS, ...r.settings }); setState({ ok: "Saved." });
    } catch (err) { setState({ err: (err as Error).message }); } finally { setBusy(false); }
  };
  return (
    <form className="ozc-card ozc-form" onSubmit={save}>
      <h3>O Zone links</h3>
      <label>Admin WhatsApp number (students message this to request introductions and activation)
        <input value={form.ozone_admin_whatsapp} onChange={(e) => setForm({ ...form, ozone_admin_whatsapp: e.target.value })} placeholder="2547XXXXXXXX" /></label>
      <label>O Zone WhatsApp channel (recommended — followers' numbers stay hidden)
        <input type="url" value={form.ozone_channel_url} onChange={(e) => setForm({ ...form, ozone_channel_url: e.target.value })} placeholder="https://whatsapp.com/channel/…" /></label>
      <label>Your NGL link (optional)
        <input type="url" value={form.ozone_ngl_url} onChange={(e) => setForm({ ...form, ozone_ngl_url: e.target.value })} placeholder="https://ngl.link/…" /></label>
      <p className="ozc-sub">Set up the admin-only WhatsApp group inside WhatsApp (Group settings → Send messages → Only admins). A website cannot enforce that. Note that group members can see each other's numbers, so a Channel is the more private option.</p>
      <div className="ozc-actions"><button className="ozc-btn" disabled={busy}>{busy ? "Saving…" : "Save links"}</button></div>
      {state.ok && <p className="ozc-ok">{state.ok}</p>}
      {state.err && <p className="ozc-error" role="alert">{state.err}</p>}
    </form>
  );
}
