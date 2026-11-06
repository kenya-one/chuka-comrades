import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Copy,
  Heart,
  LockKeyhole,
  MessageCircle,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import "./OZone.css";

type Gender = "female" | "male" | "other";
type Category = "dating" | "hookup";
type PublicRequest = {
  id: string;
  category: Category;
  seeking_gender: string;
  min_age: number;
  max_age: number;
  area: string;
  intro: string;
  created_at: string;
  status: string;
};
type Trending = { id: string; title: string; body: string; created_at: string };
type Payment = {
  id: string;
  amount_kes: number;
  status: string;
  created_at: string;
  activated_at: string | null;
  expires_at: string | null;
  mpesa_code?: string;
  user_id?: string;
  alias?: string;
  whatsapp?: string;
  refund_mpesa_code?: string | null;
};
type OzoneProfile = {
  alias: string;
  age: number;
  gender: Gender;
  whatsapp: string;
};
type OzoneInterest = {
  id: string;
  request_id: string;
  status: string;
  created_at: string;
  category?: Category;
  request_code?: string;
};
type OzoneConnection = {
  id: string;
  request_id: string;
  category: Category;
  mutual_at: string;
};
type MyData = {
  is_admin: boolean;
  profile: OzoneProfile | null;
  payments: Payment[];
  active_payment: Payment | null;
  requests: PublicRequest[];
  incoming_interests: OzoneInterest[];
  sent_interests: OzoneInterest[];
  connections: OzoneConnection[];
};
type AdminData = {
  payments: Payment[];
  requests: (PublicRequest & { user_id: string; alias?: string; age?: number; gender?: Gender; whatsapp?: string })[];
  approved_requests: PublicRequest[];
  refunds: Payment[];
};

