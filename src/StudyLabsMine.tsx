import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Download, LoaderCircle } from 'lucide-react';
import { openDownload, postStudyAction, shortDate, str, type StudyItem } from './lib/studyLabs';
import { PartnerProfileForm, PartnerRequests } from './StudyLabsPartners';
import './StudyLabsAdmin.css';

export type MineSection = 'submissions' | 'purchases' | 'profile' | 'requests';
const sectionLabels: { key: MineSection; label: string }[] = [
  { key: 'submissions', label: 'Submissions' }, { key: 'purchases', label: 'Purchases' }, { key: 'profile', label: 'Study profile' }, { key: 'requests', label: 'Partner requests' },
];

function Submissions({ user }: { user: User }) {
  const [items, setItems] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    postStudyAction(user, { action: 'myUploads' }).then((r) => setItems((r.items as StudyItem[]) || [])).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your uploads.')).finally(() => setLoading(false));
  }, [user]);
  if (loading) return <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div>;
  if (error) return <p className="sl-error">{error}</p>;
  if (!items.length) return <div className="sla-empty"><p>You haven’t shared anything yet. Tap “Share” at the top to upload notes, a project or a digital product.</p></div>;
  const label: Record<string, string> = { pending: 'Awaiting review', active: 'Published', rejected: 'Not approved' };
  return <div className="sla-list">{items.map((it) => <article className="sla-row" key={str(it, 'id')}>
    <div className="sla-row-main"><strong>{str(it, 'title')}</strong><span>{str(it, 'type')} · {str(it, 'category')} · {shortDate(it.created_at)}</span>{str(it, 'status') === 'rejected' && str(it, 'rejection_reason') && <em>Reason: {str(it, 'rejection_reason')}</em>}</div>
    <span className={`sla-badge sla-${str(it, 'status')}`}>{label[str(it, 'status')] || str(it, 'status')}</span>
  </article>)}</div>;
}

function Purchases({ user }: { user: User }) {
  const [items, setItems] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    postStudyAction(user, { action: 'myOrders' }).then((r) => setItems((r.items as StudyItem[]) || [])).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your purchases.')).finally(() => setLoading(false));
  }, [user]);
  async function download(productId: string) {
    setError('');
    try { await openDownload(async () => { const r = await postStudyAction(user, { action: 'downloadProduct', id: productId }); return String(r.url); }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the file.'); }
  }
  if (loading) return <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div>;
  if (!items.length) return <div className="sla-empty"><p>No purchases yet. Paid items from the Project Hub will show up here.</p></div>;
  return <div className="sla-list">{error && <p className="sl-error">{error}</p>}{items.map((o) => <article className="sla-row" key={str(o, 'id')}>
    <div className="sla-row-main"><strong>{str(o, 'product_title')}</strong><span>KSh {str(o, 'amount_kes')} · {shortDate(o.created_at)}</span>
      {str(o, 'status') === 'pending' && <small>The admin is verifying your M-Pesa payment.</small>}
      {str(o, 'status') === 'rejected' && <em>Payment could not be verified. Contact the admin on WhatsApp.</em>}
      {str(o, 'status') === 'verified' && <small>Open the file while signed in to the Google account you used here.</small>}</div>
    {str(o, 'status') === 'verified' ? <div className="sla-actions"><button className="sla-approve" onClick={() => void download(str(o, 'product_id'))}><Download size={15} /> Download</button></div> : <span className={`sla-badge sla-${str(o, 'status') === 'pending' ? 'pending' : 'rejected'}`}>{str(o, 'status') === 'pending' ? 'Verifying payment' : 'Not verified'}</span>}
  </article>)}</div>;
}

export function MyUploads({ user, onSignIn, section, onSection }: { user: User | null; onSignIn: () => void; section: MineSection; onSection: (s: MineSection) => void }) {
  if (!user) return <div className="sla-empty"><p>Sign in to see your uploads, purchases and study partner requests.</p><button className="sl-primary" onClick={onSignIn}>Sign in</button></div>;
  return <div className="sla-admin">
    <div className="sla-sections">{sectionLabels.map((s) => <button key={s.key} className={section === s.key ? 'active' : ''} onClick={() => onSection(s.key)}>{s.label}</button>)}</div>
    {section === 'submissions' && <Submissions user={user} />}
    {section === 'purchases' && <Purchases user={user} />}
    {section === 'profile' && <PartnerProfileForm user={user} />}
    {section === 'requests' && <PartnerRequests user={user} />}
  </div>;
}
