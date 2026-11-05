import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Check, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { bootstrapStudyLabs, postStudyAction, shortDate, str, type StudyItem } from './lib/studyLabs';
import './StudyLabsAdmin.css';

type Section = 'Resources' | 'Products' | 'Orders' | 'StudyPartners' | 'Opportunities' | 'Events' | 'Reports' | 'Post' | 'Settings';
const sections: { key: Section; label: string }[] = [
  { key: 'Resources', label: 'Materials' }, { key: 'Products', label: 'Project Hub' }, { key: 'Orders', label: 'Orders' }, { key: 'StudyPartners', label: 'Partners' },
  { key: 'Opportunities', label: 'Opportunities' }, { key: 'Events', label: 'Events' }, { key: 'Reports', label: 'Reports' }, { key: 'Post', label: 'Post' }, { key: 'Settings', label: 'Settings' },
];
const REVIEWABLE: Section[] = ['Resources', 'Products', 'StudyPartners', 'Opportunities', 'Events'];

export function AdminPanel({ user }: { user: User }) {
  const [section, setSection] = useState<Section>('Resources');
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reviewable = REVIEWABLE.includes(section);
  const isOrders = section === 'Orders';
  const listable = reviewable || isOrders || section === 'Reports';

  const load = useCallback(async () => {
    if (!listable) return;
    setLoading(true); setError('');
    try {
      const filter = section === 'Reports' ? 'open' : status;
      const r = await postStudyAction(user, { action: 'adminList', table: section, status: filter });
      setItems((r.items as StudyItem[]) || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); }
    finally { setLoading(false); }
  }, [user, section, status, listable]);
  useEffect(() => { void load(); }, [load]);

  function pick(next: Section) { setSection(next); setNotice(''); setError(''); setStatus(next === 'Orders' ? 'pending' : 'pending'); }

  async function act(id: string, run: () => Promise<unknown>, done: string) {
    setBusyId(id); setError(''); setNotice('');
    try { await run(); setNotice(done); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusyId(''); }
  }
  function review(item: StudyItem, decision: 'approve' | 'reject') {
    let reason = '';
    if (decision === 'reject') { reason = window.prompt('Reason for rejecting (the student will see this):') || ''; if (!reason.trim()) return; }
    void act(str(item, 'id'), () => postStudyAction(user, { action: 'adminReview', table: section, id: str(item, 'id'), decision, reason }), decision === 'approve' ? 'Approved and published.' : 'Rejected.');
  }
  function verify(item: StudyItem, decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm('Reject this payment?')) return;
    void act(str(item, 'id'), () => postStudyAction(user, { action: 'adminVerifyOrder', id: str(item, 'id'), decision }), decision === 'approve' ? 'Payment verified — the buyer now has access.' : 'Order rejected.');
  }
  function resolveReport(item: StudyItem) {
    void act(str(item, 'id'), () => postStudyAction(user, { action: 'adminUpdate', table: 'Reports', id: str(item, 'id'), field: 'status', value: 'resolved' }), 'Report resolved.');
  }

  const filters = isOrders ? [['pending', 'Pending'], ['verified', 'Verified'], ['rejected', 'Rejected']] : [['pending', 'Pending'], ['active', 'Published'], ['rejected', 'Rejected']];

  return <div className="sla-admin">
    <div className="sla-sections">{sections.map((s) => <button key={s.key} className={section === s.key ? 'active' : ''} onClick={() => pick(s.key)}>{s.label}</button>)}</div>
    {(reviewable || isOrders) && <div className="sla-filter">{filters.map(([key, label]) => <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{label}</button>)}</div>}
    {notice && <p className="sl-notice">{notice}</p>}{error && <p className="sl-error">{error}</p>}
    {section === 'Post' ? <PostForms user={user} onDone={(m) => { setNotice(m); setError(''); }} onError={setError} />
      : section === 'Settings' ? <SettingsForm user={user} onDone={(m) => { setNotice(m); setError(''); }} onError={setError} />
      : loading ? <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div>
      : !items.length ? <div className="sla-empty"><p>Nothing here.</p></div>
      : <div className="sla-list">{items.map((it) => {
        const id = str(it, 'id'); const itemStatus = str(it, 'status'); const busy = busyId === id;
        const price = str(it, 'price_kes', 'amount_kes');
        const meta = [str(it, 'type', 'category'), str(it, 'course'), str(it, 'unit_code'), str(it, 'year_of_study') && `Year ${str(it, 'year_of_study')}`, price && (Number(price) === 0 ? 'Free' : `KSh ${price}`), str(it, 'payment_reference') && `M-Pesa ${str(it, 'payment_reference')}`].filter(Boolean).join(' · ');
        const by = str(it, 'uploader_email', 'seller_email', 'reporter_email', 'suggested_by', 'email');
        return <article className="sla-row sla-admin-row" key={id}>
          <div className="sla-row-main">
            <strong>{str(it, 'title', 'display_name', 'product_title', 'reason') || 'Untitled'}</strong>
            {meta && <span>{meta}</span>}
            {str(it, 'description', 'intro') && <p>{str(it, 'description', 'intro')}</p>}
            {isOrders && <small>Buyer: {str(it, 'buyer_email')} · Seller: {str(it, 'seller_email') || '—'}</small>}
            {!isOrders && by && <small>By {by} · {shortDate(it.created_at)}</small>}
            {section === 'Reports' && <small>{str(it, 'item_type')} · {str(it, 'item_id')}</small>}
            {str(it, 'rejection_reason') && <em>Rejected: {str(it, 'rejection_reason')}</em>}
            {str(it, 'cover_id') && <a className="sla-open" href={`https://drive.google.com/file/d/${str(it, 'cover_id')}/view`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open cover image</a>}
            {str(it, 'file_url') && <a className="sla-open" href={str(it, 'file_url')} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open file (use your admin Google account)</a>}
            {str(it, 'application_url', 'registration_url') && <a className="sla-open" href={str(it, 'application_url', 'registration_url')} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Check the link</a>}
          </div>
          <div className="sla-actions">
            {reviewable && itemStatus !== 'active' && <button className="sla-approve" disabled={busy} onClick={() => review(it, 'approve')}><Check size={15} /> Approve</button>}
            {reviewable && itemStatus !== 'rejected' && <button className="sla-reject" disabled={busy} onClick={() => review(it, 'reject')}><X size={15} /> Reject</button>}
            {isOrders && itemStatus !== 'verified' && <button className="sla-approve" disabled={busy} onClick={() => verify(it, 'approve')}><Check size={15} /> Verify payment</button>}
            {isOrders && itemStatus !== 'rejected' && <button className="sla-reject" disabled={busy} onClick={() => verify(it, 'reject')}><X size={15} /> Reject</button>}
            {section === 'Reports' && <button className="sla-approve" disabled={busy} onClick={() => resolveReport(it)}>Mark resolved</button>}
          </div>
        </article>;
      })}</div>}
  </div>;
}

