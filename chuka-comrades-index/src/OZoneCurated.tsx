import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { Heart, Flag, Share2, ShieldCheck, Trash2, EyeOff, Eye, Send } from "lucide-react";
import { campusApi, waShare } from "./lib/campusApi";
import "./OZoneCurated.css";

type Profile = {
  id: string; alias: string; age_band: string; gender: string; looking_for: string; category: "dating" | "hookup";
  area: string; bio: string; interests: string[]; status?: string; age_18_confirmed?: boolean; consent_confirmed?: boolean;
  share_in_group_ok?: boolean; private?: { real_name: string | null; whatsapp: string; admin_notes: string | null; consent_note: string | null } | null;
};
type Intro = { id: string; alias: string; requester_name: string; message: string; status: string; created_at: string };
type Report = { id: string; alias: string; reason: string; status: string; created_at: string };
type Anon = { id: string; body: string; status: string; created_at: string };

const ADMIN_WA = (import.meta.env.VITE_OZC_ADMIN_WHATSAPP || import.meta.env.VITE_HOSTEL_ADMIN_WHATSAPP || "") as string;
const GROUP = import.meta.env.VITE_OZC_WHATSAPP_GROUP_URL as string | undefined;
const NGL = import.meta.env.VITE_OZONE_NGL_URL as string | undefined;
const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const AGE_BANDS = ["18-20", "21-23", "24-26", "27-30", "31+"];
const GENDERS = ["Woman", "Man", "Non-binary", "Prefer not to say"];
const LOOKING = ["Women", "Men", "Everyone"];

type Tab = "browse" | "anon" | "profiles" | "intros" | "reports" | "inbox";

export default function OZoneCurated({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const [tab, setTab] = useState<Tab>("browse");
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(false);
    if (user) campusApi<{ is_admin: boolean }>(user, "me").then((r) => setIsAdmin(r.is_admin)).catch(() => {});
  }, [user]);

  const getListed = `https://wa.me/${ADMIN_WA.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I'd like to be listed on Chuka O Zone. I confirm I am 18 or over.")}`;
  const tabs: [Tab, string][] = [["browse", "Browse profiles"], ["anon", "Anonymous box"]];
  if (isAdmin) tabs.push(["profiles", "Manage profiles"], ["intros", "Intro requests"], ["reports", "Reports"], ["inbox", "Anon inbox"]);

  return (
    <section className="ozc">
      <header className="ozc-hero">
        <span className="ozc-eyebrow">ADULTS 18+ ONLY</span>
        <h1>Chuka O Zone</h1>
        <p>Dating and casual connections, curated by an admin. Profiles use aliases only — no phone numbers, no photos, no exact locations.</p>
        <div className="ozc-hero-actions">
          {ADMIN_WA && <a className="ozc-btn ozc-btn-light" href={getListed} target="_blank" rel="noopener noreferrer">Get listed (DM admin)</a>}
          {GROUP && <a className="ozc-btn ozc-btn-ghost-light" href={GROUP} target="_blank" rel="noopener noreferrer">Join WhatsApp group</a>}
        </div>
      </header>
      <nav className="ozc-tabs" aria-label="O Zone sections">
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>)}
      </nav>
      {tab === "browse" && <Browse user={user} onSignIn={onSignIn} />}
      {tab === "anon" && <AnonBox />}
      {isAdmin && tab === "profiles" && <AdminProfiles user={user!} />}
      {isAdmin && tab === "intros" && <AdminIntros user={user!} />}
      {isAdmin && tab === "reports" && <AdminReports user={user!} />}
      {isAdmin && tab === "inbox" && <AdminInbox user={user!} />}
      <p className="ozc-privacy"><ShieldCheck size={14} /> Privacy: contact details are stored privately and only the admin can see them. Nobody is introduced without agreeing. Ask the admin any time to remove your profile and data.</p>
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

