import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import { X, MessageCircle, Share2, Trophy, Copy, Lock, Plus, Trash2, Clock, Users, ShieldCheck, Settings2 } from "lucide-react";
import {
  gamesApi, openWhatsApp, formatDate, formatTime, tournamentShareText,
  type Me, type Settings, type Tournament, type MyTournament, type PoolPoint, type Availability,
} from "../lib/gamesApi";
import "./games.css";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const YEARS = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"];
const err = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/* ───────── hooks & small pieces ───────── */

export function useMe(user: User | null) {
  const [me, setMe] = useState<Me | null>(null);
  const reload = useCallback(async () => {
    if (!user) { setMe(null); return; }
    try { setMe(await gamesApi.me(user)); } catch { setMe(null); }
  }, [user]);
  useEffect(() => { void reload(); }, [reload]);
  return { me, reload };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ activationFee: 20, mpesaTill: "", adminWhatsApp: "" });
  useEffect(() => { gamesApi.settings().then(setSettings).catch(() => undefined); }, []);
  return settings;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="gm-overlay" onClick={onClose}>
      <div className="gm-modal" onClick={e => e.stopPropagation()}>
        <div className="gm-modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Notice({ text, onClose }: { text: string; onClose: () => void }) {
  if (!text) return null;
  return <div className="gm-notice" role="status">{text}<button onClick={onClose} aria-label="Dismiss"><X size={15} /></button></div>;
}

export function DriveImg({ id, url, alt, className }: { id?: string; url?: string; alt: string; className?: string }) {
  const sources = [
    id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : "",
    id ? `https://lh3.googleusercontent.com/d/${id}=w1000` : "",
    url || "",
  ].filter((v, i, a) => v && a.indexOf(v) === i);
  const [i, setI] = useState(0);
  if (!sources.length || i >= sources.length) return <div className={`${className || ""} gm-noimg`} role="img" aria-label={alt}>🖼️</div>;
  return <img key={sources[i]} className={className} src={sources[i]} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setI(n => n + 1)} />;
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return <div className="gm-empty">{icon}<strong>{title}</strong><span>{hint}</span></div>;
}

export function Schedule({ items }: { items: Availability[] }) {
  if (!items.length) return null;
  return <div className="gm-schedule">{items.slice(0, 4).map((a, i) => <span key={i}><Clock size={11} /> {a.day.slice(0, 3)} {formatTime(a.start)}–{formatTime(a.end)}</span>)}</div>;
}

export function StatusBar({ user, me, settings, onSignIn, onProfile, onActivate }: {
  user: User | null; me: Me | null; settings: Settings; onSignIn: () => void; onProfile: () => void; onActivate: () => void;
}) {
  if (!user) return <div className="gm-status gm-status-grey"><Lock size={16} /><span>Sign in to create your profile and join tournaments.</span><button onClick={onSignIn}>Sign in</button></div>;
  if (!me) return null;
  if (me.user.activation === "active") return <div className="gm-status gm-status-green"><ShieldCheck size={16} /><span><b>Active Chuka Comrades Player</b></span><button onClick={onProfile}>Edit profile</button></div>;
  if (me.user.activation === "pending") return <div className="gm-status gm-status-blue"><Clock size={16} /><span>Payment submitted — waiting for admin verification.</span></div>;
  if (me.user.profile !== "complete") return <div className="gm-status gm-status-red"><Lock size={16} /><span>Profile not active. Create your profile, then activate for KSh {settings.activationFee}.</span><button onClick={onProfile}>Create profile</button></div>;
  return <div className="gm-status gm-status-red"><Lock size={16} /><span>Profile not active — activate for KSh {settings.activationFee}.</span><button onClick={onActivate}>Activate</button></div>;
}

/* ───────── profile ───────── */

