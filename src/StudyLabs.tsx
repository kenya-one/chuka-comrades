import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, Download, ExternalLink, FileUp, Lightbulb, LoaderCircle, MessageCircle, Plus, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { bootstrapStudyLabs, jsonp, listStudyItems, NOTES_COVER, openDownload, postStudyAction, str, type StudyItem } from './lib/studyLabs';
import { AdminPanel } from './StudyLabsAdmin';
import { MyUploads, type MineSection } from './StudyLabsMine';
import { ShareForm, SuggestForm } from './StudyLabsShare';
import BuyDialog from './StudyLabsBuy';
import { PartnerRequestDialog } from './StudyLabsPartners';
import './StudyLabs.css';
import './StudyLabsV2.css';

type Props = { user: User | null; onBack: () => void; onSignIn: () => void; initialTab?: 'Resources' | 'Products' };
type ListTab = 'Resources' | 'Products' | 'StudyPartners' | 'Opportunities' | 'Events';
type Tab = ListTab | 'WhatsApp' | 'MyUploads' | 'Admin';
const tabs: { key: Tab; label: string; icon: typeof BookOpen }[] = [
  { key: 'Resources', label: 'Materials', icon: BookOpen },
  { key: 'Products', label: 'Project Hub', icon: Lightbulb },
  { key: 'StudyPartners', label: 'Study partners', icon: Users },
  { key: 'Opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
  { key: 'Events', label: 'Events', icon: CalendarDays },
  { key: 'WhatsApp', label: 'WhatsApp', icon: MessageCircle },
];
const isListTab = (t: Tab): t is ListTab => ['Resources', 'Products', 'StudyPartners', 'Opportunities', 'Events'].includes(t);
const CHIPS: Partial<Record<ListTab, string[]>> = { Resources: ['All', 'Notes', 'Past paper', 'Revision guide'], Products: ['All', 'Project', 'Digital product', 'Template', 'Free'] };
const EMPTY: Record<ListTab, string> = { Resources: 'No approved study materials yet.', Products: 'Nothing in the Project Hub yet.', StudyPartners: 'No study partner profiles are available yet.', Opportunities: 'No active opportunities at the moment.', Events: 'No upcoming learning events have been listed.' };

export default function StudyLabs({ user, onBack, onSignIn, initialTab = 'Resources' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<StudyItem[]>([]);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState('All');
  const [info, setInfo] = useState({ communityUrl: '', mpesaNumber: '', mpesaName: '' });
  const [officialLinks, setOfficialLinks] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mine, setMine] = useState<MineSection>('submissions');
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [buying, setBuying] = useState<StudyItem | null>(null);
  const [requesting, setRequesting] = useState<StudyItem | null>(null);

  const reqId = useRef(0);
  const load = useCallback(async (nextTab: Tab, q: string) => {
    const my = ++reqId.current;
    if (!isListTab(nextTab)) { setLoading(false); return; }
    setLoading(true); setError('');
    try { const data = await listStudyItems(nextTab, q); if (my === reqId.current) setItems(data); }
    catch (e) { if (my === reqId.current) setError(e instanceof Error ? e.message : 'Could not load Study Labs.'); }
    finally { if (my === reqId.current) setLoading(false); }
  }, []);

  useEffect(() => {
    bootstrapStudyLabs().then((d) => {
      setInfo({ communityUrl: String(d.whatsappCommunityUrl || ''), mpesaNumber: String(d.mpesaNumber || ''), mpesaName: String(d.mpesaName || '') });
      setOfficialLinks((d.officialLinks as StudyItem[]) || []);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not connect to Study Labs.'));
  }, []);
  useEffect(() => { setChip('All'); setShowSuggest(false); }, [tab]);
  useEffect(() => { const timer = window.setTimeout(() => void load(tab, query), 450); return () => window.clearTimeout(timer); }, [tab, query, load]);

  const refreshOrders = useCallback(async () => {
    if (!user) { setOrders({}); return; }
    try { const r = await postStudyAction(user, { action: 'myOrders' }); const map: Record<string, string> = {}; ((r.items as StudyItem[]) || []).forEach((o) => { const pid = str(o, 'product_id'); const rank: Record<string, number> = { verified: 3, pending: 2, rejected: 1 }; const st = str(o, 'status'); if ((rank[st] || 0) > (rank[map[pid]] || 0)) map[pid] = st; }); setOrders(map); }
    catch { setOrders({}); }
  }, [user]);
  useEffect(() => {
    setIsAdmin(false);
    if (!user) { setTab((t) => (t === 'Admin' || t === 'MyUploads' ? 'Resources' : t)); setOrders({}); return; }
    postStudyAction(user, { action: 'whoami' }).then((r) => setIsAdmin(!!r.admin)).catch(() => setIsAdmin(false));
    void refreshOrders();
  }, [user, refreshOrders]);

  const requireUser = (fn: () => void) => { if (!user) { onSignIn(); return; } fn(); };
  const flash = (m: string) => { setMessage(m); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  async function downloadFree(id: string) {
    setError('');
    try { await openDownload(async () => { const d = await jsonp<{ ok: boolean; url?: string; error?: string }>({ action: 'download', id }); if (!d.ok || !d.url) throw new Error(d.error || 'Download is unavailable.'); return d.url; }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open this file.'); }
  }
  async function downloadPurchased(id: string) {
    if (!user) return; setError('');
    try { await openDownload(async () => { const r = await postStudyAction(user, { action: 'downloadProduct', id }); return String(r.url); }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open this file.'); }
  }
  async function report(type: string, id: string) {
    if (!user) { onSignIn(); return; }
    const reason = window.prompt('What is wrong with this item? (e.g. wrong content, copyrighted, spam)'); if (!reason || !reason.trim()) return;
    try { await postStudyAction(user, { action: 'createReport', itemType: type, itemId: id, reason: reason.trim() }); flash('Thanks — the admin will review your report.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send the report.'); }
  }

  const visible = useMemo(() => {
    if (chip === 'All') return items;
    if (tab === 'Resources') return items.filter((i) => str(i, 'category').toLowerCase() === chip.toLowerCase());
    if (tab === 'Products') return chip === 'Free' ? items.filter((i) => Number(i.price_kes) === 0) : items.filter((i) => str(i, 'type', 'category').toLowerCase() === chip.toLowerCase());
    return items;
  }, [items, chip, tab]);

  const heading = tab === 'MyUploads' ? 'My uploads' : tab === 'Admin' ? 'Admin review' : tabs.find((t) => t.key === tab)?.label;

  function resourceCard(item: StudyItem) {
    const id = str(item, 'id');
    return <article className="slx-card" key={id}>
      <div className="slx-cover"><img src={NOTES_COVER} alt="" loading="lazy" /><span className="slx-badge">{str(item, 'category') || 'Notes'}</span></div>
      <div className="slx-body"><h3>{str(item, 'title') || 'Untitled'}</h3>{str(item, 'description') && <p>{str(item, 'description')}</p>}
        <div className="slx-meta">{[str(item, 'course'), str(item, 'unit_code'), str(item, 'year_of_study') && `Year ${str(item, 'year_of_study')}`].filter(Boolean).join(' · ')}</div>
        <div className="slx-foot"><button className="sl-card-link" onClick={() => void downloadFree(id)}><Download size={15} /> Download</button><button className="slx-report" onClick={() => void report('Resource', id)}>Report</button></div></div>
    </article>;
  }

  function productCard(item: StudyItem) {
    const id = str(item, 'id'); const price = Number(item.price_kes) || 0; const state = orders[id]; const cover = str(item, 'cover_url');
    return <article className="slx-card" key={id}>
      <div className="slx-cover">{cover && <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}<span className="slx-badge">{str(item, 'type', 'category') || 'Project'}</span><span className="slx-price-tag">{price === 0 ? 'Free' : `KSh ${price}`}</span></div>
      <div className="slx-body"><h3>{str(item, 'title') || 'Untitled'}</h3>{str(item, 'description') && <p>{str(item, 'description')}</p>}
        {str(item, 'course') && <div className="slx-meta">{str(item, 'course')}</div>}
        {str(item, 'tags') && <div className="slx-tags">{str(item, 'tags').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4).map((t) => <span key={t}>{t}</span>)}</div>}
        <div className="slx-foot">
          {price === 0 ? <button className="slx-buy" onClick={() => void downloadFree(id)}><Download size={14} /> Download free</button>
            : state === 'verified' ? <button className="slx-buy" onClick={() => void downloadPurchased(id)}><Download size={14} /> Download</button>
            : state === 'pending' ? <span className="slx-status">Verifying payment</span>
            : <button className="slx-buy" onClick={() => requireUser(() => setBuying(item))}>Buy · KSh {price}</button>}
          {str(item, 'demo_url') && <a className="sl-card-link" href={str(item, 'demo_url')} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Demo</a>}
          <button className="slx-report" onClick={() => void report('Product', id)}>Report</button></div></div>
    </article>;
  }

  function simpleCard(item: StudyItem) {
    const id = str(item, 'id'); const title = str(item, 'title', 'display_name') || 'Untitled'; const link = str(item, 'application_url', 'registration_url');
    return <article className="sl-card" key={id || title}>
      <div className="sl-card-icon">{tab === 'StudyPartners' ? <Users /> : tab === 'Events' ? <CalendarDays /> : <BriefcaseBusiness />}</div>
      <h3>{title}</h3>{str(item, 'description', 'intro') && <p>{str(item, 'description', 'intro')}</p>}
      <div className="sl-meta">{[str(item, 'course', 'organisation', 'organiser', 'location'), str(item, 'year_of_study') && `Year ${str(item, 'year_of_study')}`, str(item, 'units'), str(item, 'study_mode'), str(item, 'availability'), str(item, 'deadline', 'event_date').slice(0, 10)].filter(Boolean).join(' · ')}</div>
      {(tab === 'Opportunities' || tab === 'Events') && link && <a className="sl-card-link" href={link} target="_blank" rel="noreferrer">{tab === 'Events' ? 'Register' : 'Apply'} <ArrowUpRight size={14} /></a>}
      {tab === 'StudyPartners' && <button className="slx-buy" onClick={() => requireUser(() => setRequesting(item))}><UserPlus size={14} /> Request to study together</button>}
    </article>;
  }

  const toolbar = isListTab(tab) && (tab === 'Opportunities' || tab === 'Events' || tab === 'StudyPartners') ? <div className="slx-toolbar">
    <p>{tab === 'StudyPartners' ? 'Find someone to study with. Numbers stay private until a request is accepted.' : `Know of ${tab === 'Events' ? 'an event' : 'an opportunity'}? Suggest it — the admin reviews before it goes live.`}</p>
    {tab === 'StudyPartners' ? <button className="slx-btn" onClick={() => requireUser(() => { setMine('profile'); setTab('MyUploads'); })}><Plus size={15} /> My study profile</button>
      : <button className="slx-btn" onClick={() => requireUser(() => setShowSuggest((v) => !v))}><Plus size={15} /> Suggest {tab === 'Events' ? 'an event' : 'an opportunity'}</button>}
  </div> : null;

  return <main className="study-labs-page">
    <header className="sl-topbar"><button className="sl-back" onClick={onBack}><ArrowLeft size={17} /> Chuka Comrades</button><span className="sl-brand"><img src={`${import.meta.env.BASE_URL}chuka%20crest.jfif`} alt="" /> STUDY LABS</span><span className="sl-user">{user ? user.displayName || user.email : <button onClick={onSignIn}>Sign in</button>}</span></header>
    <section className="sl-hero"><div className="sl-kicker">CHUKA COMRADES · ACADEMIC COMMUNITY</div><h1>Learn. Share. <span>Grow.</span></h1><p>Find learning materials, project resources, study partners and opportunities.</p>
      <div className="sl-search"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes, units, projects, opportunities…" /></div>
      <div className="sl-actions"><button className="sl-primary" onClick={() => requireUser(() => setShowShare((v) => !v))}><FileUp size={17} /> Share</button>{info.communityUrl && <a className="sl-whatsapp" href={info.communityUrl} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Join WhatsApp group <ArrowUpRight size={15} /></a>}</div></section>
    {message && <p className="sl-notice">{message}</p>}{error && <p className="sl-error">{error}</p>}
    {showShare && user && <ShareForm user={user} onClose={() => setShowShare(false)} onDone={(m) => { setShowShare(false); setMine('submissions'); flash(m); }} />}
    <nav className="sl-tabs">{tabs.map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={17} />{label}</button>)}<button className={tab === 'MyUploads' ? 'active' : ''} onClick={() => setTab('MyUploads')}><FileUp size={17} />My uploads</button>{isAdmin && <button className={tab === 'Admin' ? 'active' : ''} onClick={() => setTab('Admin')}><ShieldCheck size={17} />Admin</button>}</nav>
    <section className="sl-content"><div className="sl-content-heading"><div><span className="sl-kicker">EXPLORE</span><h2>{heading}</h2></div>{tab === 'Resources' && <span className="sl-free-tag">Free sharing</span>}</div>
      {tab === 'WhatsApp' ? <div className="slx-wa"><MessageCircle size={34} /><h3>Join the Chuka Study Labs group</h3><p>One WhatsApp group for all Study Labs members. The admin posts announcements, new notes, events and opportunities here.</p>{info.communityUrl ? <a href={info.communityUrl} target="_blank" rel="noreferrer">Join on WhatsApp <ArrowUpRight size={16} /></a> : <small>The group link will be added soon.</small>}<small>Group is admin-only. To chat with other students, use Study partners.</small></div>
        : tab === 'MyUploads' ? <MyUploads user={user} onSignIn={onSignIn} section={mine} onSection={setMine} />
        : tab === 'Admin' && user && isAdmin ? <AdminPanel user={user} />
        : <>
          {toolbar}
          {showSuggest && user && (tab === 'Opportunities' || tab === 'Events') && <SuggestForm user={user} table={tab} onClose={() => setShowSuggest(false)} onDone={(m) => { setShowSuggest(false); flash(m); }} />}
          {CHIPS[tab as ListTab] && <div className="slx-chips">{CHIPS[tab as ListTab]!.map((c) => <button key={c} className={chip === c ? 'active' : ''} onClick={() => setChip(c)}>{c}</button>)}</div>}
          {loading ? <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div>
            : visible.length ? <div className="sl-cards">{visible.map((item) => (tab === 'Resources' ? resourceCard(item) : tab === 'Products' ? productCard(item) : simpleCard(item)))}</div>
            : <div className="sl-empty"><BookOpen size={28} /><strong>{isListTab(tab) ? EMPTY[tab] : ''}</strong><p>New approved listings will appear here.</p></div>}
        </>}
    </section>
    <section className="sl-whatsapp-panel"><MessageCircle size={25} /><div><h2>Stay in the loop on WhatsApp.</h2><p>The Study Labs group is run by the admin — announcements, new notes, events and opportunities.</p></div>{info.communityUrl && <a href={info.communityUrl} target="_blank" rel="noreferrer">Join group <ArrowUpRight size={15} /></a>}</section>
    <section className="sl-official"><h2>Official Chuka learning links</h2><div>{officialLinks.map((link) => <a key={str(link, 'id', 'title')} href={str(link, 'url')} target="_blank" rel="noreferrer">{str(link, 'title')} <ArrowUpRight size={14} /></a>)}</div></section>
    <footer className="sl-footer">Study Labs · Chuka Comrades · Learn together, grow together.</footer>
    {buying && user && <BuyDialog user={user} product={buying} mpesaNumber={info.mpesaNumber} mpesaName={info.mpesaName} onClose={() => setBuying(null)} onDone={(m) => { setBuying(null); flash(m); void refreshOrders(); }} />}
    {requesting && user && <PartnerRequestDialog user={user} profile={requesting} onClose={() => setRequesting(null)} onDone={(m) => { setRequesting(null); flash(m); }} />}
  </main>;
}