/* ---------- members ---------- */
function Browse({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const { data, error, setError } = useLoad(
    async () => user ? (await campusApi<{ profiles: Profile[] }>(user, "profiles_list")).profiles : [], [user]);
  const [filter, setFilter] = useState<"all" | "dating" | "hookup">("all");
  const [notice, setNotice] = useState("");
  if (!user) return <div className="ozc-card ozc-center"><p>Sign in to browse profiles. They are never public on the open web.</p><button className="ozc-btn" onClick={onSignIn}>Sign in</button></div>;

  const request = async (p: Profile) => {
    const message = window.prompt(`Say a little about yourself for the admin to pass on to "${p.alias}" (no phone numbers or links):`, "");
    if (message === null) return;
    try { await campusApi(user, "intro_request", { profile_id: p.id, message }); setNotice("Request sent. The admin will contact the profile owner and only connect you if they agree."); setError(""); }
    catch (e) { setError((e as Error).message); }
  };
  const report = async (p: Profile) => {
    const reason = window.prompt("What is wrong with this profile? (fake, abusive, underage, etc.)");
    if (!reason) return;
    try { await campusApi(user, "report_profile", { profile_id: p.id, reason }); setNotice("Thank you. The admin will review your report."); }
    catch (e) { setError((e as Error).message); }
  };
  const list = (data ?? []).filter((p) => filter === "all" || p.category === filter);

  return <>
    <div className="ozc-filters">{(["all", "dating", "hookup"] as const).map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "dating" ? "Dating" : "Casual connection"}</button>)}</div>
    {notice && <p className="ozc-ok">{notice}</p>}
    {error && <p className="ozc-error" role="alert">{error}</p>}
    {data && list.length === 0 && <div className="ozc-card ozc-center"><p>No profiles to show yet.</p></div>}
    <div className="ozc-grid">
      {list.map((p) => (
        <article key={p.id} className="ozc-card ozc-profile">
          <div className="ozc-avatar" aria-hidden>{p.alias.charAt(0).toUpperCase()}</div>
          <h3>{p.alias}</h3>
          <p className="ozc-sub">{p.gender} · {p.age_band} · {p.area}</p>
          <span className={`ozc-chip ${p.category}`}>{p.category === "dating" ? "Dating" : "Casual connection"}</span>
          <p className="ozc-bio">{p.bio || "No bio yet."}</p>
          <p className="ozc-sub">Looking for: {p.looking_for}</p>
          {p.interests.length > 0 && <div className="ozc-tags">{p.interests.map((i) => <span key={i}>{i}</span>)}</div>}
          <div className="ozc-actions">
            <button className="ozc-btn" onClick={() => request(p)}><Heart size={14} /> Request intro</button>
            <button className="ozc-btn ozc-btn-quiet" onClick={() => report(p)} aria-label="Report profile"><Flag size={14} /> Report</button>
          </div>
        </article>
      ))}
    </div>
  </>;
}

/* ---------- anonymous box ---------- */
function AnonBox() {
  const [body, setBody] = useState("");
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
      await campusApi(null, "anon_submit", { body, website: trap, turnstile_token: token });
      setBody(""); setState({ ok: "Sent anonymously. We don't store your name, account or IP address." });
    } catch (err) { setState({ err: (err as Error).message }); } finally { setBusy(false); }
  };

  return <>
    <form className="ozc-card" onSubmit={send}>
      <h3>Send an anonymous message</h3>
      <p className="ozc-sub">Confessions, questions, tips or concerns. Nothing is shown publicly until the admin approves it. If you are in danger or thinking of harming yourself, please contact someone you trust or a local helpline right away.</p>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={500} minLength={2} required placeholder="Type your message…" />
      <input className="ozc-trap" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} aria-hidden />
      <div ref={widget} />
      <div className="ozc-row"><span className="ozc-sub">{body.length}/500</span>
        <button className="ozc-btn" disabled={busy || (!!TURNSTILE_KEY && !token)}><Send size={14} /> {busy ? "Sending…" : "Send"}</button></div>
      {state.ok && <p className="ozc-ok">{state.ok}</p>}
      {state.err && <p className="ozc-error" role="alert">{state.err}</p>}
      {NGL && <p className="ozc-sub">Prefer NGL? <a href={NGL} target="_blank" rel="noopener noreferrer">Send it there instead</a>.</p>}
    </form>
    {approved && approved.length > 0 && <div className="ozc-card"><h3>Approved by admin</h3>
      {approved.map((m) => <blockquote key={m.id}>{m.body}</blockquote>)}</div>}
  </>;
}

/* ---------- admin ---------- */
const blank = { alias: "", age_band: "21-23", gender: "Woman", looking_for: "Everyone", category: "dating", area: "", bio: "", interests: "",
  whatsapp: "", real_name: "", admin_notes: "", consent_note: "", age_18_confirmed: false, consent_confirmed: false, share_in_group_ok: false };

