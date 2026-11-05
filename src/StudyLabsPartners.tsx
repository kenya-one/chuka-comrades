import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { LoaderCircle, MessageCircle, X } from 'lucide-react';
import { postStudyAction, shortDate, str, type StudyItem } from './lib/studyLabs';

export const waLink = (number: string) => {
  const d = number.replace(/[^\d]/g, '');
  return `https://wa.me/${d.startsWith('0') ? '254' + d.slice(1) : d}`;
};

/** Shown when a student wants to study with someone. Contacts are only exchanged after the other person accepts. */
export function PartnerRequestDialog({ user, profile, onClose, onDone }: { user: User; profile: StudyItem; onClose: () => void; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError('');
    try { const r = await postStudyAction(user, { action: 'requestPartner', profileId: str(profile, 'id'), message: f.get('message'), contact: f.get('contact') }); onDone(String(r.message || 'Request sent.')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send the request.'); }
    finally { setBusy(false); }
  }
  return <div className="slx-modal" role="dialog" aria-modal="true" onClick={onClose}>
    <form className="slx-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
      <button type="button" className="slx-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <h3>Study with {str(profile, 'display_name')}</h3>
      {error && <p className="sl-error">{error}</p>}
      <label>Short message<textarea name="message" rows={3} required maxLength={300} placeholder="Hi! I’m also in CSC 210 and looking for a revision partner…" /></label>
      <label>Your WhatsApp number<input name="contact" required placeholder="0712345678" inputMode="tel" /></label>
      <p className="sl-hint">Your number is only shared if they accept. Their number is only shown to you after they accept.</p>
      <button className="sl-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
    </form>
  </div>;
}

export function PartnerProfileForm({ user }: { user: User }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudyItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    postStudyAction(user, { action: 'myPartnerProfile' }).then((r) => setProfile((r.profile as StudyItem) || null)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your profile.')).finally(() => setLoading(false));
  }, [user]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError(''); setMsg('');
    try {
      await postStudyAction(user, { action: 'saveStudyPartner', displayName: f.get('displayName'), course: f.get('course'), yearOfStudy: f.get('yearOfStudy'), units: f.get('units'), studyMode: f.get('studyMode'), availability: f.get('availability'), intro: f.get('intro'), whatsappContact: f.get('whatsappContact') });
      setMsg('Profile saved. It will appear in Study partners once the admin approves it.');
      const r = await postStudyAction(user, { action: 'myPartnerProfile' }); setProfile((r.profile as StudyItem) || null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your profile.'); }
    finally { setBusy(false); }
  }
  if (loading) return <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div>;
  const status = profile ? str(profile, 'status') : '';
  return <form className="slx-panel slx-profile" onSubmit={submit}>
    <div><h3>My study partner profile</h3>{status && <span className={`sla-badge sla-${status}`}>{status === 'active' ? 'Visible to students' : status === 'pending' ? 'Awaiting review' : 'Not approved'}</span>}</div>
    {msg && <p className="sl-notice">{msg}</p>}{error && <p className="sl-error">{error}</p>}
    <div className="sl-form-grid">
      <label>Display name<input name="displayName" required maxLength={60} defaultValue={profile ? str(profile, 'display_name') : user.displayName || ''} /></label>
      <label>Course<input name="course" required maxLength={80} defaultValue={profile ? str(profile, 'course') : ''} placeholder="e.g. BSc Computer Science" /></label>
      <label>Year of study<input name="yearOfStudy" required defaultValue={profile ? str(profile, 'year_of_study') : ''} placeholder="e.g. 2" /></label>
      <label>Study mode<select name="studyMode" defaultValue={profile ? str(profile, 'study_mode') || 'In person' : 'In person'}><option>In person</option><option>Online</option><option>Both</option></select></label>
      <label>Units you want partners for<input name="units" maxLength={150} defaultValue={profile ? str(profile, 'units') : ''} placeholder="e.g. CSC 210, MAT 201" /></label>
      <label>Availability<input name="availability" maxLength={120} defaultValue={profile ? str(profile, 'availability') : ''} placeholder="e.g. Evenings, weekends" /></label>
    </div>
    <label>About you<textarea name="intro" rows={3} maxLength={300} defaultValue={profile ? str(profile, 'intro') : ''} placeholder="What do you want to study and how?" /></label>
    <label>Your WhatsApp number (private)<input name="whatsappContact" required inputMode="tel" defaultValue={profile ? str(profile, 'whatsapp_contact') : ''} placeholder="0712345678" /></label>
    <p className="sl-hint">Your number is never shown publicly. It is only shared with someone after you accept their request. Editing your profile sends it for review again.</p>
    <button className="sl-primary" disabled={busy}>{busy ? 'Saving…' : profile ? 'Update profile' : 'Create profile'}</button>
  </form>;
}

export function PartnerRequests({ user }: { user: User }) {
  const [data, setData] = useState<{ incoming: StudyItem[]; outgoing: StudyItem[] } | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const load = useCallback(async () => {
    try { const r = await postStudyAction(user, { action: 'myPartnerRequests' }); setData({ incoming: (r.incoming as StudyItem[]) || [], outgoing: (r.outgoing as StudyItem[]) || [] }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load requests.'); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  async function respond(id: string, decision: 'accept' | 'decline') {
    setBusyId(id); setError('');
    try { await postStudyAction(user, { action: 'respondPartnerRequest', id, decision }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not answer the request.'); }
    finally { setBusyId(''); }
  }
  if (!data) return error ? <p className="sl-error">{error}</p> : <div className="sl-loading"><LoaderCircle className="sl-spin" /> Loading…</div>;
  const contactLink = (c: string) => c ? <a className="sla-open" href={waLink(c)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp {c}</a> : null;
  return <div className="slx-requests">
    {error && <p className="sl-error">{error}</p>}
    <h3>Requests to you</h3>
    {!data.incoming.length ? <div className="sla-empty"><p>No requests yet.</p></div> : <div className="sla-list">{data.incoming.map((r) => <article className="sla-row" key={str(r, 'id')}>
      <div className="sla-row-main"><strong>{str(r, 'from_name')}</strong><p>{str(r, 'message')}</p><small>{shortDate(r.created_at)}</small>{str(r, 'status') === 'accepted' && contactLink(str(r, 'contact'))}</div>
      {str(r, 'status') === 'pending' ? <div className="sla-actions"><button className="sla-approve" disabled={busyId === str(r, 'id')} onClick={() => void respond(str(r, 'id'), 'accept')}>Accept</button><button className="sla-reject" disabled={busyId === str(r, 'id')} onClick={() => void respond(str(r, 'id'), 'decline')}>Decline</button></div> : <span className={`sla-badge sla-${str(r, 'status') === 'accepted' ? 'active' : 'rejected'}`}>{str(r, 'status')}</span>}
    </article>)}</div>}
    <h3>Requests you sent</h3>
    {!data.outgoing.length ? <div className="sla-empty"><p>You haven’t asked anyone yet. Open Study partners to find a partner.</p></div> : <div className="sla-list">{data.outgoing.map((r) => <article className="sla-row" key={str(r, 'id')}>
      <div className="sla-row-main"><strong>{str(r, 'to_name')}</strong><p>{str(r, 'message')}</p><small>{shortDate(r.created_at)}</small>{str(r, 'status') === 'accepted' && contactLink(str(r, 'contact'))}</div>
      <span className={`sla-badge sla-${str(r, 'status') === 'accepted' ? 'active' : str(r, 'status') === 'pending' ? 'pending' : 'rejected'}`}>{str(r, 'status')}</span>
    </article>)}</div>}
  </div>;
}
