import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { Megaphone, Pin, Share2, Trash2, Undo2, Plus, Video, ImageIcon, X, Pencil } from "lucide-react";
import { campusApi, uploadCampusMedia, waShare } from "./lib/campusApi";
import "./CampusUpdates.css";

type Media = { id: string; kind: "image" | "video"; url: string | null; caption: string | null };
type Update = {
  id: string; title: string; body: string; category: string; status?: "draft" | "published";
  is_pinned: boolean; published_at: string | null; created_at: string; deleted_at?: string | null; media: Media[];
};
const CATEGORIES = ["general", "academic", "events", "notices", "opportunities", "security", "sports"];
const CHANNEL = import.meta.env.VITE_CAMPUS_WHATSAPP_CHANNEL_URL as string | undefined;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function CampusUpdates({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const [items, setItems] = useState<Update[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [editing, setEditing] = useState<Update | "new" | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (admin: boolean) => {
    setLoading(true); setError("");
    try {
      const r = await campusApi<{ updates: Update[] }>(admin ? user : null, admin ? "admin_updates_list" : "updates_list");
      setItems(r.updates);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    setIsAdmin(false); setAdminMode(false);
    if (!user) return;
    campusApi<{ is_admin: boolean }>(user, "me").then((r) => setIsAdmin(r.is_admin)).catch(() => {});
  }, [user]);
  useEffect(() => { void load(adminMode); }, [adminMode, load]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(adminMode); } catch (e) { setError((e as Error).message); }
  };
  const share = (u: Update) =>
    window.open(waShare(`📢 *${u.title}*\n\n${u.body.slice(0, 280)}${u.body.length > 280 ? "…" : ""}\n\nRead more: ${window.location.origin}`), "_blank", "noopener");

  return (
    <section className="cu">
      <header className="cu-hero">
        <div>
          <span className="cu-eyebrow">OFFICIAL CAMPUS UPDATES</span>
          <h1>Campus Updates</h1>
          <p>Official information, notices and media — the same updates shared on our WhatsApp channel.</p>
        </div>
        <div className="cu-hero-actions">
          {CHANNEL && <a className="cu-btn cu-btn-light" href={CHANNEL} target="_blank" rel="noopener noreferrer">Join WhatsApp channel</a>}
          {isAdmin && <button className="cu-btn" onClick={() => setAdminMode(!adminMode)}>{adminMode ? "Exit admin view" : "Admin desk"}</button>}
        </div>
      </header>

      {error && <p className="cu-error" role="alert">{error}</p>}
      {adminMode && !editing && <button className="cu-btn cu-new" onClick={() => setEditing("new")}><Plus size={16} /> New update</button>}
      {editing && user && (
        <Composer user={user} initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(true); }} />
      )}

      {loading ? <p className="cu-muted">Loading updates…</p> : items.length === 0 ? (
        <div className="cu-empty"><Megaphone size={28} /><p>No updates yet. Check back soon.</p></div>
      ) : items.map((u) => (
        <article key={u.id} className={`cu-card ${u.deleted_at ? "cu-deleted" : ""}`}>
          <div className="cu-meta">
            <span className="cu-chip">{u.category}</span>
            {u.is_pinned && <span className="cu-chip cu-pin"><Pin size={12} /> Pinned</span>}
            {adminMode && u.status === "draft" && <span className="cu-chip cu-draft">Draft</span>}
            {u.deleted_at && <span className="cu-chip cu-draft">Deleted</span>}
            <span className="cu-date">{fmt(u.published_at || u.created_at)}</span>
          </div>
          <h2>{u.title}</h2>
          <p className="cu-body">{u.body}</p>
          {u.media.length > 0 && (
            <div className="cu-media">
              {u.media.map((m) => m.url && (m.kind === "video"
                ? <video key={m.id} src={m.url} controls preload="metadata" />
                : <img key={m.id} src={m.url} alt={m.caption || u.title} loading="lazy" />))}
            </div>
          )}
          <div className="cu-actions">
            <button className="cu-btn cu-btn-ghost" onClick={() => share(u)}><Share2 size={15} /> Share to WhatsApp</button>
            {adminMode && !u.deleted_at && <>
              <button className="cu-btn cu-btn-ghost" onClick={() => setEditing(u)}><Pencil size={15} /> Edit</button>
              <button className="cu-btn cu-btn-danger" onClick={() => window.confirm("Delete this update? You can undo this later.") && act(() => campusApi(user, "update_delete", { id: u.id }))}><Trash2 size={15} /> Delete</button>
            </>}
            {adminMode && u.deleted_at && <>
              <button className="cu-btn cu-btn-ghost" onClick={() => act(() => campusApi(user, "update_delete", { id: u.id, restore: true }))}><Undo2 size={15} /> Restore</button>
              <button className="cu-btn cu-btn-danger" onClick={() => window.confirm("Permanently delete this update and its files? This cannot be undone.") && act(() => campusApi(user, "update_delete", { id: u.id, permanent: true }))}>Delete forever</button>
            </>}
          </div>
        </article>
      ))}
      {!user && <p className="cu-muted"><button className="cu-link" onClick={onSignIn}>Sign in</button> if you are the administrator.</p>}
    </section>
  );
}

function Composer({ user, initial, onClose, onSaved }: { user: User; initial: Update | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "general");
  const [pinned, setPinned] = useState(initial?.is_pinned ?? false);
  const [existing, setExisting] = useState<Media[]>(initial?.media ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<{ storage_path: string; kind: "image" | "video"; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true); setErr("");
    try {
      for (const f of Array.from(files)) {
        const r = await uploadCampusMedia(user, f);
        setAdded((a) => [...a, { ...r, name: f.name }]);
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const save = async (e: FormEvent, status: "draft" | "published") => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await campusApi(user, "update_save", {
        id: initial?.id, title, body, category, status, is_pinned: pinned,
        media_remove: removed, media_add: added.map(({ storage_path, kind }) => ({ storage_path, kind })),
      });
      onSaved();
    } catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  };

  return (
    <form className="cu-composer" onSubmit={(e) => save(e, "published")}>
      <div className="cu-composer-head"><h3>{initial ? "Edit update" : "New update"}</h3><button type="button" className="cu-icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></label>
      <label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={8000} required /></label>
      <div className="cu-row">
        <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="cu-check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to top</label>
      </div>
      <div className="cu-files">
        {existing.map((m) => <span key={m.id} className="cu-file">{m.kind === "video" ? <Video size={14} /> : <ImageIcon size={14} />} saved {m.kind}
          <button type="button" onClick={() => { setRemoved([...removed, m.id]); setExisting(existing.filter((x) => x.id !== m.id)); }} aria-label="Remove"><X size={12} /></button></span>)}
        {added.map((m) => <span key={m.storage_path} className="cu-file">{m.kind === "video" ? <Video size={14} /> : <ImageIcon size={14} />} {m.name}
          <button type="button" onClick={() => setAdded(added.filter((x) => x.storage_path !== m.storage_path))} aria-label="Remove"><X size={12} /></button></span>)}
      </div>
      <label className="cu-upload">{busy ? "Uploading…" : "Add photos or video (video up to 50 MB)"}
        <input type="file" accept="image/*,video/mp4,video/webm" multiple disabled={busy} onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} /></label>
      {err && <p className="cu-error" role="alert">{err}</p>}
      <div className="cu-actions">
        <button className="cu-btn" disabled={busy} type="submit">Publish</button>
        <button className="cu-btn cu-btn-ghost" disabled={busy} type="button" onClick={(e) => save(e as unknown as FormEvent, "draft")}>Save draft</button>
      </div>
    </form>
  );
}