export function ProfileModal({ user, me, game, onClose, onSaved, notify }: {
  user: User; me: Me | null; game: "eFootball" | "Pool"; onClose: () => void; onSaved: () => void; notify: (m: string) => void;
}) {
  const [course, setCourse] = useState(me?.user.course || "");
  const [year, setYear] = useState(me?.user.year || "Year 1");
  const [whatsapp, setWhatsapp] = useState(me?.user.whatsapp || "");
  const [username, setUsername] = useState(me?.efootball?.username || "");
  const [poolName, setPoolName] = useState(me?.pool?.name || "");
  const [poolPoints, setPoolPoints] = useState(me?.pool?.points || "");
  const [image, setImage] = useState<File | null>(null);
  const [slots, setSlots] = useState<Availability[]>(me?.availability?.length ? me.availability : []);
  const [busy, setBusy] = useState(false);

  const setSlot = (i: number, patch: Partial<Availability>) => setSlots(s => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (!course.trim() || !whatsapp.trim()) return notify("Enter your course and WhatsApp number.");
    if (game === "eFootball" && (!username.trim() || (!me?.efootball && !image))) return notify("Enter your eFootball username and upload your account image.");
    if (game === "Pool" && !poolName.trim()) return notify("Enter your pool name.");
    setBusy(true);
    try {
      const body: Record<string, unknown> = { course: course.trim(), year, whatsapp: whatsapp.trim(), availability: slots.filter(s => s.start && s.end) };
      if (game === "eFootball") {
        const up = image ? await gamesApi.upload(user, image, "players") : null;
        body.efootball = { username: username.trim(), ...(up ? { imageFileId: up.fileId, imageUrl: up.url } : {}) };
      } else body.pool = { name: poolName.trim(), points: poolPoints.trim() };
      await gamesApi.saveProfile(user, body);
      notify("Profile saved.");
      onSaved();
      onClose();
    } catch (e) { notify(err(e, "Could not save profile.")); } finally { setBusy(false); }
  };

  return (
    <Modal title={`${game} profile`} onClose={onClose}>
      <label>Course<input value={course} onChange={e => setCourse(e.target.value)} placeholder="e.g. Engineering" /></label>
      <label>Year of study<select value={year} onChange={e => setYear(e.target.value)}>{YEARS.map(y => <option key={y}>{y}</option>)}</select></label>
      <label>WhatsApp number<input value={whatsapp} inputMode="tel" onChange={e => setWhatsapp(e.target.value)} placeholder="07XXXXXXXX" /></label>
      {game === "eFootball" ? (
        <>
          <label>eFootball username (your public gaming name)<input value={username} onChange={e => setUsername(e.target.value)} placeholder="Siddy_254" /></label>
          <label>eFootball account image<input type="file" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} /></label>
        </>
      ) : (
        <>
          <label>Pool name<input value={poolName} onChange={e => setPoolName(e.target.value)} placeholder="Siddy" /></label>
          <label>Preferred pool points<input value={poolPoints} onChange={e => setPoolPoints(e.target.value)} placeholder="e.g. Mwamba, Ndagani" /></label>
        </>
      )}
      <div className="gm-sub">Free times</div>
      {slots.map((s, i) => (
        <div className="gm-slot" key={i}>
          <select value={s.day} onChange={e => setSlot(i, { day: e.target.value })}>{DAYS.map(d => <option key={d}>{d}</option>)}</select>
          <input type="time" value={s.start} onChange={e => setSlot(i, { start: e.target.value })} />
          <input type="time" value={s.end} onChange={e => setSlot(i, { end: e.target.value })} />
          <button type="button" onClick={() => setSlots(x => x.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="gm-ghost" type="button" onClick={() => setSlots(s => [...s, { day: "Friday", start: "18:00", end: "21:00" }])}><Plus size={14} /> Add free time</button>
      <button className="gm-primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    </Modal>
  );
}

export function ActivationModal({ user, settings, onClose, onDone, notify }: {
  user: User; settings: Settings; onClose: () => void; onDone: () => void; notify: (m: string) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await gamesApi.submitActivation(user, code);
      if (settings.adminWhatsApp) openWhatsApp(`CHUKA COMRADES — PROFILE ACTIVATION\nAmount: KSh ${settings.activationFee}\nM-Pesa code: ${code.trim().toUpperCase()}\nPaid to Till: ${settings.mpesaTill}\nPlease verify my payment.`, settings.adminWhatsApp);
      notify("Payment submitted. Your profile will go active once the admin verifies it.");
      onDone();
      onClose();
    } catch (e) { notify(err(e, "Could not submit payment.")); } finally { setBusy(false); }
  };
  return (
    <Modal title="Activate your profile" onClose={onClose}>
      <div className="gm-pay">
        <span>Pay</span><strong>KSh {settings.activationFee}</strong>
        <p>M-Pesa → Buy Goods &amp; Services → Till <b>{settings.mpesaTill}</b>. This activates your profile; it is not a tournament entry fee.</p>
      </div>
      <label>M-Pesa transaction code<input value={code} maxLength={10} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. SGH7K2L9QX" /></label>
      <button className="gm-primary" onClick={() => void submit()} disabled={busy || code.trim().length !== 10}>{busy ? "Submitting…" : "Submit for verification"}</button>
    </Modal>
  );
}

/* ───────── tournaments (shared by eFootball + Pool) ───────── */

export function TournamentsPanel({ user, me, game, focusId, poolPoints, onSignIn, onNeedActive, notify }: {
  user: User | null; me: Me | null; game: "eFootball" | "Pool"; focusId?: string; poolPoints?: PoolPoint[];
  onSignIn: () => void; onNeedActive: () => void; notify: (m: string) => void;
}) {
  const [list, setList] = useState<Tournament[]>([]);
  const [mine, setMine] = useState<MyTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const active = me?.user.activation === "active";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await gamesApi.tournaments(game));
      if (user && active) setMine(await gamesApi.myTournaments(user));
    } catch (e) { notify(err(e, "Could not load tournaments.")); } finally { setLoading(false); }
  }, [game, user, active, notify]);
  useEffect(() => { void load(); }, [load]);

  const showRoom = async (id: string) => {
    if (!user) return onSignIn();
    if (!active) return onNeedActive();
    try { const r = await gamesApi.room(user, id); setRooms(x => ({ ...x, [id]: r.room })); } catch (e) { notify(err(e, "Could not load room.")); }
  };

  const ordered = focusId ? [...list].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0)) : list;
  const missing = focusId && !loading && !list.some(t => t.id === focusId);
  const pointName = (id: string) => poolPoints?.find(p => p.id === id)?.name;
  const managed = mine.find(t => t.id === managing);

  return (
    <>
      <div className="gm-heading">
        <div><h2>{game} tournaments</h2><p>Register through the organizer on WhatsApp. Finished tournaments disappear after 3 days.</p></div>
        <button className="gm-primary gm-small" onClick={() => (!user ? onSignIn() : !active ? onNeedActive() : setCreating(true))}><Trophy size={15} /> Create</button>
      </div>
      {missing && <div className="gm-notice">That tournament has finished and was removed, or the link is invalid.</div>}
      {loading ? <p className="gm-muted">Loading…</p> : ordered.length === 0 ? (
        <Empty icon={<Trophy size={30} />} title="No tournaments right now" hint="Activate your profile and create the first one." />
      ) : (
        <div className="gm-list">
          {ordered.map(t => {
            const isMine = mine.some(m => m.id === t.id);
            return (
              <article className={`gm-tcard${t.id === focusId ? " gm-focus" : ""}`} key={t.id}>
                {(t.posterId || t.poster) && <DriveImg id={t.posterId} url={t.poster} alt={t.name} />}
                <div className="gm-tbody">
                  <div className="gm-trow"><strong>{t.name}</strong>
                    <span className={`gm-chip ${t.status === "open" ? "gm-chip-green" : t.status === "full" ? "gm-chip-red" : "gm-chip-blue"}`}>
                      {t.status === "open" ? "Registration Open" : t.status === "full" ? "Registration Closed" : "Completed"}
                    </span>
                  </div>
                  <ul className="gm-meta">
                    {t.course && <li>🎓 {t.course}{t.year && t.year !== "All years" ? ` — ${t.year}` : ""}</li>}
                    <li>📅 {formatDate(t.date)} · 🕗 {formatTime(t.time)}</li>
                    <li><Users size={13} /> {t.registered}/{t.max} registered · Organizer: <b>{t.organizer}</b></li>
                    {game === "Pool" && pointName(t.poolPointId) && <li>📍 {pointName(t.poolPointId)}</li>}
                    {t.status === "completed" && <li className="gm-winner">🏆 Winner: {t.winner}</li>}
                  </ul>
                  {t.description && <p className="gm-desc">{t.description}</p>}
                  {game === "eFootball" && t.hasRoom && t.status !== "completed" && (
                    rooms[t.id]
                      ? <div className="gm-room">🎮 Room: <b>{rooms[t.id]}</b><button onClick={() => void navigator.clipboard?.writeText(rooms[t.id])} aria-label="Copy"><Copy size={13} /></button></div>
                      : <button className="gm-ghost" onClick={() => void showRoom(t.id)}><Lock size={13} /> Show room number</button>
                  )}
                  <div className="gm-btns">
                    {t.status === "open" && <button className="gm-wa" onClick={() => openWhatsApp(`Hi ${t.organizer}, I would like to register for "${t.name}" (${t.id}) on Chuka Comrades.`, t.organizerWhatsApp)}><MessageCircle size={15} /> Register via WhatsApp</button>}
                    <button className="gm-ghost" onClick={() => openWhatsApp(tournamentShareText(t))}><Share2 size={15} /> Share Tournament</button>
                    {isMine && <button className="gm-ghost" onClick={() => setManaging(t.id)}><Settings2 size={15} /> Manage</button>}
                    {me?.isAdmin && user && <button className="gm-danger" onClick={() => void gamesApi.adminRemoveTournament(user, t.id).then(load)}>Remove</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {creating && user && <CreateTournamentModal user={user} game={game} poolPoints={poolPoints || []} onClose={() => setCreating(false)} onDone={load} notify={notify} />}
      {managed && user && <ManageModal user={user} t={managed} onClose={() => setManaging(null)} onChanged={load} notify={notify} />}
    </>
  );
}

function CreateTournamentModal({ user, game, poolPoints, onClose, onDone, notify }: {
  user: User; game: "eFootball" | "Pool"; poolPoints: PoolPoint[]; onClose: () => void; onDone: () => void; notify: (m: string) => void;
}) {
  const [f, setF] = useState({ name: "", course: "All courses", year: "All years", date: "", time: "19:00", max: "16", description: "", room: "", poolPointId: "" });
  const [poster, setPoster] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      const up = poster ? await gamesApi.upload(user, poster, "tournaments") : null;
      await gamesApi.createTournament(user, { game, ...f, ...(up ? { posterFileId: up.fileId, posterUrl: up.url } : {}) });
      notify("Tournament created. Share it on WhatsApp!");
      onDone();
      onClose();
    } catch (e) { notify(err(e, "Could not create tournament.")); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Create ${game} tournament`} onClose={onClose}>
      <label>Tournament name<input value={f.name} onChange={e => set("name", e.target.value)} placeholder="Engineering Year 2 eFootball Cup" /></label>
      <label>Target course<input value={f.course} onChange={e => set("course", e.target.value)} /></label>
      <label>Target year<select value={f.year} onChange={e => set("year", e.target.value)}><option>All years</option>{YEARS.map(y => <option key={y}>{y}</option>)}</select></label>
      <div className="gm-two"><label>Date<input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></label><label>Start time<input type="time" value={f.time} onChange={e => set("time", e.target.value)} /></label></div>
      <label>Maximum players<input type="number" min={2} max={256} value={f.max} onChange={e => set("max", e.target.value)} /></label>
      {game === "eFootball"
        ? <label>Room number (optional, can add later)<input value={f.room} onChange={e => set("room", e.target.value)} placeholder="583921" /></label>
        : <label>Pool point<select value={f.poolPointId} onChange={e => set("poolPointId", e.target.value)}><option value="">Choose a pool point</option>{poolPoints.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      <label>Description<textarea value={f.description} onChange={e => set("description", e.target.value)} /></label>
      <label>Poster (optional)<input type="file" accept="image/*" onChange={e => setPoster(e.target.files?.[0] || null)} /></label>
      <button className="gm-primary" onClick={() => void submit()} disabled={busy}>{busy ? "Creating…" : "Create tournament"}</button>
    </Modal>
  );
}

function ManageModal({ user, t, onClose, onChanged, notify }: { user: User; t: MyTournament; onClose: () => void; onChanged: () => void; notify: (m: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [room, setRoom] = useState(t.room);
  const [winner, setWinner] = useState("");
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) notify(ok); onChanged(); } catch (e) { notify(err(e, "Action failed.")); }
  };
  const done = t.status === "completed";
  return (
    <Modal title={`Manage: ${t.name}`} onClose={onClose}>
      <div className="gm-sub">Participants ({t.participants.length})</div>
      {t.participants.map(p => (
        <div className="gm-prow" key={p.id}><span>{p.name}</span>{!done && <button onClick={() => void run(() => gamesApi.removeParticipant(user, t.id, p.id))} aria-label="Remove"><Trash2 size={14} /></button>}</div>
      ))}
      {!done && (
        <div className="gm-slot">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Player name" />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="WhatsApp (optional)" inputMode="tel" />
          <button onClick={() => void run(async () => { await gamesApi.addParticipant(user, t.id, name, phone); setName(""); setPhone(""); })} aria-label="Add"><Plus size={16} /></button>
        </div>
      )}
      {!done && <button className="gm-ghost" onClick={() => void run(() => gamesApi.setRegistration(user, t.id, t.status === "full"), t.status === "full" ? "Registration reopened." : "Registration closed.")}>{t.status === "full" ? "Reopen registration" : "Close registration"}</button>}
      {t.game === "eFootball" && !done && (
        <><div className="gm-sub">Room number</div>
          <div className="gm-slot"><input value={room} onChange={e => setRoom(e.target.value)} placeholder="583921" /><button className="gm-ghost" onClick={() => void run(() => gamesApi.setRoom(user, t.id, room), "Room number saved.")}>Save</button></div></>
      )}
      {!done ? (
        <><div className="gm-sub">Declare winner</div>
          <input list={`w-${t.id}`} value={winner} onChange={e => setWinner(e.target.value)} placeholder="Winner" />
          <datalist id={`w-${t.id}`}>{t.participants.map(p => <option key={p.id} value={p.name} />)}</datalist>
          <button className="gm-primary" onClick={() => void run(async () => { await gamesApi.declareWinner(user, t.id, winner); onClose(); }, "Winner declared. This tournament will disappear in 3 days.")}>🏆 Declare winner &amp; complete</button></>
      ) : <p className="gm-muted">🏆 Winner: {t.winner}</p>}
    </Modal>
  );
}

/* ───────── admin: payment verification ───────── */

export function AdminPayments({ user, onChanged, notify }: { user: User; onChanged: () => void; notify: (m: string) => void }) {
  const [items, setItems] = useState<{ id: string; email: string; code: string; amount: string }[]>([]);
  const load = useCallback(() => { gamesApi.adminPayments(user).then(setItems).catch(() => undefined); }, [user]);
  useEffect(load, [load]);
  const review = async (id: string, approve: boolean) => {
    try { await gamesApi.adminReviewPayment(user, id, approve); notify(approve ? "Profile activated." : "Payment rejected."); load(); onChanged(); } catch (e) { notify(err(e, "Failed.")); }
  };
  return (
    <section className="gm-admin">
      <h2><ShieldCheck size={16} /> Admin · pending activations ({items.length})</h2>
      {items.length === 0 && <p className="gm-muted">Nothing waiting.</p>}
      {items.map(p => (
        <div className="gm-prow" key={p.id}><span><b>{p.code}</b> · KSh {p.amount}<small>{p.email}</small></span>
          <button className="gm-ok" onClick={() => void review(p.id, true)}>Approve</button>
          <button className="gm-danger" onClick={() => void review(p.id, false)}>Reject</button></div>
      ))}
    </section>
  );
}