function SettingsForm({ user, onDone, onError }: { user: User; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [values, setValues] = useState({ whatsappCommunityUrl: '', mpesaNumber: '', mpesaName: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    bootstrapStudyLabs().then((d) => setValues({ whatsappCommunityUrl: String(d.whatsappCommunityUrl || ''), mpesaNumber: String(d.mpesaNumber || ''), mpesaName: String(d.mpesaName || '') })).catch(() => undefined);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); onError('');
    try { await postStudyAction(user, { action: 'adminSaveSettings', ...values }); onDone('Settings saved.'); }
    catch (err) { onError(err instanceof Error ? err.message : 'Could not save settings.'); }
    finally { setBusy(false); }
  }
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));
  return <form className="sla-form" onSubmit={submit}><h3>Study Labs settings</h3>
    <label>WhatsApp community link (the single admin group)<input value={values.whatsappCommunityUrl} onChange={set('whatsappCommunityUrl')} placeholder="https://chat.whatsapp.com/…" /></label>
    <div className="sla-grid"><label>M-Pesa number or till (shown to buyers)<input value={values.mpesaNumber} onChange={set('mpesaNumber')} placeholder="e.g. 0712345678" /></label><label>Name on the M-Pesa account<input value={values.mpesaName} onChange={set('mpesaName')} placeholder="e.g. Sidney Wafula" /></label></div>
    <button className="sl-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></form>;
}

function PostForms({ user, onDone, onError }: { user: User; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [kind, setKind] = useState<'Opportunities' | 'Events'>('Opportunities');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy(true); onError('');
    const record = kind === 'Opportunities'
      ? { title: f.get('title'), organisation: f.get('organisation'), type: f.get('type'), description: f.get('description'), eligibility: f.get('eligibility'), location: f.get('location'), applicationUrl: f.get('url'), deadline: f.get('date') }
      : { title: f.get('title'), organiser: f.get('organisation'), eventType: f.get('type'), description: f.get('description'), location: f.get('location'), registrationUrl: f.get('url'), eventDate: f.get('date') };
    try { await postStudyAction(user, { action: 'adminPublish', table: kind, record }); form.reset(); onDone(`${kind === 'Events' ? 'Event' : 'Opportunity'} published.`); }
    catch (err) { onError(err instanceof Error ? err.message : 'Could not publish.'); } finally { setBusy(false); }
  }
  return <form className="sla-form" onSubmit={submit}>
    <div className="sla-filter"><button type="button" className={kind === 'Opportunities' ? 'active' : ''} onClick={() => setKind('Opportunities')}>Opportunity</button><button type="button" className={kind === 'Events' ? 'active' : ''} onClick={() => setKind('Events')}>Event</button></div>
    <div className="sla-grid"><label>Title<input name="title" required /></label><label>{kind === 'Events' ? 'Organiser' : 'Organisation'}<input name="organisation" /></label><label>Type<input name="type" placeholder={kind === 'Events' ? 'Workshop, talk…' : 'Internship, scholarship…'} /></label><label>Location<input name="location" /></label><label>{kind === 'Events' ? 'Date' : 'Deadline'}<input name="date" type="date" /></label><label>{kind === 'Events' ? 'Registration link' : 'Application link'}<input name="url" type="url" placeholder="https://…" /></label></div>
    {kind === 'Opportunities' && <label>Eligibility<input name="eligibility" /></label>}
    <label>Description<textarea name="description" rows={3} /></label><button className="sl-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</button></form>;
}
