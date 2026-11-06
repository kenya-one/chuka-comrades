import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Gamepad2, Users, Trophy, ShoppingBag, MessageCircle, Share2, RefreshCw, Plus } from "lucide-react";
import { gamesApi, openWhatsApp, waNumber, listingShareText, type Player, type Listing } from "./lib/gamesApi";
import { useMe, useSettings, StatusBar, ProfileModal, ActivationModal, TournamentsPanel, AdminPayments, Notice, Empty, Schedule, Modal, DriveImg } from "./games/ui";
import { EfootballLogo } from "./games/logos";
import "./games/games.css";

type Tab = "players" | "tournaments" | "market";

function parseHash(): { tab: Tab; id?: string } {
  const m = window.location.hash.match(/^#\/efootball\/(tournament|account)\/([\w-]+)/);
  if (!m) return { tab: "players" };
  return m[1] === "tournament" ? { tab: "tournaments", id: m[2] } : { tab: "market", id: m[2] };
}

export default function Efootball({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const initial = parseHash();
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [focusId] = useState(initial.id);
  const [notice, setNotice] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [focusListing, setFocusListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<"" | "profile" | "activate" | "sell">("");
  const { me, reload } = useMe(user);
  const settings = useSettings();
  const active = me?.user.activation === "active";
  const notify = useCallback((m: string) => setNotice(m), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, l] = await Promise.all([gamesApi.players(), gamesApi.market()]);
      setPlayers(p);
      setListings(l);
      if (focusId && initial.tab === "market") setFocusListing(await gamesApi.marketItem(focusId));
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not load eFootball data."); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  useEffect(() => { void load(); }, [load]);

  const requireActive = () => { if (!user) { onSignIn(); return false; } if (!active) { setModal(me?.user.profile === "complete" ? "activate" : "profile"); setNotice("Activate your profile to use this feature."); return false; } return true; };

  const contact = async (kind: "player" | "market", id: string) => {
    if (!requireActive() || !user) return;
    try { const r = await gamesApi.contact(user, kind, id); window.open(`https://wa.me/${waNumber(r.whatsapp)}`, "_blank", "noopener,noreferrer"); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not get contact."); }
  };

  const items = focusListing && !listings.some(l => l.id === focusListing.id) ? [focusListing, ...listings] : listings;

  return (
    <section className="gm-wrap">
      <div className="gm-hero gm-hero-blue">
        <div className="gm-mark"><EfootballLogo /></div>
        <div><span className="gm-kicker">CHUKA COMRADES GAMING</span><h1>Chuka Efootball</h1><p>Find players, compete in tournaments and trade accounts.</p></div>
        <button className="gm-refresh" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={16} className={loading ? "gm-spin" : ""} /></button>
      </div>

      <StatusBar user={user} me={me} settings={settings} onSignIn={onSignIn}
        onProfile={() => setModal("profile")} onActivate={() => setModal("activate")} />
      <Notice text={notice} onClose={() => setNotice("")} />

      <div className="gm-tabs">
        <button className={tab === "players" ? "on" : ""} onClick={() => setTab("players")}><Users size={15} /> Players</button>
        <button className={tab === "tournaments" ? "on" : ""} onClick={() => setTab("tournaments")}><Trophy size={15} /> Tournaments</button>
        <button className={tab === "market" ? "on" : ""} onClick={() => setTab("market")}><ShoppingBag size={15} /> Account market</button>
      </div>

      {tab === "players" && (
        <>
          <div className="gm-heading"><div><h2>Find players</h2><p>Active Chuka Comrades eFootball players.</p></div>
            {user && !me?.efootball && <button className="gm-primary gm-small" onClick={() => setModal("profile")}><Plus size={15} /> My profile</button>}</div>
          {players.length === 0 ? <Empty icon={<Gamepad2 size={30} />} title="No active players yet" hint="Create your profile and activate it to be listed." /> : (
            <div className="gm-grid">
              {players.map(p => (
                <article className="gm-card" key={p.id}>
                  <DriveImg className="gm-img" id={p.imageId} url={p.image} alt={`${p.username} account`} />
                  <div className="gm-body"><strong>{p.username}</strong>
                    <span className="gm-sm">{p.course} — {p.year}</span>
                    <Schedule items={p.availability} />
                    <button className="gm-wa" onClick={() => void contact("player", p.id)}><MessageCircle size={15} /> Contact on WhatsApp</button></div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "tournaments" && (
        <TournamentsPanel user={user} me={me} game="eFootball" focusId={initial.tab === "tournaments" ? focusId : undefined}
          onSignIn={onSignIn} onNeedActive={() => void requireActive()} notify={notify} />
      )}

      {tab === "market" && (
        <>
          <div className="gm-heading"><div><h2>Account market</h2><p>Buy and sell eFootball accounts. Deals are between buyer and seller on WhatsApp.</p></div>
            <button className="gm-primary gm-small" onClick={() => { if (requireActive()) setModal("sell"); }}><Plus size={15} /> Sell account</button></div>
          <p className="gm-disclaimer">Chuka Comrades only connects buyers and sellers. Account sales are your own responsibility and are not endorsed by Konami; check eFootball’s account terms first.</p>
          {items.length === 0 ? <Empty icon={<ShoppingBag size={30} />} title="No accounts for sale" hint="Be the first to list an account." /> : (
            <div className="gm-grid">
              {items.map(l => (
                <article className={`gm-card${l.id === focusId ? " gm-focus" : ""}`} key={l.id}>
                  <DriveImg className="gm-img" id={l.imageId} url={l.image} alt={`${l.username} account`} />
                  <div className="gm-body"><strong>KSh {l.price.toLocaleString()}</strong>
                    <span className="gm-sm">Seller: {l.username} · <span className="gm-ok-text">{l.status === "available" ? "Available" : "Sold"}</span></span>
                    <p className="gm-desc">{l.description}</p>
                    <button className="gm-wa" onClick={() => void contact("market", l.id)}><MessageCircle size={15} /> Contact seller</button>
                    <button className="gm-ghost" onClick={() => openWhatsApp(listingShareText(l))}><Share2 size={15} /> Share on WhatsApp</button>
                    {me?.isAdmin && user && <button className="gm-danger" onClick={() => void gamesApi.adminRemoveListing(user, l.id).then(load)}>Remove listing</button>}</div>
                </article>
              ))}
            </div>
          )}
          {user && active && <MyListings user={user} onChanged={load} notify={notify} />}
        </>
      )}

      {me?.isAdmin && user && <AdminPayments user={user} onChanged={() => { void reload(); void load(); }} notify={notify} />}

      {modal === "profile" && user && <ProfileModal user={user} me={me} game="eFootball" onClose={() => setModal("")} onSaved={() => { void reload(); void load(); }} notify={notify} />}
      {modal === "activate" && user && <ActivationModal user={user} settings={settings} onClose={() => setModal("")} onDone={() => void reload()} notify={notify} />}
      {modal === "sell" && user && <SellModal user={user} onClose={() => setModal("")} onDone={load} notify={notify} />}
    </section>
  );
}

function SellModal({ user, onClose, onDone, notify }: { user: User; onClose: () => void; onDone: () => void; notify: (m: string) => void }) {
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!image) return notify("Upload a screenshot of the account.");
    setBusy(true);
    try {
      const up = await gamesApi.upload(user, image, "market");
      await gamesApi.createListing(user, { price: Number(price), description, imageFileId: up.fileId, imageUrl: up.url });
      notify("Account listed. Share it on WhatsApp to find a buyer.");
      onDone(); onClose();
    } catch (e) { notify(e instanceof Error ? e.message : "Could not list account."); } finally { setBusy(false); }
  };
  return (
    <Modal title="Sell eFootball account" onClose={onClose}>
      <label>Price (KSh)<input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} /></label>
      <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Squad, rating, coins, packs…" /></label>
      <label>Account screenshot<input type="file" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} /></label>
      <button className="gm-primary" onClick={() => void submit()} disabled={busy || !price || !description.trim()}>{busy ? "Listing…" : "List account"}</button>
    </Modal>
  );
}

function MyListings({ user, onChanged, notify }: { user: User; onChanged: () => void; notify: (m: string) => void }) {
  const [rows, setRows] = useState<{ id: string; price: number; status: string; description: string }[]>([]);
  const load = useCallback(() => { gamesApi.myListings(user).then(setRows).catch(() => undefined); }, [user]);
  useEffect(load, [load]);
  const mine = rows.filter(r => r.status === "available");
  if (!mine.length) return null;
  return (
    <section className="gm-admin gm-mine"><h2>My listings</h2>
      {mine.map(r => (
        <div className="gm-prow" key={r.id}><span>KSh {r.price.toLocaleString()}<small>{r.description.slice(0, 60)}</small></span>
          <button className="gm-ok" onClick={() => void gamesApi.markSold(user, r.id).then(() => { notify("Marked as sold."); load(); onChanged(); })}>Mark sold</button></div>
      ))}
    </section>
  );
}