function AdminProfiles({ user }: { user: User }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ profiles: Profile[] }>(user, "admin_profiles_list")).profiles, [user]);
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [open, setOpen] = useState(false);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

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
      setOpen(false); setForm(blank); await reload();
    } catch (err) { setError((err as Error).message); }
  };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError((e as Error).message); } };
  const shareCard = (p: Profile) => {
    if (!p.share_in_group_ok) return setError("This person has not agreed to be shared in the group.");
    window.open(waShare(`💜 *Chuka O Zone*\n\n*${p.alias}* · ${p.age_band} · ${p.area}\n${p.bio}\n\nInterested? Tap "Request intro" in the app: ${window.location.origin}`), "_blank", "noopener");
  };

  return <>
    {error && <p className="ozc-error" role="alert">{error}</p>}
    {!open && <button className="ozc-btn" onClick={() => { setForm(blank); setOpen(true); }}>+ Add profile</button>}
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
          <label>Category<select value={form.category} onChange={(e) => set("category", e.target.value)}><option value="dating">Dating</option><option value="hookup">Casual connection</option></select></label>
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
          <button className="ozc-btn" disabled={!form.age_18_confirmed || !form.consent_confirmed}>Publish</button>
          <button type="button" className="ozc-btn ozc-btn-quiet" onClick={(e) => save(e, "draft")}>Save draft</button>
          <button type="button" className="ozc-btn ozc-btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    )}
    <div className="ozc-grid">
      {(data ?? []).map((p) => (
        <article key={p.id} className="ozc-card ozc-profile">
          <h3>{p.alias} <span className={`ozc-chip ${p.status}`}>{p.status}</span></h3>
          <p className="ozc-sub">{p.gender} · {p.age_band} · {p.area} · {p.category}</p>
          <p className="ozc-sub">📞 {p.private?.whatsapp ?? "—"}{p.private?.real_name ? ` · ${p.private.real_name}` : ""}</p>
          <div className="ozc-actions">
            <button className="ozc-btn ozc-btn-quiet" onClick={() => edit(p)}>Edit</button>
            {p.status === "published"
              ? <button className="ozc-btn ozc-btn-quiet" onClick={() => act(() => campusApi(user, "profile_set_status", { id: p.id, status: "paused" }))}><EyeOff size={14} /> Pause</button>
              : <button className="ozc-btn ozc-btn-quiet" onClick={() => act(() => campusApi(user, "profile_set_status", { id: p.id, status: "published" }))}><Eye size={14} /> Publish</button>}
            {p.status === "published" && <button className="ozc-btn ozc-btn-quiet" onClick={() => shareCard(p)}><Share2 size={14} /> Share</button>}
            <button className="ozc-btn ozc-btn-danger" onClick={() => window.confirm(`Permanently delete "${p.alias}" and all private data?`) && act(() => campusApi(user, "profile_delete", { id: p.id }))}><Trash2 size={14} /> Delete</button>
          </div>
        </article>
      ))}
    </div>
  </>;
}

function AdminIntros({ user }: { user: User }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ requests: Intro[] }>(user, "intro_list")).requests, [user]);
  const set = async (id: string, status: string) => { try { await campusApi(user, "intro_set_status", { id, status }); await reload(); } catch (e) { setError((e as Error).message); } };
  return <>
    {error && <p className="ozc-error">{error}</p>}
    {data?.length === 0 && <div className="ozc-card ozc-center">No intro requests.</div>}
    {data?.map((r) => (
      <div key={r.id} className="ozc-card">
        <div className="ozc-row"><b>{r.requester_name} → {r.alias}</b><span className={`ozc-chip ${r.status}`}>{r.status}</span></div>
        <p>{r.message || <i>No message</i>}</p>
        <div className="ozc-actions">
          {["forwarded", "accepted", "declined", "closed"].map((s) => <button key={s} className="ozc-btn ozc-btn-quiet" disabled={r.status === s} onClick={() => set(r.id, s)}>{s}</button>)}
        </div>
      </div>))}
  </>;
}

function AdminReports({ user }: { user: User }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ reports: Report[] }>(user, "reports_list")).reports, [user]);
  const set = async (id: string, status: string) => { try { await campusApi(user, "report_set_status", { id, status }); await reload(); } catch (e) { setError((e as Error).message); } };
  return <>
    {error && <p className="ozc-error">{error}</p>}
    {data?.length === 0 && <div className="ozc-card ozc-center">No reports.</div>}
    {data?.map((r) => (
      <div key={r.id} className="ozc-card">
        <div className="ozc-row"><b>{r.alias}</b><span className={`ozc-chip ${r.status}`}>{r.status}</span></div>
        <p>{r.reason}</p>
        <div className="ozc-actions">{["actioned", "dismissed", "open"].map((s) => <button key={s} className="ozc-btn ozc-btn-quiet" disabled={r.status === s} onClick={() => set(r.id, s)}>{s}</button>)}</div>
      </div>))}
  </>;
}

function AdminInbox({ user }: { user: User }) {
  const { data, error, reload, setError } = useLoad(async () => (await campusApi<{ messages: Anon[] }>(user, "anon_list")).messages, [user]);
  const [sel, setSel] = useState<string[]>([]);
  const act = async (payload: Record<string, unknown>) => { try { await campusApi(user, "anon_set", payload); setSel([]); await reload(); } catch (e) { setError((e as Error).message); } };
  return <>
    {error && <p className="ozc-error">{error}</p>}
    <div className="ozc-actions">
      <button className="ozc-btn ozc-btn-danger" disabled={!sel.length} onClick={() => window.confirm(`Delete ${sel.length} message(s) permanently?`) && act({ ids: sel, delete: true })}>Delete selected ({sel.length})</button>
      <button className="ozc-btn ozc-btn-quiet" onClick={() => setSel((data ?? []).map((m) => m.id))}>Select all</button>
    </div>
    {data?.length === 0 && <div className="ozc-card ozc-center">Inbox is empty.</div>}
    {data?.map((m) => (
      <div key={m.id} className={`ozc-card ${m.status === "unread" ? "ozc-unread" : ""}`}>
        <label className="ozc-check"><input type="checkbox" checked={sel.includes(m.id)} onChange={(e) => setSel(e.target.checked ? [...sel, m.id] : sel.filter((x) => x !== m.id))} />
          <span className={`ozc-chip ${m.status}`}>{m.status}</span> <span className="ozc-sub">{new Date(m.created_at).toLocaleString("en-KE")}</span></label>
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
