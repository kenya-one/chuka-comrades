import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, Download, FileUp, Lightbulb, LoaderCircle, MessageCircle, Search, ShieldCheck, Users } from 'lucide-react';
import { bootstrapStudyLabs, fileToBase64, jsonp, listStudyItems, postStudyAction, type StudyItem } from './lib/studyLabs';
import { AdminPanel, MyUploads } from './StudyLabsAdmin';
import './StudyLabs.css';

type Props = { user: User | null; onBack: () => void; onSignIn: () => void };
type PublicTab = 'Resources' | 'Products' | 'StudyPartners' | 'Opportunities' | 'Events' | 'WhatsAppGroups';
type Tab = PublicTab | 'MyUploads' | 'Admin';
const tabs: { key: PublicTab; label: string; icon: typeof BookOpen }[] = [
  { key: 'Resources', label: 'Materials', icon: BookOpen },
  { key: 'Products', label: 'Project Hub', icon: Lightbulb },
  { key: 'StudyPartners', label: 'Study partners', icon: Users },
  { key: 'Opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
  { key: 'Events', label: 'Events', icon: CalendarDays },
  { key: 'WhatsAppGroups', label: 'WhatsApp groups', icon: MessageCircle },
];
const text = (item: StudyItem, ...keys: string[]) => { for (const key of keys) if (item[key] !== undefined && item[key] !== null && String(item[key])) return String(item[key]); return ''; };

export default function StudyLabs({ user, onBack, onSignIn }: Props) {
  const [tab, setTab] = useState<Tab>('Resources');
  const [items, setItems] = useState<StudyItem[]>([]);
  const [query, setQuery] = useState('');
  const [communityUrl, setCommunityUrl] = useState('');
  const [officialLinks, setOfficialLinks] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  async function load(nextTab = tab, q = query) {
    if (nextTab === 'MyUploads' || nextTab === 'Admin') { setLoading(false); return; }
    setLoading(true); setError('');
    try { setItems(await listStudyItems(nextTab, q)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load Study Labs.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    bootstrapStudyLabs().then((data) => {
      setCommunityUrl(String(data.whatsappCommunityUrl || ''));
      setOfficialLinks((data.officialLinks as StudyItem[]) || []);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not connect to Study Labs.'));
    void load('Resources', '');
  }, []);
  useEffect(() => {
    setIsAdmin(false);
    if (!user) { if (tab === 'Admin' || tab === 'MyUploads') setTab('Resources'); return; }
    postStudyAction(user, { action: 'whoami' }).then((r) => setIsAdmin(!!r.admin)).catch(() => setIsAdmin(false));
  }, [user]);
  useEffect(() => { const timer = window.setTimeout(() => void load(tab, query), 250); return () => window.clearTimeout(timer); }, [tab, query]);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) { onSignIn(); return; }
    const formElement = event.currentTarget;
    const form = new FormData(formElement); const file = form.get('file');
    if (!(file instanceof File) || !file.size) { setError('Choose a file to upload.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const fileBase64 = await fileToBase64(file);
      const product = form.get('type') === 'product';
      await postStudyAction(user, product ? {
        action: 'createProduct', title: form.get('title'), description: form.get('description'), category: form.get('category') || 'Project ideas', priceKes: form.get('priceKes'), fileName: file.name, mimeType: file.type || 'application/octet-stream', fileBase64,
      } : {
        action: 'uploadResource', title: form.get('title'), description: form.get('description'), category: form.get('category') || 'Notes', course: form.get('course'), unitCode: form.get('unitCode'), yearOfStudy: form.get('yearOfStudy'), semester: form.get('semester'), fileName: file.name, mimeType: file.type || 'application/octet-stream', fileBase64,
      });
      setMessage('Submitted successfully. Your upload is awaiting Study Labs admin review.'); setShowUpload(false); formElement.reset();
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }

  async function download(item: StudyItem) {
    try {
      const id = text(item, 'id');
      const data = await jsonp<{ok:boolean;url?:string;error?:string}>({ action: 'download', id });
      if (!data.ok || !data.url) throw new Error(data.error || 'Download is unavailable.');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this file.'); }
  }

  const emptyText = useMemo(() => ({ Resources: 'No approved study materials yet.', Products: 'No project products have been published yet.', StudyPartners: 'No study partner profiles are available yet.', Opportunities: 'No active opportunities at the moment.', Events: 'No upcoming learning events have been listed.', WhatsAppGroups: 'No WhatsApp groups have been published yet.' }[tab as PublicTab]), [tab]);
  return <main className="study-labs-page">
    <header className="sl-topbar"><button className="sl-back" onClick={onBack}><ArrowLeft size={17}/> Chuka Comrades</button><span className="sl-brand"><img src="/chuka%20crest.jfif" alt=""/> STUDY LABS</span><span className="sl-user">{user ? user.displayName || user.email : <button onClick={onSignIn}>Sign in</button>}</span></header>
    <section className="sl-hero"><div className="sl-kicker">CHUKA COMRADES · ACADEMIC COMMUNITY</div><h1>Learn. Share. <span>Grow.</span></h1><p>Find learning materials, project resources, study partners and opportunities.</p><div className="sl-search"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notes, units, projects, opportunities…" /></div><div className="sl-actions"><button className="sl-primary" onClick={() => user ? setShowUpload(v => !v) : onSignIn()}><FileUp size={17}/> Share a resource</button>{communityUrl && <a className="sl-whatsapp" href={communityUrl} target="_blank" rel="noreferrer"><MessageCircle size={17}/> Join WhatsApp community <ArrowUpRight size={15}/></a>}</div></section>
    {message && <p className="sl-notice">{message}</p>}{error && <p className="sl-error">{error}</p>}
    {showUpload && <form className="sl-upload" onSubmit={submitUpload}><div className="sl-upload-head"><h2>Share with Study Labs</h2><button type="button" onClick={() => setShowUpload(false)}>Close</button></div><label>Submission type<select name="type"><option value="resource">Free study material</option><option value="product">Paid digital product</option></select></label><label>Title<input name="title" required maxLength={120}/></label><label>Description<textarea name="description" rows={3}/></label><div className="sl-form-grid"><label>Category<input name="category" placeholder="Notes, past papers, project ideas"/></label><label>Course<input name="course" placeholder="e.g. BSc Computer Science"/></label><label>Unit code<input name="unitCode" placeholder="e.g. CSC 210"/></label><label>Year of study<input name="yearOfStudy" placeholder="e.g. 2"/></label><label>Semester<input name="semester" placeholder="e.g. 1"/></label><label>Price (KSh, paid products only)<input name="priceKes" type="number" min="1"/></label></div><label>Choose file<input name="file" type="file" required/></label><p className="sl-hint">Maximum 12 MB. Uploads are checked by the Study Labs admin before publication. Only share material you own or have permission to distribute.</p><button className="sl-primary" disabled={busy}>{busy ? <><LoaderCircle className="sl-spin" size={17}/> Uploading…</> : 'Submit for review'}</button></form>}
    <nav className="sl-tabs">{tabs.map(({key,label,icon:Icon}) => <button key={key} className={tab===key?'active':''} onClick={() => setTab(key)}><Icon size={17}/>{label}</button>)}<button className={tab==='MyUploads'?'active':''} onClick={() => setTab('MyUploads')}><FileUp size={17}/>My uploads</button>{isAdmin && <button className={tab==='Admin'?'active':''} onClick={() => setTab('Admin')}><ShieldCheck size={17}/>Admin</button>}</nav>
    <section className="sl-content"><div className="sl-content-heading"><div><span className="sl-kicker">EXPLORE</span><h2>{tab==='MyUploads'?'My uploads':tab==='Admin'?'Admin review':tabs.find(t=>t.key===tab)?.label}</h2></div>{tab==='Resources' && <span className="sl-free-tag">Free sharing</span>}</div>
      {tab==='MyUploads' ? <MyUploads user={user} onSignIn={onSignIn}/> : tab==='Admin' && user && isAdmin ? <AdminPanel user={user}/> : loading ? <div className="sl-loading"><LoaderCircle className="sl-spin"/> Loading…</div> : items.length ? <div className="sl-cards">{items.map((item) => {
        const title = text(item,'title','display_name') || 'Untitled'; const desc = text(item,'description','intro'); const link = text(item,'application_url','registration_url','invite_url','url'); const id = text(item,'id');
        return <article className="sl-card" key={id || title}><div className="sl-card-icon">{tab==='Resources'?<BookOpen/>:tab==='Products'?<Lightbulb/>:tab==='StudyPartners'?<Users/>:tab==='WhatsAppGroups'?<MessageCircle/>:tab==='Events'?<CalendarDays/>:<BriefcaseBusiness/>}</div><h3>{title}</h3>{desc && <p>{desc}</p>}<div className="sl-meta">{text(item,'course','unit_code','organisation','organiser','location','category')}{text(item,'year_of_study') ? ` · Year ${text(item,'year_of_study')}` : ''}{text(item,'price_kes') ? ` · KSh ${text(item,'price_kes')}` : ''}</div>
          {tab==='Resources' && <button className="sl-card-link" onClick={() => void download(item)}><Download size={15}/> Download</button>}
          {tab==='Products' && <span className="sl-card-link sl-muted">KSh {text(item,'price_kes')} · Contact admin to purchase</span>}
          {(tab==='Opportunities'||tab==='Events') && link && <a className="sl-card-link" href={link} target="_blank" rel="noreferrer">{tab==='Events'?'Register':'Apply'} <ArrowUpRight size={14}/></a>}
          {tab==='WhatsAppGroups' && link && <a className="sl-card-link" href={link} target="_blank" rel="noreferrer"><MessageCircle size={15}/> Join group <ArrowUpRight size={14}/></a>}
          {tab==='StudyPartners' && <span className="sl-hint">Connect through your course WhatsApp group. Personal contact details are kept private.</span>}
        </article>;
      })}</div> : <div className="sl-empty"><BookOpen size={28}/><strong>{emptyText}</strong><p>New approved listings will appear here.</p></div>}
    </section>
    <section className="sl-whatsapp-panel"><MessageCircle size={25}/><div><h2>WhatsApp is where the community connects.</h2><p>Join the main Study Labs community for questions, announcements and peer support.</p></div>{communityUrl && <a href={communityUrl} target="_blank" rel="noreferrer">Join community <ArrowUpRight size={15}/></a>}</section>
    <section className="sl-official"><h2>Official Chuka learning links</h2><div>{officialLinks.map((link) => <a key={text(link,'id','title')} href={text(link,'url')} target="_blank" rel="noreferrer">{text(link,'title')} <ArrowUpRight size={14}/></a>)}<a href="https://odel.chuka.ac.ke/" target="_blank" rel="noreferrer">Chuka E-learning <ArrowUpRight size={14}/></a><a href="https://library.chuka.ac.ke/" target="_blank" rel="noreferrer">Chuka Library <ArrowUpRight size={14}/></a></div></section>
    <footer className="sl-footer">Study Labs · Chuka Comrades · Learn together, grow together.</footer>
  </main>;
}
