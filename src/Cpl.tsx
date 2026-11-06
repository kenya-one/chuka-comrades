import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Trophy, Heart, Star, ShieldCheck, RefreshCw, Plus, Trash2, ChevronLeft, Users, Bell } from "lucide-react";
import { cplApi, type Bootstrap, type CplMe, type League, type Preferences, type Team } from "./lib/cplApi";
import "./Cpl.css";

type Tab = "teams" | "fan" | "chairman";
const err = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const EMPTY_PREFS: Preferences = { matchReminders: true, matchResults: true, transfers: true, news: true };
const PREF_LABELS: [keyof Preferences, string][] = [
  ["matchReminders", "Match reminders"], ["matchResults", "Match results"],
  ["transfers", "Player transfers"], ["news", "Team and league news"],
];

function teamFromHash(): string | null {
  const m = window.location.hash.match(/^#\/cpl\/team\/([\w-]+)/);
  return m ? m[1] : null;
}

export default function Cpl({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [me, setMe] = useState<CplMe | null>(null);
  const [tab, setTab] = useState<Tab>("teams");
  const [league, setLeague] = useState<League>("A");
  const [teamId, setTeamId] = useState<string | null>(teamFromHash());
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await cplApi.bootstrap());
      if (user) setMe(await cplApi.me(user)); else setMe(null);
    } catch (e) { setNotice(err(e, "Could not load the league.")); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  const openTeam = (id: string | null) => {
    setTeamId(id);
    window.history.replaceState(null, "", id ? `#/cpl/team/${id}` : "#/cpl");
  };

  const follows = me?.follows ?? [];
  const followOf = (id: string) => follows.find(f => f.teamId === id);
  const teams = useMemo(() => data?.teams ?? [], [data]);
  const byId = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);
  const current = teamId ? byId.get(teamId) ?? null : null;

  // Run a signed-in action, show errors as a notice
  const act = async (key: string, fn: (u: User) => Promise<unknown>, okMsg = "") => {
    if (!user) { onSignIn(); return; }
    setBusy(key);
    try { await fn(user); await load(); if (okMsg) setNotice(okMsg); } catch (e) { setNotice(err(e, "Something went wrong.")); } finally { setBusy(""); }
  };

  const toggleFollow = (t: Team) =>
    act(`follow-${t.id}`, u => (followOf(t.id) ? cplApi.unfollow(u, t.id) : cplApi.follow(u, t.id)));

  const TeamCard = ({ t }: { t: Team }) => {
    const f = followOf(t.id);
    return (
      <div className="cpl-team">
        <button className="cpl-team-main" onClick={() => openTeam(t.id)}>
          <span className="cpl-badge">{t.name.slice(0, 2).toUpperCase()}</span>
          <span><strong>{t.name}</strong><small>League {t.league}{data?.followerCounts[t.id] ? ` · ${data.followerCounts[t.id]} fans` : ""}</small></span>
        </button>
        <button className={`cpl-follow${f ? " on" : ""}`} disabled={busy === `follow-${t.id}`} onClick={() => void toggleFollow(t)} aria-pressed={!!f}>
          {f?.primary ? <Star size={14} /> : <Heart size={14} />}{f ? (f.primary ? "Favourite" : "Following") : "Follow"}
        </button>
      </div>
    );
  };

  return (
    <section className="cpl-wrap">
      <div className="cpl-hero">
        <div className="cpl-mark"><Trophy size={26} /></div>
        <div><span className="cpl-kicker">CHUKA COMRADES FOOTBALL</span><h1>Chuka Premier League</h1><p>{data ? data.season.name : "Fixtures, results and campus football"}</p></div>
        <button className="cpl-refresh" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={16} className={loading ? "cpl-spin" : ""} /></button>
      </div>

      {notice && <div className="cpl-notice" role="status" onClick={() => setNotice("")}>{notice}</div>}

      {current ? (
        <div className="cpl-panel">
          <button className="cpl-back" onClick={() => openTeam(null)}><ChevronLeft size={16} />All teams</button>
          <div className="cpl-teamhead">
            <span className="cpl-badge big">{current.name.slice(0, 2).toUpperCase()}</span>
            <div><h2>{current.name}</h2><small>League {current.league} · {data?.followerCounts[current.id] ?? 0} fans</small></div>
          </div>
          {current.description && <p>{current.description}</p>}
          <div className="cpl-actions">
            <button className="cpl-btn" onClick={() => void toggleFollow(current)}>{followOf(current.id) ? "Unfollow" : "Follow team"}</button>
            {followOf(current.id) && !followOf(current.id)!.primary && <button className="cpl-btn ghost" onClick={() => void act("primary", u => cplApi.setPrimary(u, current.id))}>Make favourite</button>}
          </div>
          <p className="cpl-soon">Squad, fixtures, results and transfers will appear here as those parts of the league go live.</p>
        </div>
      ) : (
        <>
          <div className="cpl-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "teams"} className={tab === "teams" ? "on" : ""} onClick={() => setTab("teams")}><Users size={15} />Teams</button>
            <button role="tab" aria-selected={tab === "fan"} className={tab === "fan" ? "on" : ""} onClick={() => setTab("fan")}><Heart size={15} />My fan page</button>
            {me?.isChairman && <button role="tab" aria-selected={tab === "chairman"} className={tab === "chairman" ? "on" : ""} onClick={() => setTab("chairman")}><ShieldCheck size={15} />Chairman</button>}
          </div>

          {tab === "teams" && (
            <div className="cpl-panel">
              <div className="cpl-league">
                {(["A", "B"] as League[]).map(l => <button key={l} className={league === l ? "on" : ""} onClick={() => setLeague(l)}>League {l}</button>)}
              </div>
              {!user && <button className="cpl-btn cta" onClick={onSignIn}>Sign in to become a fan</button>}
              {data && teams.filter(t => t.league === league).length === 0 && <p className="cpl-empty">No teams in League {league} yet.</p>}
              {teams.filter(t => t.league === league).map(t => <TeamCard key={t.id} t={t} />)}
            </div>
          )}

          {tab === "fan" && <FanPage user={user} onSignIn={onSignIn} me={me} byId={byId} openTeam={openTeam} act={act} />}
          {tab === "chairman" && me?.isChairman && data && <ChairmanPage data={data} act={act} />}
        </>
      )}
    </section>
  );
}

