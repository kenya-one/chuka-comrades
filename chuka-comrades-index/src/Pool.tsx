import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { CircleDot, MapPin, Users, Trophy, MessageCircle, Share2, RefreshCw, Plus, Pencil } from "lucide-react";
import { gamesApi, openWhatsApp, waNumber, type PoolPlayer, type PoolPoint } from "./lib/gamesApi";
import { useMe, useSettings, StatusBar, ProfileModal, ActivationModal, TournamentsPanel, AdminPayments, Notice, Empty, Schedule, Modal, DriveImg } from "./games/ui";
import { PoolLogo } from "./games/logos";
import "./games/games.css";

type Tab = "points" | "players" | "competitions";

export default function Pool({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const hash = window.location.hash.match(/^#\/pool\/tournament\/([\w-]+)/);
  const [tab, setTab] = useState<Tab>(hash ? "competitions" : "points");
  const [notice, setNotice] = useState("");
  const [points, setPoints] = useState<PoolPoint[]>([]);
  const [players, setPlayers] = useState<PoolPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<"" | "profile" | "activate">("");
  const [editing, setEditing] = useState<PoolPoint | "new" | null>(null);
  const { me, reload } = useMe(user);
  const settings = useSettings();
  const active = me?.user.activation === "active";
  const notify = useCallback((m: string) => setNotice(m), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pts, pl] = await Promise.all([me?.isAdmin && user ? gamesApi.adminPoolPoints(user) : gamesApi.poolPoints(), gamesApi.poolPlayers()]);
      setPoints(pts);
      setPlayers(pl);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not load pool data."); } finally { setLoading(false); }
  }, [me?.isAdmin, user]);
  useEffect(() => { void load(); }, [load]);

  const needActive = () => { setNotice("Activate your profile to use this feature."); setModal(me?.user.profile === "complete" ? "activate" : "profile"); };

  const contact = async (id: string) => {
    if (!user) return onSignIn();
    if (!active) return needActive();
    try { const r = await gamesApi.contact(user, "pool", id); window.open(`https://wa.me/${waNumber(r.whatsapp)}`, "_blank", "noopener,noreferrer"); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not get contact."); }
  };

  return (
    <section className="gm-wrap">
      <div className="gm-hero gm-hero-red">
        <div className="gm-mark"><PoolLogo /></div>
        <div><span className="gm-kicker">CHUKA COMRADES GAMING</span><h1>Chuka Pool</h1><p>Find pool points, players and competitions around Chuka.</p></div>
        <button className="gm-refresh" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={16} className={loading ? "gm-spin" : ""} /></button>
      </div>

      <StatusBar user={user} me={me} settings={settings} onSignIn={onSignIn} onProfile={() => setModal("profile")} onActivate={() => setModal("activate")} />
      <Notice text={notice} onClose={() => setNotice("")} />

      <div className="gm-tabs">
        <button className={tab === "points" ? "on" : ""} onClick={() => setTab("points")}><MapPin size={15} /> Pool points</button>
        <button className={tab === "players" ? "on" : ""} onClick={() => setTab("players")}><Users size={15} /> Players</button>
        <button className={tab === "competitions" ? "on" : ""} onClick={() => setTab("competitions")}><Trophy size={15} /> Competitions</button>
      </div>

      {tab === "points" && (
        <>
          <div className="gm-heading"><div><h2>Pool points</h2><p>Venues around Chuka, managed by the admin.</p></div>
            {me?.isAdmin && <button className="gm-primary gm-small" onClick={() => setEditing("new")}><Plus size={15} /> Add pool point</button>}</div>
          {points.length === 0 ? <Empty icon={<CircleDot size={30} />} title="No pool points yet" hint="The admin will add venues soon." /> : (
            <div className="gm-grid">
              {points.map(p => (
                <article className="gm-card" key={p.id}>
                  <DriveImg className="gm-img" id={p.imageId} url={p.image} alt={p.name} />
                  <div className="gm-body"><strong>🎱 {p.name}</strong>
                    <span className="gm-sm"><MapPin size={12} /> {p.location}{p.status === "inactive" ? " · inactive" : ""}</span>
                    {p.description && <p className="gm-desc">{p.description}</p>}
                    {p.managerWhatsApp && <button className="gm-wa" onClick={() => openWhatsApp(`Hello${p.managerName ? ` ${p.managerName}` : ""}, I found ${p.name} on Chuka Comrades. Is the pool table available right now?`, p.managerWhatsApp)}><MessageCircle size={15} /> Ask if pool is available</button>}
                    {p.mapsUrl && <a className="gm-ghost" href={p.mapsUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> View location</a>}
                    <button className="gm-ghost" onClick={() => openWhatsApp(`🎱 ${p.name}\n📍 ${p.location}${p.mapsUrl ? `\n🗺️ ${p.mapsUrl}` : ""}\n\nFound on Chuka Comrades.`)}><Share2 size={14} /> Share on WhatsApp</button>
                    {me?.isAdmin && <button className="gm-ghost" onClick={() => setEditing(p)}><Pencil size={14} /> Edit</button>}</div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "players" && (
        <>
          <div className="gm-heading"><div><h2>Pool players</h2><p>Active students who play pool.</p></div>
            {user && !me?.pool && <button className="gm-primary gm-small" onClick={() => setModal("profile")}><Plus size={15} /> My profile</button>}</div>
          {players.length === 0 ? <Empty icon={<Users size={30} />} title="No pool players yet" hint="Create your pool profile and activate it." /> : (
            <div className="gm-grid">
              {players.map(p => (
                <article className="gm-card" key={p.id}><div className="gm-body"><strong>🎱 {p.name}</strong>
                  <span className="gm-sm">{p.course} — {p.year}</span>
                  {p.points && <span className="gm-sm"><MapPin size={12} /> {p.points}</span>}
                  <Schedule items={p.availability} />
                  <button className="gm-wa" onClick={() => void contact(p.id)}><MessageCircle size={15} /> Contact on WhatsApp</button></div></article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "competitions" && (
        <TournamentsPanel user={user} me={me} game="Pool" focusId={hash?.[1]} poolPoints={points} onSignIn={onSignIn} onNeedActive={needActive} notify={notify} />
      )}

      {me?.isAdmin && user && <AdminPayments user={user} onChanged={() => void reload()} notify={notify} />}

      {modal === "profile" && user && <ProfileModal user={user} me={me} game="Pool" onClose={() => setModal("")} onSaved={() => { void reload(); void load(); }} notify={notify} />}
      {modal === "activate" && user && <ActivationModal user={user} settings={settings} onClose={() => setModal("")} onDone={() => void reload()} notify={notify} />}
      {editing && user && <PoolPointModal user={user} point={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={load} notify={notify} />}
    </section>
  );
}

function PoolPointModal({ user, point, onClose, onDone, notify }: { user: User; point: PoolPoint | null; onClose: () => void; onDone: () => void; notify: (m: string) => void }) {
  const [f, setF] = useState({ name: point?.name || "", location: point?.location || "", mapsUrl: point?.mapsUrl || "", description: point?.description || "", status: point?.status || "active", managerName: point?.managerName || "", managerWhatsApp: point?.managerWhatsApp || "" });
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const up = image ? await gamesApi.upload(user, image, "pool") : null;
      await gamesApi.adminSavePoolPoint(user, { ...f, id: point?.id, ...(up ? { imageFileId: up.fileId, imageUrl: up.url } : {}) });
      notify("Pool point saved.");
      onDone(); onClose();
    } catch (e) { notify(e instanceof Error ? e.message : "Could not save pool point."); } finally { setBusy(false); }
  };
  return (
    <Modal title={point ? "Edit pool point" : "Add pool point"} onClose={onClose}>
      <label>Pool point name<input value={f.name} onChange={e => set("name", e.target.value)} placeholder="Mwamba Pool Point" /></label>
      <label>Image<input type="file" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} /></label>
      <label>Location<input value={f.location} onChange={e => set("location", e.target.value)} placeholder="Chuka town" /></label>
      <label>Google Maps link<input value={f.mapsUrl} onChange={e => set("mapsUrl", e.target.value)} placeholder="https://maps.google.com/…" /></label>
      <label>Manager name (optional)<input value={f.managerName} onChange={e => set("managerName", e.target.value)} placeholder="e.g. Mwangi" /></label>
      <label>Manager WhatsApp (so players can ask if the table is free)<input value={f.managerWhatsApp} inputMode="tel" onChange={e => set("managerWhatsApp", e.target.value)} placeholder="07XXXXXXXX" /></label>
      <label>Description<textarea value={f.description} onChange={e => set("description", e.target.value)} /></label>
      <label>Status<select value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <button className="gm-primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : point ? "Save changes" : "Add pool point"}</button>
    </Modal>
  );
}
