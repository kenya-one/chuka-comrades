import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { fileToBase64, imageToBase64, NOTES_COVER, postStudyAction } from './lib/studyLabs';

const KINDS = [
  { value: 'Notes', label: 'Notes', hub: false },
  { value: 'Past paper', label: 'Past paper', hub: false },
  { value: 'Revision guide', label: 'Revision guide', hub: false },
  { value: 'Project', label: 'Project', hub: true },
  { value: 'Digital product', label: 'Digital product', hub: true },
  { value: 'Template', label: 'Template', hub: true },
];

type ShareProps = { user: User; onClose: () => void; onDone: (message: string) => void };

/** One form for everything: notes go to Materials (free, constant cover); projects/products go to the Project Hub (own cover, free or paid). */
export function ShareForm({ user, onClose, onDone }: ShareProps) {
  const [kind, setKind] = useState('Notes');
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hub = KINDS.find((k) => k.value === kind)?.hub ?? false;

  useEffect(() => {
    if (!cover) { setPreview(''); return; }
    const url = URL.createObjectURL(cover); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget; const form = new FormData(formEl); const file = form.get('file');
    if (!(file instanceof File) || !file.size) { setError('Choose a file to upload.'); return; }
    if (hub && !cover) { setError('Add a cover image for your ' + kind.toLowerCase() + '.'); return; }
    setBusy(true); setError('');
    try {
      const fileBase64 = await fileToBase64(file);
      const common = { title: form.get('title'), description: form.get('description'), fileName: file.name, mimeType: file.type || 'application/octet-stream', fileBase64 };
      if (hub && cover) {
        const img = await imageToBase64(cover);
        await postStudyAction(user, { ...common, action: 'createProduct', type: kind, priceKes: form.get('priceKes') || '0', course: form.get('course'), tags: form.get('tags'), demoUrl: form.get('demoUrl'), coverBase64: img.base64, coverMime: img.mime });
      } else {
        await postStudyAction(user, { ...common, action: 'uploadResource', category: kind, course: form.get('course'), unitCode: form.get('unitCode'), yearOfStudy: form.get('yearOfStudy'), semester: form.get('semester') });
      }
      formEl.reset(); setCover(null);
      onDone('Submitted. Your upload is awaiting admin review — track it under My uploads.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }

  return <form className="sl-upload slx-share" onSubmit={submit}>
    <div className="sl-upload-head"><h2>Share with Study Labs</h2><button type="button" onClick={onClose}>Close</button></div>
    <div className="slx-kinds" role="radiogroup" aria-label="What are you sharing?">
      {KINDS.map((k) => <button type="button" role="radio" aria-checked={kind === k.value} key={k.value} className={kind === k.value ? 'active' : ''} onClick={() => setKind(k.value)}>{k.label}</button>)}
    </div>
    <p className="sl-hint">{hub ? 'Goes to the Project Hub. Add a cover image, and set a price or leave it free.' : 'Goes to Materials and is always free. Notes use the standard Study Labs cover.'}</p>
    {error && <p className="sl-error">{error}</p>}
    <label>Title<input name="title" required maxLength={120} /></label>
    <label>Description<textarea name="description" rows={3} required={hub} placeholder={hub ? 'What is it, what is included, who is it for?' : 'Optional'} /></label>
    {hub ? <>
      <div className="slx-cover-pick">
        <div className="slx-cover-preview">{preview ? <img src={preview} alt="Cover preview" /> : <span><ImagePlus size={22} /> Cover preview</span>}</div>
        <label>Cover image (JPG, PNG or WebP)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCover(e.target.files?.[0] || null)} /></label>
      </div>
      <div className="sl-form-grid">
        <label>Price (KSh) — 0 for free<input name="priceKes" type="number" min="0" max="100000" step="1" defaultValue="0" required /></label>
        <label>Course (optional)<input name="course" placeholder="e.g. BSc Computer Science" /></label>
        <label>Tags (optional)<input name="tags" maxLength={150} placeholder="e.g. react, final year, ecommerce" /></label>
        <label>Demo or GitHub link (optional)<input name="demoUrl" type="url" placeholder="https://…" /></label>
      </div>
    </> : <>
      <div className="slx-cover-pick"><div className="slx-cover-preview"><img src={NOTES_COVER} alt="Standard notes cover" /></div><p className="sl-hint">This standard cover appears on every notes card.</p></div>
      <div className="sl-form-grid">
        <label>Course<input name="course" placeholder="e.g. BSc Computer Science" /></label>
        <label>Unit code<input name="unitCode" placeholder="e.g. CSC 210" /></label>
        <label>Year of study<input name="yearOfStudy" placeholder="e.g. 2" /></label>
        <label>Semester<input name="semester" placeholder="e.g. 1" /></label>
      </div>
    </>}
    <label>{hub ? 'Main file (the product buyers receive)' : 'File'}<input name="file" type="file" required /></label>
    <p className="sl-hint">PDF, Word, PowerPoint, Excel, TXT, PNG, JPG or ZIP — up to 12 MB. Everything is checked by the admin before publishing. Only share work you own or have permission to share.</p>
    <button className="sl-primary" disabled={busy}>{busy ? <><LoaderCircle className="sl-spin" size={17} /> Uploading…</> : 'Submit for review'}</button>
  </form>;
}

type SuggestProps = { user: User; table: 'Opportunities' | 'Events'; onClose: () => void; onDone: (message: string) => void };
export function SuggestForm({ user, table, onClose, onDone }: SuggestProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const events = table === 'Events';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('');
    const record = events
      ? { title: form.get('title'), organiser: form.get('org'), eventType: form.get('type'), description: form.get('description'), location: form.get('location'), registrationUrl: form.get('url'), eventDate: form.get('date') }
      : { title: form.get('title'), organisation: form.get('org'), type: form.get('type'), description: form.get('description'), eligibility: form.get('eligibility'), location: form.get('location'), applicationUrl: form.get('url'), deadline: form.get('date') };
    try { const r = await postStudyAction(user, { action: 'suggestListing', table, record }); onDone(String(r.message || 'Thanks for your suggestion.')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send your suggestion.'); }
    finally { setBusy(false); }
  }
  return <form className="sl-upload" onSubmit={submit}>
    <div className="sl-upload-head"><h2>Suggest {events ? 'an event' : 'an opportunity'}</h2><button type="button" onClick={onClose}>Close</button></div>
    {error && <p className="sl-error">{error}</p>}
    <label>Title<input name="title" required maxLength={120} /></label>
    <div className="sl-form-grid">
      <label>{events ? 'Organiser' : 'Organisation'}<input name="org" /></label>
      <label>Type<input name="type" placeholder={events ? 'Workshop, talk, hackathon…' : 'Internship, scholarship, job…'} /></label>
      <label>Location<input name="location" /></label>
      <label>{events ? 'Date' : 'Deadline'}<input name="date" type="date" /></label>
      <label>{events ? 'Registration link' : 'Application link'}<input name="url" type="url" placeholder="https://…" /></label>
      {!events && <label>Eligibility<input name="eligibility" /></label>}
    </div>
    <label>Description<textarea name="description" rows={3} /></label>
    <p className="sl-hint">Suggestions appear after the Study Labs admin approves them.</p>
    <button className="sl-primary" disabled={busy}>{busy ? 'Sending…' : 'Send suggestion'}</button>
  </form>;
}