function FanPage({ user, onSignIn, me, byId, openTeam, act }: {
  user: User | null; onSignIn: () => void; me: CplMe | null; byId: Map<string, Team>;
  openTeam: (id: string) => void; act: (k: string, fn: (u: User) => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  useEffect(() => { if (me) setPrefs(me.preferences); }, [me]);
  if (!user) return <div className="cpl-panel"><p>Sign in with your Chuka Comrades account to follow teams. No extra registration needed.</p><button className="cpl-btn cta" onClick={onSignIn}>Sign in</button></div>;
  const followed = (me?.follows ?? []).filter(f => byId.has(f.teamId)).sort((a, b) => Number(b.primary) - Number(a.primary));
  return (
    <div className="cpl-panel">
      <h3>Teams you follow</h3>
      {followed.length === 0 && <p className="cpl-empty">You are not following any team yet. Open the Teams tab and tap Follow.</p>}
      {followed.map(f => {
        const t = byId.get(f.teamId)!;
        return (
          <div className="cpl-team" key={f.teamId}>
            <button className="cpl-team-main" onClick={() => openTeam(t.id)}><span className="cpl-badge">{t.name.slice(0, 2).toUpperCase()}</span><span><strong>{t.name}</strong><small>League {t.league}{f.primary ? " · Favourite" : ""}</small></span></button>
            {!f.primary && <button className="cpl-follow" onClick={() => void act("p", u => cplApi.setPrimary(u, t.id))}><Star size={14} />Make favourite</button>}
          </div>
        );
      })}
      <h3><Bell size={16} /> Notifications</h3>
      {PREF_LABELS.map(([k, label]) => (
        <label className="cpl-pref" key={k}><input type="checkbox" checked={prefs[k]} onChange={e => setPrefs({ ...prefs, [k]: e.target.checked })} />{label}</label>
      ))}
      <button className="cpl-btn" onClick={() => void act("prefs", u => cplApi.savePreferences(u, prefs), "Preferences saved.")}>Save preferences</button>
      <p className="cpl-soon">Your choices are saved now. Alerts will start once match reminders and results go live.</p>
    </div>
  );
}

function ChairmanPage({ data, act }: { data: Bootstrap; act: (k: string, fn: (u: User) => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [league, setLeague] = useState<League>("A");
  const [desc, setDesc] = useState("");
  const [season, setSeason] = useState("");
  return (
    <div className="cpl-panel">
      <h3>Add a team</h3>
      <div className="cpl-form">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Team name" maxLength={60} />
        <select value={league} onChange={e => setLeague(e.target.value as League)}><option value="A">League A</option><option value="B">League B</option></select>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description (optional)" maxLength={300} />
        <button className="cpl-btn" disabled={!name.trim()} onClick={() => void act("add", async u => { await cplApi.saveTeam(u, { name, league, description: desc }); setName(""); setDesc(""); }, "Team added.")}><Plus size={14} />Add team</button>
      </div>
      <h3>Teams</h3>
      {data.teams.length === 0 && <p className="cpl-empty">No teams yet.</p>}
      {data.teams.map(t => (
        <div className="cpl-team" key={t.id}>
          <div className="cpl-team-main static"><span className="cpl-badge">{t.name.slice(0, 2).toUpperCase()}</span><span><strong>{t.name}</strong><small>League {t.league}</small></span></div>
          <button className="cpl-follow danger" onClick={() => { if (window.confirm(`Remove ${t.name}? Its history is kept.`)) void act("rm", u => cplApi.removeTeam(u, t.id), "Team removed."); }}><Trash2 size={14} />Remove</button>
        </div>
      ))}
      <h3>Season</h3>
      <p>Current: <strong>{data.season.name}</strong>. Starting a new season archives this one. Followed teams carry over.</p>
      <div className="cpl-form">
        <input value={season} onChange={e => setSeason(e.target.value)} placeholder="New season name, e.g. Season 2027" maxLength={60} />
        <button className="cpl-btn ghost" disabled={!season.trim()} onClick={() => { if (window.confirm(`Start "${season}" and archive ${data.season.name}?`)) void act("season", async u => { await cplApi.startSeason(u, season); setSeason(""); }, "New season started."); }}>Start season</button>
      </div>
      <p className="cpl-soon">Chairman access is checked on the server. Every change here is written to the audit log.</p>
    </div>
  );
}