const API_URL = (
  import.meta.env.VITE_OZONE_API_URL ||
  (import.meta.env.VITE_SUPABASE_URL
    ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/ozone-api`
    : "")
) as string;
const PAYMENT_TILL = (import.meta.env.VITE_OZONE_MPESA_TILL || "") as string;
const NGL_URL = (import.meta.env.VITE_OZONE_NGL_URL || "") as string;
const WHATSAPP_CHANNEL_URL = (import.meta.env.VITE_OZONE_WHATSAPP_CHANNEL_URL || "") as string;

async function ozoneApi<T>(
  user: User | null,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!API_URL) throw new Error("O Zone API is not configured. Ask the administrator to finish setup.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "O Zone request failed.");
  return result as T;
}

const money = (amount: number) => `KSh ${Number(amount).toLocaleString("en-KE")}`;
const dateLabel = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "Not active";
const codeFor = (id: string) => `OZ-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
const genderLabel = (value: string) =>
  value === "female" ? "Women" : value === "male" ? "Men" : value === "any" ? "Everyone" : "All adults";

export default function OZone({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const [tab, setTab] = useState<"discover" | "account" | "admin">("discover");
  const [feed, setFeed] = useState<{ requests: PublicRequest[]; trendings: Trending[] }>({ requests: [], trendings: [] });
  const [myData, setMyData] = useState<MyData | null>(null);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, { alias: string; whatsapp: string }>>({});

  const [paymentForm, setPaymentForm] = useState({
    alias: "",
    age: "18",
    gender: "female" as Gender,
    whatsapp: "",
    mpesa_code: "",
    adult_confirmed: false,
  });
  const [requestForm, setRequestForm] = useState({
    category: "dating" as Category,
    seeking_gender: "any",
    min_age: "18",
    max_age: "35",
    area: "Chuka",
    intro: "",
  });
  const [trendForm, setTrendForm] = useState({ title: "", body: "" });
  const [adminEdits, setAdminEdits] = useState<Record<string, { summary: string; area: string }>>({});

  const loadPublic = useCallback(async () => {
    const result = await ozoneApi<{ requests: PublicRequest[]; trendings: Trending[] }>(null, { action: "public_feed" });
    setFeed({ requests: result.requests || [], trendings: result.trendings || [] });
  }, []);

  const loadMine = useCallback(async () => {
    if (!user) {
      setMyData(null);
      setAdminData(null);
      return;
    }
    const result = await ozoneApi<MyData>(user, { action: "my_data" });
    setMyData(result);
    if (result.profile) {
      setPaymentForm((current) => ({
        ...current,
        alias: result.profile?.alias || current.alias,
        age: String(result.profile?.age || current.age),
        gender: result.profile?.gender || current.gender,
        whatsapp: result.profile?.whatsapp || current.whatsapp,
      }));
    }
    if (!result.is_admin) {
      setAdminData(null);
      if (tab === "admin") setTab("discover");
    }
  }, [user, tab]);

  const loadAdmin = useCallback(async () => {
    if (!user || !myData?.is_admin) return;
    const result = await ozoneApi<AdminData>(user, { action: "admin_dashboard" });
    setAdminData(result);
  }, [user, myData?.is_admin]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      await Promise.all([loadPublic(), loadMine()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh O Zone.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadPublic, loadMine]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (tab === "admin" && myData?.is_admin) {
      void loadAdmin().catch((err) => setError(err instanceof Error ? err.message : "Admin dashboard could not load."));
    }
  }, [tab, myData?.is_admin, loadAdmin]);

  const activePayment = myData?.active_payment || null;
  const isActive = Boolean(activePayment);
  const pendingPayment = myData?.payments.find((payment) => payment.status === "pending");
  const latestPayment = useMemo(() => myData?.payments[0] || null, [myData?.payments]);

  function showMessage(message: string) {
    setNotice(message);
    setError("");
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return onSignIn();
    if (!paymentForm.adult_confirmed || Number(paymentForm.age) < 18) {
      setError("O Zone is for adults aged 18 and above. Please confirm your age.");
      return;
    }
    setBusy("payment");
    setError("");
    setNotice("");
    try {
      await ozoneApi(user, {
        action: "submit_payment",
        alias: paymentForm.alias,
        age: Number(paymentForm.age),
        gender: paymentForm.gender,
        whatsapp: paymentForm.whatsapp,
        mpesa_code: paymentForm.mpesa_code.trim().toUpperCase(),
        consent_18: paymentForm.adult_confirmed,
      });
      showMessage("Payment submitted for admin verification. Your 7-day membership starts only after approval.");
      setPaymentForm((current) => ({ ...current, mpesa_code: "" }));
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment submission failed.");
    } finally {
      setBusy("");
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return onSignIn();
    setBusy("request");
    setError("");
    setNotice("");
    try {
      await ozoneApi(user, {
        action: "submit_request",
        category: requestForm.category,
        seeking_gender: requestForm.seeking_gender,
        min_age: Number(requestForm.min_age),
        max_age: Number(requestForm.max_age),
        area: requestForm.area,
        intro: requestForm.intro,
      });
      showMessage("Your private request has been sent to admin for review. It will appear anonymously after approval.");
      setRequestForm((current) => ({ ...current, intro: "" }));
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setBusy("");
    }
  }

  async function expressInterest(requestId: string) {
    if (!user) return onSignIn();
    if (!isActive) {
      setTab("account");
      setError("An approved KSh 100 weekly membership is required before you can express interest.");
      return;
    }
    setBusy(`interest-${requestId}`);
    setError("");
    try {
      await ozoneApi(user, { action: "express_interest", request_id: requestId });
      showMessage("Your interest has been sent privately. The request owner must accept before any contact details are shared.");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send interest.");
    } finally {
      setBusy("");
    }
  }

  async function respondToInterest(interestId: string, decision: "accept" | "decline") {
    if (!user) return;
    setBusy(`reply-${interestId}`);
    setError("");
    try {
      await ozoneApi(user, { action: "respond_interest", interest_id: interestId, decision });
      showMessage(decision === "accept"
        ? "Match confirmed. Both members can now reveal each other's contact details."
        : "Interest declined. No contact details were shared.");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this interest.");
    } finally {
      setBusy("");
    }
  }

  async function revealContact(connectionId: string) {
    if (!user) return onSignIn();
    setBusy(`contact-${connectionId}`);
    setError("");
    try {
      const contact = await ozoneApi<{ alias: string; whatsapp: string }>(user, {
        action: "get_connection_contact",
        connection_id: connectionId,
      });
      setRevealed((current) => ({ ...current, [connectionId]: contact }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contact details are not available.");
    } finally {
      setBusy("");
    }
  }

  async function adminAction(action: string, fields: Record<string, unknown>, success: string) {
    if (!user) return onSignIn();
    setBusy(action + String(fields.id || ""));
    setError("");
    try {
      await ozoneApi(user, { action, ...fields });
      showMessage(success);
      await Promise.all([loadAdmin(), loadPublic(), loadMine()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin action failed.");
    } finally {
      setBusy("");
    }
  }

  function shareRequest(request: PublicRequest) {
    const message = [
      "CHUKA O ZONE — PRIVATE CONNECTION",
      `Request: ${codeFor(request.id)}`,
      `Category: ${request.category === "hookup" ? "Adults-only casual connection" : "Dating connection"}`,
      `Seeking: ${genderLabel(request.seeking_gender)}`,
      `Age range: ${request.min_age}–${request.max_age}`,
      `Area: ${request.area}`,
      request.intro ? `Summary: ${request.intro}` : "",
      "Interested adults should sign in to Chuka Comrades and send interest through O Zone.",
      "No names or contact details are shared in this announcement.",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  async function publishTrend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await adminAction("admin_publish_trending", trendForm, "Trending post published.");
    setTrendForm({ title: "", body: "" });
  }

  async function copyNglDraft() {
    const draft = `CHUKA O ZONE\n${trendForm.title}\n${trendForm.body}\n\nShared by Chuka O Zone admin.`;
    try {
      await navigator.clipboard.writeText(draft);
      showMessage("Anonymised draft copied. Review it before sharing from NGL or WhatsApp.");
    } catch {
      setError("Clipboard access was blocked. Select and copy the text manually.");
    }
  }

  return (
    <section className="ozone" aria-label="Chuka O Zone">
      <header className="ozone-hero">
        <div className="ozone-hero__copy">
          <span className="ozone-kicker"><Sparkles size={14} /> PRIVATE COMMUNITY SPACE</span>
          <h1>Chuka <em>O Zone</em></h1>
          <p>Dating, adults-only casual connections and Chuka trendings — managed privately by the O Zone admin.</p>
          <div className="ozone-hero__facts">
            <span><Wallet size={15} /> {money(100)} / 7 days</span>
            <span><LockKeyhole size={15} /> Private matching</span>
            <span><ShieldCheck size={15} /> Mutual consent</span>
          </div>
        </div>
        <div className="ozone-hero__mark"><Heart size={40} /><span>OZ</span></div>
      </header>

      <div className="ozone-safety-note">
        <ShieldCheck size={18} />
        <p><strong>Adults only (18+).</strong> Your name and WhatsApp number are never shown in public requests or WhatsApp announcements. Contact details unlock only after the request owner accepts an interest.</p>
      </div>

      <nav className="ozone-tabs" aria-label="O Zone sections">
        <button className={tab === "discover" ? "is-active" : ""} onClick={() => setTab("discover")}><Heart size={16} /> Discover</button>
        <button className={tab === "account" ? "is-active" : ""} onClick={() => setTab("account")}><Wallet size={16} /> My membership</button>
        {myData?.is_admin && <button className={tab === "admin" ? "is-active" : ""} onClick={() => setTab("admin")}><BadgeCheck size={16} /> Admin desk</button>}
        <button className="ozone-refresh" onClick={() => void refreshAll()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "is-spinning" : ""} /> Refresh</button>
      </nav>

      {notice && <div className="ozone-alert ozone-alert--success" role="status"><CheckCircle2 size={17} />{notice}</div>}
      {error && <div className="ozone-alert ozone-alert--error" role="alert"><AlertCircle size={17} />{error}</div>}

      {loading ? <div className="ozone-empty"><span className="ozone-spinner" /> Loading O Zone…</div> : (
        <>
          {tab === "discover" && (
            <div className="ozone-content">
              <div className="ozone-section-heading">
                <div><span className="ozone-eyebrow">PRIVATE REQUEST BOARD</span><h2>Discover connections</h2><p>Only general preferences are public. No names, phone numbers or photos.</p></div>
                <button className="ozone-primary" onClick={() => setTab("account")}>Join for {money(100)} <ArrowUpRight size={15} /></button>
              </div>
              <div className="ozone-request-grid">
                {feed.requests.map((request) => (
                  <article className="ozone-request-card" key={request.id}>
                    <div className="ozone-card-top"><span className={`ozone-category ozone-category--${request.category}`}>{request.category === "hookup" ? "Adults-only casual" : "Dating"}</span><span className="ozone-request-code">{codeFor(request.id)}</span></div>
                    <h3>Looking to connect</h3>
                    <p className="ozone-request-summary">{request.intro}</p>
                    <div className="ozone-request-meta">
                      <span><Users size={14} /> Seeking {genderLabel(request.seeking_gender)}</span>
                      <span><Clock3 size={14} /> Ages {request.min_age}–{request.max_age}</span>
                      <span>{request.area}</span>
                    </div>
                    <button className="ozone-outline" onClick={() => void expressInterest(request.id)} disabled={busy === `interest-${request.id}`}>
                      {busy === `interest-${request.id}` ? "Sending…" : "I'm interested"}
                    </button>
                  </article>
                ))}
                {feed.requests.length === 0 && <div className="ozone-empty-card"><Heart size={25} /><strong>No approved requests yet</strong><span>Approved anonymous requests will appear here.</span></div>}
              </div>

              <div className="ozone-trending-section">
                <div className="ozone-section-heading"><div><span className="ozone-eyebrow">CAMPUS CONVERSATION</span><h2>Chuka trendings</h2><p>Admin-reviewed local updates and conversations.</p></div><Newspaper size={26} /></div>
                <div className="ozone-trending-grid">
                  {feed.trendings.map((item) => <article className="ozone-trend-card" key={item.id}><span><Newspaper size={14} /> O ZONE TRENDING</span><h3>{item.title}</h3><p>{item.body}</p><small>{dateLabel(item.created_at)}</small></article>)}
                  {feed.trendings.length === 0 && <p className="ozone-muted">No trendings have been published yet.</p>}
                </div>
              </div>
              {WHATSAPP_CHANNEL_URL && <a className="ozone-channel-link" href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Follow the O Zone WhatsApp Channel <ArrowUpRight size={14} /></a>}
            </div>
          )}

          {tab === "account" && (
            <div className="ozone-content ozone-account-layout">
              <div className="ozone-account-main">
                <div className="ozone-section-heading"><div><span className="ozone-eyebrow">YOUR PRIVATE MEMBERSHIP</span><h2>My O Zone account</h2><p>One weekly fee covers your O Zone membership for seven days.</p></div></div>
                {isActive ? (
                  <div className="ozone-membership-card ozone-membership-card--active"><CheckCircle2 size={22} /><div><strong>Membership active</strong><span>Valid until {dateLabel(activePayment?.expires_at)}</span><small>Fee paid: {money(activePayment?.amount_kes || 100)}</small></div></div>
                ) : pendingPayment ? (
                  <div className="ozone-membership-card"><Clock3 size={22} /><div><strong>Payment awaiting verification</strong><span>Admin will verify your M-Pesa code before activating seven days.</span><small>Submitted {dateLabel(pendingPayment.created_at)}</small></div></div>
                ) : latestPayment?.status === "refund_due" ? (
                  <div className="ozone-membership-card ozone-membership-card--warning"><Wallet size={22} /><div><strong>Refund due</strong><span>Your seven-day period ended without a mutual match. Admin will process the full KSh 100 refund.</span></div></div>
                ) : null}

                {!isActive && !pendingPayment && (
                  <form className="ozone-form" onSubmit={submitPayment}>
                    <h3>Activate weekly membership</h3>
                    <p className="ozone-form-note">Pay {money(100)} once. Your seven days begin after admin verifies the payment.</p>
                    {PAYMENT_TILL ? <div className="ozone-payment-instructions"><Wallet size={18} /><span>Pay KSh 100 to O Zone Till <strong>{PAYMENT_TILL}</strong>, then enter the M-Pesa transaction code below.</span></div> : <div className="ozone-payment-instructions ozone-payment-instructions--pending"><AlertCircle size={18} /><span>The official O Zone Till number has not been configured yet. Confirm the payment destination with admin before sending money.</span></div>}
                    <div className="ozone-form-grid">
                      <label>Private display alias<input required minLength={2} maxLength={30} value={paymentForm.alias} onChange={(e) => setPaymentForm({ ...paymentForm, alias: e.target.value })} placeholder="Choose a nickname" /></label>
                      <label>Age (18+)<input required type="number" min="18" max="100" value={paymentForm.age} onChange={(e) => setPaymentForm({ ...paymentForm, age: e.target.value })} /></label>
                      <label>Gender<select value={paymentForm.gender} onChange={(e) => setPaymentForm({ ...paymentForm, gender: e.target.value as Gender })}><option value="female">Woman</option><option value="male">Man</option><option value="other">Other / prefer not to say</option></select></label>
                      <label>WhatsApp number (private)<input required type="tel" maxLength={30} value={paymentForm.whatsapp} onChange={(e) => setPaymentForm({ ...paymentForm, whatsapp: e.target.value })} placeholder="07… or 254…" /></label>
                      <label className="ozone-form-wide">M-Pesa transaction code<input required minLength={8} maxLength={20} value={paymentForm.mpesa_code} onChange={(e) => setPaymentForm({ ...paymentForm, mpesa_code: e.target.value.toUpperCase() })} placeholder="e.g. QAB12CDEF3" /></label>
                    </div>
                    <label className="ozone-check"><input type="checkbox" checked={paymentForm.adult_confirmed} onChange={(e) => setPaymentForm({ ...paymentForm, adult_confirmed: e.target.checked })} /> I confirm I am at least 18 years old and agree to the O Zone privacy and safety rules.</label>
                    <button className="ozone-primary" disabled={busy === "payment" || !PAYMENT_TILL}>{busy === "payment" ? "Submitting…" : "Submit KSh 100 payment for verification"}</button>
                    {!PAYMENT_TILL && <small className="ozone-muted">Payment submission will be enabled when the official O Zone Till is configured.</small>}
                  </form>
                )}

                {isActive && (
                  <form className="ozone-form" onSubmit={submitRequest}>
                    <h3>Create a private connection request</h3>
                    <p className="ozone-form-note">Your request is reviewed by admin and published without your identity or contact details.</p>
                    <div className="ozone-form-grid">
                      <label>Connection type<select value={requestForm.category} onChange={(e) => setRequestForm({ ...requestForm, category: e.target.value as Category })}><option value="dating">Dating connection</option><option value="hookup">Adults-only casual connection</option></select></label>
                      <label>Interested in<select value={requestForm.seeking_gender} onChange={(e) => setRequestForm({ ...requestForm, seeking_gender: e.target.value })}><option value="any">Any adult</option><option value="female">Women</option><option value="male">Men</option></select></label>
                      <label>Minimum age<input type="number" min="18" max="100" value={requestForm.min_age} onChange={(e) => setRequestForm({ ...requestForm, min_age: e.target.value })} /></label>
                      <label>Maximum age<input type="number" min="18" max="100" value={requestForm.max_age} onChange={(e) => setRequestForm({ ...requestForm, max_age: e.target.value })} /></label>
                      <label className="ozone-form-wide">General area<input required maxLength={60} value={requestForm.area} onChange={(e) => setRequestForm({ ...requestForm, area: e.target.value })} placeholder="e.g. Chuka town (not your exact address)" /></label>
                      <label className="ozone-form-wide">Short introduction<textarea required minLength={10} maxLength={300} value={requestForm.intro} onChange={(e) => setRequestForm({ ...requestForm, intro: e.target.value })} placeholder="Describe the kind of connection you are looking for. Do not include names, phone numbers or exact addresses." /></label>
                    </div>
                    <button className="ozone-primary" disabled={busy === "request"}>{busy === "request" ? "Sending…" : "Send request to admin"}</button>
                  </form>
                )}
              </div>

              <aside className="ozone-account-side">
                <div className="ozone-side-card"><h3><ShieldCheck size={17} /> Privacy promise</h3><p>Only admin can review your payment and private profile. Public posts use a request code, broad preferences and general area.</p></div>
                <div className="ozone-side-card"><Wallet size={20} /><h3>Refund policy</h3><p>If no mutual connection is made within your seven-day membership, you become eligible for a full KSh 100 refund. Admin sends the refund manually and records the M-Pesa reference.</p></div>
                <div className="ozone-side-card"><Clock3 size={20} /><h3>Weekly membership</h3><p>Seven days start after admin approval — not when you type the M-Pesa code.</p></div>
              </aside>

              <div className="ozone-my-activity">
                <h3>My requests & activity</h3>
                {myData?.requests.map((request) => <div className="ozone-activity-row" key={request.id}><span>{codeFor(request.id)} · {request.category}</span><b>{request.status}</b></div>)}
                {myData?.incoming_interests.map((interest) => <div className="ozone-interest-row" key={interest.id}><div><strong>Someone is interested in your request</strong><small>{dateLabel(interest.created_at)} · {interest.status}</small></div>{interest.status === "pending" && <div className="ozone-inline-actions"><button onClick={() => void respondToInterest(interest.id, "accept")} disabled={busy === `reply-${interest.id}`}>Accept</button><button className="is-muted" onClick={() => void respondToInterest(interest.id, "decline")} disabled={busy === `reply-${interest.id}`}>Decline</button></div>}</div>)}
                {myData?.sent_interests.map((interest) => <div className="ozone-activity-row" key={interest.id}><span>Interest sent · {interest.request_code || codeFor(interest.request_id)}</span><b>{interest.status}</b></div>)}
                {myData?.connections.map((connection) => <div className="ozone-connection-row" key={connection.id}><div><strong>Mutual connection confirmed</strong><small>{connection.category} · {dateLabel(connection.mutual_at)}</small>{revealed[connection.id] && <p className="ozone-revealed-contact"><b>{revealed[connection.id].alias}</b><br />WhatsApp: {revealed[connection.id].whatsapp}</p>}</div><button className="ozone-outline" onClick={() => void revealContact(connection.id)} disabled={busy === `contact-${connection.id}`}>{revealed[connection.id] ? "Refresh contact" : "Reveal contact"}</button></div>)}
                {!myData?.requests.length && !myData?.incoming_interests.length && !myData?.sent_interests.length && !myData?.connections.length && <p className="ozone-muted">Your private activity will appear here.</p>}
              </div>
            </div>
          )}

          {tab === "admin" && myData?.is_admin && (
            <div className="ozone-content ozone-admin">
              <div className="ozone-section-heading"><div><span className="ozone-eyebrow">ADMIN ONLY</span><h2>O Zone admin desk</h2><p>Verify payments, approve anonymous requests, process eligible refunds and publish trends.</p></div><BadgeCheck size={28} /></div>
              <div className="ozone-admin-stats">
                <div><strong>{adminData?.payments.length || 0}</strong><span>Payments to verify</span></div>
                <div><strong>{adminData?.requests.length || 0}</strong><span>Requests to review</span></div>
                <div><strong>{adminData?.refunds.length || 0}</strong><span>Refunds due</span></div>
              </div>

              <section className="ozone-admin-section">
                <h3><Wallet size={18} /> Pending weekly payments</h3>
                {(adminData?.payments || []).map((payment) => <article className="ozone-admin-card" key={payment.id}><div><strong>{payment.alias || "O Zone member"} · {money(payment.amount_kes)}</strong><p>M-Pesa: <b>{payment.mpesa_code}</b> · WhatsApp: {payment.whatsapp || "Not supplied"}</p><small>Submitted {dateLabel(payment.created_at)} · User {payment.user_id?.slice(0, 7)}</small></div><div className="ozone-inline-actions"><button onClick={() => void adminAction("admin_review_payment", { id: payment.id, decision: "approve" }, "Payment verified. Seven-day membership activated.")} disabled={busy.includes(payment.id)}>Approve</button><button className="is-danger" onClick={() => void adminAction("admin_review_payment", { id: payment.id, decision: "reject" }, "Payment rejected.")} disabled={busy.includes(payment.id)}>Reject</button></div></article>)}
                {!adminData?.payments.length && <p className="ozone-muted">No payments are waiting for verification.</p>}
              </section>

              <section className="ozone-admin-section">
                <h3><Heart size={18} /> Connection requests awaiting review</h3>
                {(adminData?.requests || []).map((request) => <article className="ozone-admin-card ozone-admin-card--request" key={request.id}><div><strong>{codeFor(request.id)} · {request.category} · {request.alias || "Member"}</strong><p>{request.intro}</p><small>{request.age} years · {request.gender} · Seeking {genderLabel(request.seeking_gender)} · Private area: {request.area} · WhatsApp {request.whatsapp || "private"}</small><div className="ozone-form"><label>Anonymous public summary<textarea value={adminEdits[request.id]?.summary ?? request.intro} onChange={(e) => setAdminEdits((current) => ({ ...current, [request.id]: { summary: e.target.value, area: current[request.id]?.area ?? request.area } }))} maxLength={300} /></label><label>Public area (broad only)<input value={adminEdits[request.id]?.area ?? request.area} onChange={(e) => setAdminEdits((current) => ({ ...current, [request.id]: { summary: current[request.id]?.summary ?? request.intro, area: e.target.value } }))} maxLength={60} /></label><small>Remove names, phone numbers, usernames, exact locations and identifying details before approving.</small></div></div><div className="ozone-inline-actions"><button onClick={() => void adminAction("admin_review_request", { id: request.id, decision: "approve", public_summary: adminEdits[request.id]?.summary ?? request.intro, public_area: adminEdits[request.id]?.area ?? request.area }, "Anonymous request approved.")} disabled={busy.includes(request.id)}>Approve</button><button className="is-danger" onClick={() => void adminAction("admin_review_request", { id: request.id, decision: "reject" }, "Request rejected.")} disabled={busy.includes(request.id)}>Reject</button></div></article>)}
                {!adminData?.requests.length && <p className="ozone-muted">No requests are waiting for review.</p>}
              </section>

              <section className="ozone-admin-section">
                <h3><Wallet size={18} /> Refunds to process</h3>
                <p className="ozone-form-note">Only mark a refund complete after sending the full KSh 100 back through M-Pesa.</p>
                {(adminData?.refunds || []).map((payment) => <article className="ozone-admin-card" key={payment.id}><div><strong>{payment.alias || "Member"} · {money(payment.amount_kes)}</strong><p>Original M-Pesa code: {payment.mpesa_code} · Expires {dateLabel(payment.expires_at)}</p><small>WhatsApp {payment.whatsapp || "not supplied"}</small></div><button className="ozone-primary" onClick={() => { const code = window.prompt("Enter the M-Pesa refund transaction code after sending the KSh 100 refund:"); if (code?.trim()) void adminAction("admin_mark_refunded", { id: payment.id, refund_mpesa_code: code.trim().toUpperCase() }, "Refund recorded as completed."); }}>Record refund sent</button></article>)}
                {!adminData?.refunds.length && <p className="ozone-muted">No refunds are currently due.</p>}
              </section>

              <section className="ozone-admin-section">
                <h3><MessageCircle size={18} /> WhatsApp announcement desk</h3>
                <p>Share only approved, anonymous request summaries. The button opens WhatsApp with a prepared message; admin must select the O Zone Channel or admin-only group.</p>
                {(adminData?.approved_requests || []).map((request) => <article className="ozone-admin-card" key={request.id}><div><strong>{codeFor(request.id)} · {request.category}</strong><p>Seeking {genderLabel(request.seeking_gender)} · Ages {request.min_age}–{request.max_age} · {request.area}</p></div><button className="ozone-outline" onClick={() => shareRequest(request)}><MessageCircle size={15} /> Share to WhatsApp</button></article>)}
                {WHATSAPP_CHANNEL_URL && <a className="ozone-channel-link" href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noreferrer">Open O Zone WhatsApp Channel <ArrowUpRight size={14} /></a>}
              </section>

              <section className="ozone-admin-section ozone-ngl-section">
                <h3><Sparkles size={18} /> NGL inbox & trend publishing</h3>
                <p>Open the admin's NGL inbox separately. NGL does not provide a supported direct inbox integration here, so review messages manually and only paste a rewritten, non-identifying summary below. NGL messages alone do not qualify someone for paid matching; they must register and verify their own weekly membership.</p>
                {NGL_URL ? <a className="ozone-primary ozone-link-button" href={NGL_URL} target="_blank" rel="noreferrer">Open admin NGL inbox <ArrowUpRight size={15} /></a> : <div className="ozone-payment-instructions ozone-payment-instructions--pending"><AlertCircle size={18} />Add VITE_OZONE_NGL_URL to the frontend environment after confirming the admin's NGL profile link.</div>}
                <form className="ozone-form" onSubmit={publishTrend}>
                  <h4>Publish an anonymised Chuka trending post</h4>
                  <label>Post title<input required maxLength={100} value={trendForm.title} onChange={(e) => setTrendForm({ ...trendForm, title: e.target.value })} /></label>
                  <label>Rewritten public-safe content<textarea required minLength={10} maxLength={1500} value={trendForm.body} onChange={(e) => setTrendForm({ ...trendForm, body: e.target.value })} placeholder="Remove names, numbers, usernames, exact locations and any details that could identify the sender." /></label>
                  <div className="ozone-inline-actions"><button className="ozone-outline" type="button" onClick={() => void copyNglDraft()}><Copy size={15} /> Copy draft for NGL/WhatsApp</button><button className="ozone-primary" disabled={busy.startsWith("admin_publish_trending")}>Publish trending</button></div>
                </form>
              </section>
            </div>
          )}
        </>
      )}

      <footer className="ozone-footer">
        <span><LockKeyhole size={14} /> Private by default</span>
        <span><Users size={14} /> Adults 18+</span>
        <span><Heart size={14} /> Consent before contact</span>
      </footer>
    </section>
  );
}
