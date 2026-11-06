import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Check, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { postStudyAction, type StudyItem } from './lib/studyLabs';
import './StudyLabsAdmin.css';

const val = (item: StudyItem, key: string) => (item[key] === undefined || item[key] === null ? '' : String(item[key]));
const shortDate = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }); };

/* ---------- Student: My uploads ---------- */
export function MyUploads({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const [items, setItems] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    postStudyAction(user, { action: 'myUploads' })
      .then((r) => setItems((r.items as StudyItem[]) || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your uploads.'))
      .finally(() => setLoading(false));
  }, [user]);
  if (!user) return <div className="sla-empty"><p>Sign in to see the status of your uploads.</p><button className="sl-primary" onClick={onSignIn}>Sign in</button></div>;
  if (loading) return <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div>;
  if (error) return <p className="sl-error">{error}</p>;
  if (!items.length) return <div className="sla-empty"><p>You haven’t shared anything yet. Use “Share a resource” above.</p></div>;
  const label: Record<string, string> = { pending: 'Awaiting review', active: 'Published', rejected: 'Not approved' };
  return <div className="sla-list">{items.map((it) => <article className="sla-row" key={val(it, 'id')}>
    <div className="sla-row-main"><strong>{val(it, 'title')}</strong><span>{val(it, 'type')} · {val(it, 'category')} · {shortDate(val(it, 'created_at'))}</span>
      {val(it, 'status') === 'rejected' && val(it, 'rejection_reason') && <em>Reason: {val(it, 'rejection_reason')}</em>}</div>
    <span className={`sla-badge sla-${val(it, 'status')}`}>{label[val(it, 'status')] || val(it, 'status')}</span>
  </article>)}</div>;
}

/* ---------- Admin ---------- */
type Section = 'Resources' | 'Products' | 'StudyPartners' | 'Reports' | 'WhatsAppGroups' | 'Post';
const sections: { key: Section; label: string }[] = [
  { key: 'Resources', label: 'Materials' }, { key: 'Products', label: 'Products' }, { key: 'StudyPartners', label: 'Partners' },
  { key: 'Reports', label: 'Reports' }, { key: 'WhatsAppGroups', label: 'Groups' }, { key: 'Post', label: 'Post' },
];

export function AdminPanel({ user }: { user: User }) {
  const [section, setSection] = useState<Section>('Resources');
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reviewable = section === 'Resources' || section === 'Products' || section === 'StudyPartners';

  const load = useCallback(async () => {
    if (section === 'Post') return;
    setLoading(true); setError('');
    try {
      const filter = section === 'Reports' ? 'open' : section === 'WhatsAppGroups' ? '' : status;
      const r = await postStudyAction(user, { action: 'adminList', table: section, ...(filter ? { status: filter } : {}) });
      setItems((r.items as StudyItem[]) || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); }
    finally { setLoading(false); }
  }, [user, section, status]);
  useEffect(() => { void load(); }, [load]);

  async function review(item: StudyItem, decision: 'approve' | 'reject') {
    let reason = '';
    if (decision === 'reject') { reason = window.prompt('Reason for rejecting (the student will see this):') || ''; if (!reason.trim()) return; }
    setBusyId(val(item, 'id')); setError(''); setNotice('');
    try {
      await postStudyAction(user, { action: 'adminReview', table: section, id: val(item, 'id'), decision, reason });
      setNotice(decision === 'approve' ? 'Approved and published.' : 'Rejected.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusyId(''); }
  }
  async function setField(table: string, item: StudyItem, value: string) {
    setBusyId(val(item, 'id')); setError(''); setNotice('');
    try { await postStudyAction(user, { action: 'adminUpdate', table, id: val(item, 'id'), field: 'status', value }); setNotice('Updated.'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Update failed.'); }
    finally { setBusyId(''); }
  }

  return <div className="sla-admin">
    <div className="sla-sections">{sections.map((s) => <button key={s.key} className={section === s.key ? 'active' : ''} onClick={() => { setSection(s.key); setNotice(''); setError(''); }}>{s.label}</button>)}</div>
    {reviewable && <div className="sla-filter">{['pending', 'active', 'rejected'].map((s) => <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{s === 'active' ? 'Published' : s[0].toUpperCase() + s.slice(1)}</button>)}</div>}
    {notice && <p className="sl-notice">{notice}</p>}{error && <p className="sl-error">{error}</p>}
    {section === 'Post' ? <PostForms user={user} onDone={(m) => { setNotice(m); setError(''); }} onError={setError} /> : <>
      {section === 'WhatsAppGroups' && <GroupForm user={user} onDone={() => { setNotice('Group added.'); void load(); }} onError={setError} />}
      {loading ? <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div> : !items.length ? <div className="sla-empty"><p>Nothing here.</p></div> :
        <div className="sla-list">{items.map((it) => <article className="sla-row sla-admin-row" key={val(it, 'id')}>
          <div className="sla-row-main">
            <strong>{val(it, 'title') || val(it, 'display_name') || val(it, 'reason') || 'Untitled'}</strong>
            <span>{[val(it, 'category'), val(it, 'course'), val(it, 'unit_code'), val(it, 'year_of_study') && `Year ${val(it, 'year_of_study')}`, val(it, 'price_kes') && `KSh ${val(it, 'price_kes')}`].filter(Boolean).join(' · ')}</span>
            {val(it, 'description') && <p>{val(it, 'description')}</p>}
            {(val(it, 'uploader_email') || val(it, 'seller_email') || val(it, 'reporter_email')) && <small>By {val(it, 'uploader_email') || val(it, 'seller_email') || val(it, 'reporter_email')} · {shortDate(val(it, 'created_at'))}</small>}
            {section === 'Reports' && <small>{val(it, 'item_type')} · {val(it, 'item_id')}</small>}
            {section === 'WhatsAppGroups' && <small>{val(it, 'invite_url')} · {val(it, 'status')}</small>}
            {val(it, 'rejection_reason') && <em>Rejected: {val(it, 'rejection_reason')}</em>}
            {val(it, 'file_url') && <a className="sla-open" href={val(it, 'file_url')} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open file to preview (use your admin Google account)</a>}
          </div>
          <div className="sla-actions">
            {reviewable && val(it, 'status') !== 'active' && <button className="sla-approve" disabled={busyId === val(it, 'id')} onClick={() => void review(it, 'approve')}><Check size={15} /> Approve</button>}
            {reviewable && val(it, 'status') !== 'rejected' && <button className="sla-reject" disabled={busyId === val(it, 'id')} onClick={() => void review(it, 'reject')}><X size={15} /> Reject</button>}
            {section === 'Reports' && <button className="sla-approve" onClick={() => void setReportResolved(it)}>Mark resolved</button>}
            {section === 'WhatsAppGroups' && <button className="sla-reject" disabled={busyId === val(it, 'id')} onClick={() => void setField('WhatsAppGroups', it, val(it, 'status') === 'active' ? 'disabled' : 'active')}>{val(it, 'status') === 'active' ? 'Disable' : 'Enable'}</button>}
          </div>
        </article>)}</div>}
    </>}
  </div>;

  async function setReportResolved(item: StudyItem) { await setField('Reports', item, 'resolved'); }
}

function GroupForm({ user, onDone, onError }: { user: User; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy(true); onError('');
    try { await postStudyAction(user, { action: 'adminCreateGroup', title: f.get('title'), inviteUrl: f.get('inviteUrl'), course: f.get('course'), yearOfStudy: f.get('yearOfStudy'), unitCode: f.get('unitCode'), description: f.get('description') }); form.reset(); onDone(); }
    catch (err) { onError(err instanceof Error ? err.message : 'Could not add group.'); } finally { setBusy(false); }
  }
  return <form className="sla-form" onSubmit={submit}><h3>Add a WhatsApp group</h3>
    <div className="sla-grid"><label>Group name<input name="title" required /></label><label>Invite link<input name="inviteUrl" required placeholder="https://chat.whatsapp.com/…" /></label><label>Course<input name="course" /></label><label>Year<input name="yearOfStudy" /></label><label>Unit code<input name="unitCode" /></label></div>
    <label>Description<input name="description" /></label><button className="sl-primary" disabled={busy}>{busy ? 'Adding…' : 'Add group'}</button></form>;
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
