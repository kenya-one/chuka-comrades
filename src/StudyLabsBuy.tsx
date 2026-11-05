import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { X } from 'lucide-react';
import { postStudyAction, str, type StudyItem } from './lib/studyLabs';

type Props = { user: User; product: StudyItem; mpesaNumber: string; mpesaName: string; onClose: () => void; onDone: (message: string) => void };

/** Manual M-Pesa purchase: buyer pays, enters the transaction code, admin verifies and unlocks the file. */
export default function BuyDialog({ user, product, mpesaNumber, mpesaName, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const code = String(new FormData(e.currentTarget).get('code') || ''); setBusy(true); setError('');
    try { const r = await postStudyAction(user, { action: 'createOrder', productId: str(product, 'id'), paymentReference: code }); onDone(String(r.message || 'Payment submitted for verification.')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not submit your payment.'); }
    finally { setBusy(false); }
  }
  return <div className="slx-modal" role="dialog" aria-modal="true" aria-label="Buy product" onClick={onClose}>
    <form className="slx-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
      <button type="button" className="slx-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <h3>Buy “{str(product, 'title')}”</h3>
      <p className="slx-price">KSh {str(product, 'price_kes')}</p>
      {mpesaNumber ? <ol className="slx-steps">
        <li>Open M-Pesa and send <strong>KSh {str(product, 'price_kes')}</strong> to <strong>{mpesaNumber}</strong>{mpesaName ? ` (${mpesaName})` : ''}.</li>
        <li>Copy the transaction code from the confirmation SMS (e.g. <code>SBK1ABC2DE</code>).</li>
        <li>Enter it below. The admin verifies your payment and unlocks the download — usually within a few hours.</li>
      </ol> : <p className="sl-error">Payment details are not set up yet. Please try again later.</p>}
      {error && <p className="sl-error">{error}</p>}
      <label>M-Pesa transaction code<input name="code" required minLength={8} maxLength={12} autoCapitalize="characters" placeholder="SBK1ABC2DE" disabled={!mpesaNumber} /></label>
      <p className="sl-hint">After approval you will get access with your Google account ({user.email}). Find it under My uploads → Purchases.</p>
      <button className="sl-primary" disabled={busy || !mpesaNumber}>{busy ? 'Submitting…' : 'I have paid — submit code'}</button>
    </form>
  </div>;
}
