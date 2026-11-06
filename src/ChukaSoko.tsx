import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Flag, ImageOff, ImagePlus, LoaderCircle, MessageCircle, Minus, Package, Pause, Pencil, Play, Plus,
  Search, ShieldCheck, Share2, ShoppingBag, Star, Store as StoreIcon, Trash2, Users, Wallet, X,
} from "lucide-react";
import "./ChukaSoko.css";

/* ------------------------------------------------------------------ */
/* Config & API                                                        */
/* ------------------------------------------------------------------ */
const API_URL = (import.meta.env.VITE_CHUKA_SOKO_API_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chuka-soko-api`).replace(/\/$/, "");
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

type StoreView = { individual?: boolean; id: string; slug: string; name: string; description: string; logoUrl: string; location: string; whatsapp: string; phone: string; featured: boolean; productCount?: number; products?: ProductView[] };
type ProductView = { id: string; storeId: string; title: string; category: string; description: string; price: number; condition: string; quantity: number; availability: string; status: string; featured: boolean; images: string[]; store?: StoreView; listingType?: string; commissionAmount?: number; commissionStatus?: string };
type MyStore = { id: string; slug: string; name: string; description: string; logoUrl: string; whatsapp: string; phone: string; showPhone: boolean; location: string; status: string; statusReason: string };
type Me = { isAdmin: boolean; store: MyStore | null; products: ProductView[]; listings: ProductView[]; stats: { total: number; inStock: number; lowStock: number; soldOut: number; paused: number }; config: { storeFee: number; adminWhatsApp: string; sellersGroupUrl: string; maxProductsPerStore: number; commissionPercent: number; maxIndividualListings: number } };
type Category = { id: string; name: string };
type Config = { storeFee: number; adminWhatsApp: string; sellersGroupUrl: string; maxProductsPerStore: number; commissionPercent: number; maxIndividualListings: number };
type AStore = { logoUrl?: string; storeId: string; ownerEmail: string; name: string; whatsapp: string | number; location: string; status: string; statusReason?: string; featured?: boolean | string };
type AProduct = { productId: string; storeId: string; title: string; price: number; quantity: number; status: string; featured: boolean; image?: string; listingType: "store" | "individual"; sellerName?: string; sellerWhatsapp?: string; sellerEmail?: string; sellerLocation?: string; commissionAmount: number; commissionStatus: string };
type APayment = { kind?: string; paymentId: string; storeName: string; amount: number; mpesaReference: string; paidOn: string; note?: string };
type AReport = { reportId: string; productId?: string; storeId?: string; reason: string; details?: string; status: string };
type AdminData = { stores: AStore[]; products: AProduct[]; payments: APayment[]; reports: AReport[]; totals: { collected: number; pendingStores: number; pendingCommissions: number; commissionCollected: number } };
type Props = { user: User | null; onSignIn: () => void; onBack: () => void };

async function parse(response: Response) {
  const raw = await response.text();
  let result: any;
  try { result = JSON.parse(raw); }
  catch { throw new Error(`Chuka Soko returned an unexpected response (HTTP ${response.status}). Check the Edge Function and the Apps Script deployment.`); }
  if (!response.ok || result.success === false) throw new Error(result.error || "Chuka Soko is temporarily unavailable.");
  return result.data;
}
async function publicGet(action: string, params: Record<string, string> = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return parse(await fetch(url.toString(), { headers: SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {} }));
}
async function post(user: User | null, action: string, payload: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return parse(await fetch(API_URL, { method: "POST", headers, body: JSON.stringify({ action, payload }) }));
}

/** Shrinks a photo to <= 1000px JPEG (~150-300 KB) so uploads are fast and fit Apps Script limits. */
async function compressImage(file: File): Promise<{ mimeType: string; data: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process this photo.");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.82, blob: Blob | null = null;
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 1200 * 1024) break;
    quality -= 0.15;
  }
  if (!blob) throw new Error("Could not compress this photo.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.readAsDataURL(blob!);
  });
  return { mimeType: "image/jpeg", data };
}

function money(value: number) { return `KSh ${Number(value || 0).toLocaleString("en-KE")}`; }
function isTrue(v: unknown) { return v === true || String(v).toLowerCase() === "true"; }
function waLink(number: string | number, text = "") { return `https://wa.me/${String(number).replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`; }
function productLink(id: string) { return `${window.location.origin}${window.location.pathname}#/soko/${encodeURIComponent(id)}`; }
function storeLink(slug: string) { return `${window.location.origin}${window.location.pathname}#/soko/store/${encodeURIComponent(slug)}`; }
function shareProductUrl(p: ProductView, s?: StoreView) {
  const where = s?.location ? `\n📍 ${s.location}` : "";
  return waLink("", `🛍️ *${p.title}* — ${money(p.price)}${where}\nSee photos and chat with the seller on Chuka Soko:\n${productLink(p.id)}`);
}
function buyProductUrl(p: ProductView, s: StoreView) {
  return waLink(s.whatsapp, `Hi ${s.name}, I want to buy "${p.title}" (${money(p.price)}) listed on Chuka Soko. Is it still available?\n${productLink(p.id)}`);
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/** Google Drive photos: try the stored thumbnail URL first, then two other public Drive URL forms, then show a placeholder. */
function driveId(u: string) { return u.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1] || ""; }
function imageCandidates(u: string) {
  const id = driveId(u);
  return id ? [u, `https://lh3.googleusercontent.com/d/${id}=w900`, `https://drive.google.com/uc?export=view&id=${id}`] : [u];
}
function SokoImg({ src, alt = "", className, fallback }: { src?: string; alt?: string; className?: string; fallback?: ReactNode }) {
  const list = useMemo(() => (src ? imageCandidates(src) : []), [src]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [src]);
  if (!src || i >= list.length) return <>{fallback ?? <span className="soko-img-missing"><ImageOff size={18} /></span>}</>;
  return <img className={className} src={list[i]} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setI((n) => n + 1)} />;
}

/** Shared busy / message handling for forms and buttons. */
function useRunner(reload: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ type: "ok", text: success }); await reload(); return true; }
    catch (e) { setMsg({ type: "err", text: errMsg(e) }); return false; }
    finally { setBusy(false); }
  }, [reload]);
  return { busy, msg, setMsg, run };
}
function Msg({ msg }: { msg: { type: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return <p className={`soko-alert ${msg.type === "ok" ? "success" : "error"}`}>{msg.type === "ok" && <CheckCircle2 size={16} />}{msg.text}</p>;
}

/* ------------------------------------------------------------------ */
/* Public: product & store cards                                       */
/* ------------------------------------------------------------------ */
function ProductCard({ p, store, onStore, onReport, onOpen }: { p: ProductView; store?: StoreView; onStore?: (slug: string) => void; onReport: (p: ProductView) => void; onOpen: (p: ProductView) => void }) {
  const s = p.store || store;
  const out = p.quantity <= 0;
  return (
    <article className={`soko-product-card${out ? " is-out" : ""}`}>
      <div className="soko-product-image" role="button" tabIndex={0} onClick={() => onOpen(p)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(p); }} aria-label={`View photos of ${p.title}`}>
        {p.images[0] ? <SokoImg src={p.images[0]} alt={p.title} fallback={<div className="soko-image-placeholder"><ShoppingBag size={30} /><small>Photo unavailable</small></div>} /> : <div className="soko-image-placeholder"><ShoppingBag size={30} /><small>No photo</small></div>}
        {p.featured && <span className="soko-featured"><Star size={12} fill="currentColor" /> Featured</span>}
        {out && <span className="soko-sold">Sold out</span>}
        {p.images.length > 1 && <span className="soko-photo-count"><ImagePlus size={11} /> {p.images.length}</span>}
      </div>
      <div className="soko-product-copy">
        <span className="soko-product-category">{p.category}</span>
        <h3 role="button" tabIndex={0} onClick={() => onOpen(p)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(p); }}>{p.title}</h3>
        <strong className="soko-price">{money(p.price)}</strong>
        <p>{p.description}</p>
        <div className="soko-product-meta"><span>{p.condition}</span>{s && <span>{s.location}</span>}</div>
        <span className={`soko-badge ${out ? "out" : p.availability === "Low stock" ? "low" : "ok"}`}>
          {out ? "Sold out" : p.availability === "Low stock" ? `Only ${p.quantity} left` : "In stock"}
        </span>
        {s && onStore && s.slug ? <button className="soko-store-link" onClick={() => onStore(s.slug)}><StoreIcon size={13} /> {s.name}</button> : s?.individual ? <span className="soko-store-link static"><Users size={13} /> {s.name}</span> : null}
        {s && <a className="soko-buy" href={buyProductUrl(p, s)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> <span>{out ? "Ask about restock" : "Chat on WhatsApp to buy"}</span></a>}
        <div className="soko-contact-actions">
          <a className="soko-share" href={shareProductUrl(p, s)} target="_blank" rel="noreferrer"><Share2 size={13} /> Share</a>
          {s?.phone && !out && <a className="soko-call" href={`tel:+${s.phone}`}>Call</a>}
          <button className="soko-report" onClick={() => onReport(p)} title="Report this listing"><Flag size={13} /></button>
        </div>
      </div>
    </article>
  );
}

/** Full-screen product view: every photo, WhatsApp-to-buy and WhatsApp share. */
function ProductModal({ p, onClose, onStore, onReport }: { p: ProductView; onClose: () => void; onStore: (slug: string) => void; onReport: (p: ProductView) => void }) {
  const [idx, setIdx] = useState(0);
  const s = p.store;
  const out = p.quantity <= 0;
  const n = p.images.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight" && n > 1) setIdx((i) => (i + 1) % n); if (e.key === "ArrowLeft" && n > 1) setIdx((i) => (i - 1 + n) % n); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose]);
  return (
    <div className="soko-modal-backdrop" onClick={onClose}>
      <div className="soko-modal" role="dialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <button className="soko-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="soko-gallery">
          <div className="soko-gallery-main">
            {n ? <SokoImg key={p.images[idx]} src={p.images[idx]} alt={`${p.title} photo ${idx + 1}`} fallback={<div className="soko-image-placeholder"><ImageOff size={30} /><small>Photo unavailable</small></div>} /> : <div className="soko-image-placeholder"><ShoppingBag size={30} /><small>No photo</small></div>}
            {n > 1 && <><button className="soko-gal-nav prev" onClick={() => setIdx((i) => (i - 1 + n) % n)} aria-label="Previous photo"><ChevronLeft size={20} /></button><button className="soko-gal-nav next" onClick={() => setIdx((i) => (i + 1) % n)} aria-label="Next photo"><ChevronRight size={20} /></button><span className="soko-gal-count">{idx + 1} / {n}</span></>}
          </div>
          {n > 1 && <div className="soko-gallery-thumbs">{p.images.map((u, i) => <button key={u} className={i === idx ? "on" : ""} onClick={() => setIdx(i)} aria-label={`Photo ${i + 1}`}><SokoImg src={u} /></button>)}</div>}
        </div>
        <div className="soko-modal-info">
          <span className="soko-product-category">{p.category}</span>
          <h2>{p.title}</h2>
          <strong className="soko-price big">{money(p.price)}</strong>
          <div className="soko-product-meta"><span>{p.condition}</span>{s && <span>{s.location}</span>}<span className={`soko-badge ${out ? "out" : p.availability === "Low stock" ? "low" : "ok"}`}>{out ? "Sold out" : p.availability === "Low stock" ? `Only ${p.quantity} left` : "In stock"}</span></div>
          <p className="soko-modal-desc">{p.description}</p>
          {s && (s.slug ? <button className="soko-store-link" onClick={() => { onClose(); onStore(s.slug); }}><StoreIcon size={13} /> Sold by {s.name}</button> : <span className="soko-store-link static"><Users size={13} /> Sold by {s.name}</span>)}
          {s && <a className="soko-buy" href={buyProductUrl(p, s)} target="_blank" rel="noreferrer"><MessageCircle size={17} /> {out ? "Ask about restock on WhatsApp" : "Chat on WhatsApp to buy"}</a>}
          <div className="soko-contact-actions">
            <a className="soko-share" href={shareProductUrl(p, s)} target="_blank" rel="noreferrer"><Share2 size={13} /> Share on WhatsApp</a>
            {s?.phone && !out && <a href={`tel:+${s.phone}`}>Call</a>}
            <button className="soko-report" onClick={() => onReport(p)} title="Report this listing"><Flag size={13} /></button>
          </div>
          <small className="soko-modal-safe">Payment and delivery are arranged directly with the seller. Meet in a safe public place and check the item before paying.</small>
        </div>
      </div>
    </div>
  );
}

function StoreCard({ s, onOpen }: { s: StoreView; onOpen: (slug: string) => void }) {
  return (
    <article className="soko-store-card">
      <button className="soko-store-main" onClick={() => onOpen(s.slug)}>
        <span className="soko-store-logo"><SokoImg src={s.logoUrl} fallback={<StoreIcon size={26} />} /></span>
        <span className="soko-store-info">
          <strong>{s.name}{s.featured && <Star size={12} fill="currentColor" />}</strong>
          <small>{s.location} · {s.productCount ?? 0} product{s.productCount === 1 ? "" : "s"}</small>
          {s.description && <em>{s.description}</em>}
        </span>
      </button>
      <div className="soko-store-actions">
        <a className="soko-buy" href={waLink(s.whatsapp, `Hi ${s.name}, I found your store on Chuka Soko.`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> <span>Chat on WhatsApp</span></a>
        <button className="soko-visit" onClick={() => onOpen(s.slug)}>Visit store</button>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Seller: forms                                                       */
/* ------------------------------------------------------------------ */
function PhotoPicker({ user, urls, setUrls, max, setError }: { user: User; urls: string[]; setUrls: (u: string[]) => void; max: number; setError: (m: string) => void }) {
  const [uploading, setUploading] = useState(0);
  async function pick(files: FileList | null) {
    const chosen = Array.from(files || []).slice(0, max - urls.length);
    if (!chosen.length) return;
    setError(""); setUploading((n) => n + chosen.length);
    let current = urls.slice();
    for (const file of chosen) {
      try {
        const image = await compressImage(file);
        const result = await post(user, "uploadImage", image);
        current = [...current, result.url]; setUrls(current);
      } catch (e) { setError(errMsg(e)); }
      finally { setUploading((n) => n - 1); }
    }
  }
  return (
    <div className="soko-photos">
      <div className="soko-photo-strip">
        {urls.map((u) => <span key={u} className="soko-photo"><SokoImg src={u} /><button type="button" onClick={() => setUrls(urls.filter((x) => x !== u))} aria-label="Remove photo"><X size={12} /></button></span>)}
        {uploading > 0 && <span className="soko-photo uploading"><LoaderCircle className="spin" size={18} /></span>}
        {urls.length + uploading < max && <label className="soko-photo add"><ImagePlus size={20} /><input type="file" accept="image/*" multiple onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} /></label>}
      </div>
      <small>{urls.length}/{max} photos · compressed automatically</small>
    </div>
  );
}

function StoreForm({ user, store, fee, resubmit, onDone }: { user: User; store: MyStore | null; fee: number; resubmit?: boolean; onDone: () => Promise<unknown> }) {
  const [form, setForm] = useState({ name: store?.name || "", description: store?.description || "", whatsapp: store?.whatsapp || "", phone: store?.phone || "", showPhone: store?.showPhone || false, location: store?.location || "" });
  const [logo, setLogo] = useState<string[]>(store?.logoUrl ? [store.logoUrl] : []);
  const [photoError, setPhotoError] = useState("");
  const { busy, msg, run } = useRunner(onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() => post(user, store && !resubmit ? "updateStore" : "requestStore", { ...form, logoUrl: logo[0] || "" }), store && !resubmit ? "Store details saved." : "Store request sent. Pay the admin to get approved.");
  }
  const set = (k: keyof typeof form, v: string | boolean) => setForm({ ...form, [k]: v });
  return (
    <form className="soko-admin-card" onSubmit={submit}>
      <h2><StoreIcon size={19} /> {store && !resubmit ? "Edit store details" : "Open your store"}</h2>
      {!store && <p>Opening a store costs a one-time <strong>{money(fee)}</strong>, paid to the Chuka Soko admin outside the app. Submit your details, then pay and message the admin. Your store goes live once the admin approves it.</p>}
      <Msg msg={msg} />{photoError && <p className="soko-alert error">{photoError}</p>}
      <label>Store name<input required minLength={3} maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Mary's Fashion Corner" /></label>
      <label>About your store<textarea rows={3} maxLength={500} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What do you sell?" /></label>
      <div className="soko-form-row">
        <label>WhatsApp number<input required inputMode="tel" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="0712 345 678" /></label>
        <label>Phone (optional)<input inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0712 345 678" /></label>
      </div>
      <div className="soko-consent-row"><label><input type="checkbox" checked={form.showPhone} onChange={(e) => set("showPhone", e.target.checked)} /> Show a "Call" button to buyers</label></div>
      <label>Location<input required value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Chuka town, Gate B" /></label>
      <label>Store logo (optional)</label>
      <PhotoPicker user={user} urls={logo} setUrls={setLogo} max={1} setError={setPhotoError} />
      <button className="soko-primary" disabled={busy}>{busy ? "Saving…" : store && !resubmit ? "Save changes" : "Submit store request"}</button>
    </form>
  );
}

function ProductForm({ user, categories, product, onDone, onCancel }: { user: User; categories: Category[]; product?: ProductView; onDone: () => Promise<unknown>; onCancel: () => void }) {
  const [form, setForm] = useState({ title: product?.title || "", category: product?.category || "", description: product?.description || "", price: product ? String(product.price) : "", condition: product?.condition || "New", quantity: product ? String(product.quantity) : "1" });
  const [images, setImages] = useState<string[]>(product?.images || []);
  const [photoError, setPhotoError] = useState("");
  const { busy, msg, run } = useRunner(onDone);
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!images.length) { setPhotoError("Add at least one photo."); return; }
    const payload = { ...form, price: Number(form.price), quantity: Number(form.quantity), images, ...(product ? { productId: product.id } : {}) };
    const ok = await run(() => post(user, product ? "updateProduct" : "createProduct", payload), product ? "Product updated." : "Product added. It is now live.");
    if (ok) onCancel();
  }
  return (
    <form className="soko-admin-card soko-product-form" onSubmit={(e) => void submit(e)}>
      <h2><Package size={19} /> {product ? "Edit product" : "Add a product"}</h2>
      <Msg msg={msg} />{photoError && <p className="soko-alert error">{photoError}</p>}
      <label>Product name<input required maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label>Category<select required value={form.category} onChange={(e) => set("category", e.target.value)}><option value="">Choose category</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
      <label>Description<textarea required rows={3} maxLength={1500} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      <div className="soko-form-row">
        <label>Price (KSh)<input required type="number" min={1} step={1} value={form.price} onChange={(e) => set("price", e.target.value)} /></label>
        <label>Quantity in stock<input required type="number" min={0} step={1} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></label>
      </div>
      <label>Condition<select value={form.condition} onChange={(e) => set("condition", e.target.value)}><option>New</option><option>Used - like new</option><option>Used - good</option><option>Refurbished</option></select></label>
      <label>Photos (1 to 5)</label>
      <PhotoPicker user={user} urls={images} setUrls={setImages} max={5} setError={setPhotoError} />
      <div className="soko-actions"><button type="button" className="soko-ghost" onClick={onCancel}>Cancel</button><button className="soko-primary" disabled={busy}>{busy ? "Saving…" : product ? "Save product" : "Add product"}</button></div>
    </form>
  );
}

function QtyControl({ product, disabled, onSet }: { product: ProductView; disabled: boolean; onSet: (q: number | { delta: number }) => void }) {
  const [value, setValue] = useState(String(product.quantity));
  useEffect(() => setValue(String(product.quantity)), [product.quantity]);
  const commit = () => { const n = Number(value); if (Number.isInteger(n) && n >= 0 && n !== product.quantity) onSet(n); else setValue(String(product.quantity)); };
  return (
    <div className="soko-qty">
      <button type="button" disabled={disabled || product.quantity <= 0} onClick={() => onSet({ delta: -1 })} aria-label="Decrease stock"><Minus size={14} /></button>
      <input type="number" min={0} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      <button type="button" disabled={disabled} onClick={() => onSet({ delta: 1 })} aria-label="Increase stock"><Plus size={14} /></button>
    </div>
  );
}

function GroupCard({ url }: { url: string }) {
  if (!url) return null;
  return (
    <div className="soko-group-card">
      <span className="soko-group-icon"><MessageCircle size={22} /></span>
      <div><strong>Join the Chuka Soko sellers' WhatsApp group</strong><small>Selling tips, updates and direct help from the admin and other sellers.</small></div>
      <a href={url} target="_blank" rel="noreferrer">Join group</a>
    </div>
  );
}

function ListingForm({ user, categories, product, defaults, percent, onDone, onCancel }: { user: User; categories: Category[]; product?: ProductView; defaults?: StoreView; percent: number; onDone: () => Promise<unknown>; onCancel: () => void }) {
  const paid = product?.commissionStatus === "paid";
  const seed = product?.store || defaults;
  const [form, setForm] = useState({ title: product?.title || "", category: product?.category || "", description: product?.description || "", price: product ? String(product.price) : "", condition: product?.condition || "New", quantity: product ? String(product.quantity) : "1", sellerName: seed?.name && seed.name !== "Individual seller" ? seed.name : "", sellerWhatsapp: seed?.whatsapp || "", sellerLocation: seed?.location || "" });
  const [images, setImages] = useState<string[]>(product?.images || []);
  const [photoError, setPhotoError] = useState("");
  const { busy, msg, run } = useRunner(onDone);
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });
  const price = Number(form.price) || 0;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!images.length) { setPhotoError("Add at least one photo."); return; }
    const payload = { ...form, price, quantity: Number(form.quantity), images, ...(product ? { productId: product.id } : {}) };
    const ok = await run(() => post(user, product ? "updateListing" : "createListing", payload), product ? "Listing updated." : "Listing saved. It goes live after you pay the commission to the admin.");
    if (ok) onCancel();
  }
  return (
    <form className="soko-admin-card soko-product-form" onSubmit={(e) => void submit(e)}>
      <h2><Package size={19} /> {product ? "Edit listing" : "Sell an item"}</h2>
      <Msg msg={msg} />{photoError && <p className="soko-alert error">{photoError}</p>}
      <label>What are you selling?<input required maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. HP laptop, 8GB RAM" /></label>
      <label>Category<select required value={form.category} onChange={(e) => set("category", e.target.value)}><option value="">Choose category</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
      <label>Description<textarea required rows={3} maxLength={1500} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      <div className="soko-form-row">
        <label>Price (KSh)<input required type="number" min={1} step={1} disabled={paid} value={form.price} onChange={(e) => set("price", e.target.value)} /></label>
        <label>Quantity<input required type="number" min={paid ? 0 : 1} step={1} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></label>
      </div>
      {paid ? <p className="soko-hint">Price is locked because the commission has been paid.</p> : price > 0 && <div className="soko-commission-preview">One-time commission ({percent}%) to the admin: <strong>{money(Math.ceil(price * percent / 100))}</strong></div>}
      <label>Condition<select value={form.condition} onChange={(e) => set("condition", e.target.value)}><option>New</option><option>Used - like new</option><option>Used - good</option><option>Refurbished</option></select></label>
      <div className="soko-form-row">
        <label>Your name<input required minLength={2} maxLength={60} value={form.sellerName} onChange={(e) => set("sellerName", e.target.value)} /></label>
        <label>WhatsApp number (buyers chat here)<input required inputMode="tel" value={form.sellerWhatsapp} onChange={(e) => set("sellerWhatsapp", e.target.value)} placeholder="0712 345 678" /></label>
      </div>
      <label>Where can buyers meet you?<input required value={form.sellerLocation} onChange={(e) => set("sellerLocation", e.target.value)} placeholder="e.g. Chuka town, Gate B" /></label>
      <label>Photos (1 to 5)</label>
      <PhotoPicker user={user} urls={images} setUrls={setImages} max={5} setError={setPhotoError} />
      <div className="soko-actions"><button type="button" className="soko-ghost" onClick={onCancel}>Cancel</button><button className="soko-primary" disabled={busy}>{busy ? "Saving…" : product ? "Save listing" : "Save listing"}</button></div>
    </form>
  );
}

function IndividualPanel({ user, me, categories, reload }: { user: User; me: Me; categories: Category[]; reload: () => Promise<unknown> }) {
  const { busy, msg, run } = useRunner(reload);
  const [editing, setEditing] = useState<ProductView | "new" | null>(null);
  const { config, listings } = me;
  const percent = config.commissionPercent;
  const limitReached = listings.length >= config.maxIndividualListings;
  const adminChat = (p: ProductView) => config.adminWhatsApp ? waLink(config.adminWhatsApp, `Hello Chuka Soko admin, I listed "${p.title}" (${money(p.price)}). I am paying the ${percent}% commission of ${money(p.commissionAmount || 0)}. M-Pesa code: `) : "";
  const setQty = (p: ProductView, q: number | { delta: number }) => void run(() => post(user, "setQuantity", { productId: p.id, ...(typeof q === "number" ? { quantity: q } : q) }), "Stock updated.");
  return (
    <div>
      <div className="soko-status-card"><h2>Sell without opening a store</h2>
        <p>List a single item for free. Chuka Soko takes a one-time <strong>{percent}% commission</strong> of your asking price. Pay it to the admin (outside the app) and your listing goes live for everyone to see.</p></div>
      <Msg msg={msg} />
      {editing ? <ListingForm user={user} categories={categories} product={editing === "new" ? undefined : editing} defaults={listings[0]?.store} percent={percent} onDone={reload} onCancel={() => setEditing(null)} />
        : <button className="soko-primary add-btn" disabled={limitReached} onClick={() => setEditing("new")}><Plus size={16} /> {limitReached ? `Limit of ${config.maxIndividualListings} listings reached` : "Sell an item"}</button>}
      <section className="soko-admin-card">
        <h2><Package size={19} /> My listings</h2>
        {listings.length === 0 ? <div className="soko-inline-empty">You have not listed anything yet.</div> : listings.map((p) => {
          const paid = p.commissionStatus === "paid";
          return (
            <div className={`soko-row${p.status === "paused" ? " paused" : ""}`} key={p.id}>
              <div className="soko-row-main"><SokoImg src={p.images[0]} fallback={<span className="soko-row-noimg"><ShoppingBag size={16} /></span>} />
                <span><strong>{p.title}</strong><small>{money(p.price)} · {!paid ? "Not live yet" : p.status === "paused" ? "Paused (hidden)" : p.availability}</small></span></div>
              {!paid ? <div className="soko-pay-due"><span>Commission due <strong>{money(p.commissionAmount || 0)}</strong></span>{adminChat(p) && <a href={adminChat(p)} target="_blank" rel="noreferrer">Pay & tell admin</a>}</div>
                : <QtyControl product={p} disabled={busy} onSet={(q) => setQty(p, q)} />}
              <div className="soko-row-actions">
                {paid && <button disabled={busy} onClick={() => void run(() => post(user, "setProductStatus", { productId: p.id, status: p.status === "paused" ? "active" : "paused" }), p.status === "paused" ? "Listing is live again." : "Listing hidden.")} title={p.status === "paused" ? "Resume" : "Pause"}>{p.status === "paused" ? <Play size={14} /> : <Pause size={14} />}</button>}
                <button disabled={busy} onClick={() => setEditing(p)} title="Edit"><Pencil size={14} /></button>
                <button disabled={busy} className="danger" onClick={() => { if (window.confirm(`Delete "${p.title}"?`)) void run(() => post(user, "deleteProduct", { productId: p.id }), "Listing deleted."); }} title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seller dashboard                                                    */
/* ------------------------------------------------------------------ */
function SellerDashboard({ user, onSignIn, me, categories, reload, openStore }: { user: User | null; onSignIn: () => void; me: Me | null; categories: Category[]; reload: () => Promise<unknown>; openStore: (slug: string) => void }) {
  const { busy, msg, run } = useRunner(reload);
  const [editing, setEditing] = useState<ProductView | "new" | null>(null);
  const [editStore, setEditStore] = useState(false);
  const [mode, setMode] = useState<"items" | "store">("items");
  if (!user) return <div className="soko-empty"><StoreIcon size={34} /><h3>Sell on Chuka Soko</h3><p>Sign in with Google to open your own store and list products.</p><button onClick={onSignIn}>Sign in with Google</button></div>;
  if (!me) return <div className="soko-loading"><LoaderCircle className="spin" /> Loading your store…</div>;
  const { store, config } = me;
  const adminChat = config.adminWhatsApp ? waLink(config.adminWhatsApp, `Hello Chuka Soko admin, I have requested a store${store ? ` ("${store.name}")` : ""} and want to pay the KSh ${config.storeFee} opening fee.`) : "";

  const group = <GroupCard url={config.sellersGroupUrl} />;
  if (!store || store.status === "rejected") return (
    <div className="soko-seller-page">
      {store && <div className="soko-status-card bad"><h2>Your store request was not approved</h2><p>{store.statusReason || "Please update your details and try again."}</p></div>}
      <div className="soko-mode-tabs">
        <button className={mode === "items" ? "selected" : ""} onClick={() => setMode("items")}><strong>Sell items</strong><small>No store fee · {config.commissionPercent}% commission per listing</small></button>
        <button className={mode === "store" ? "selected" : ""} onClick={() => setMode("store")}><strong>Open a store</strong><small>One-time {money(config.storeFee)} · up to {config.maxProductsPerStore} products</small></button>
      </div>
      {mode === "items" ? <IndividualPanel user={user} me={me} categories={categories} reload={reload} /> : <StoreForm user={user} store={store} fee={config.storeFee} resubmit={Boolean(store)} onDone={reload} />}
      {group}
    </div>
  );
  if (store.status === "suspended") return <div className="soko-seller-page"><div className="soko-status-card bad"><h2>Your store is suspended</h2><p>{store.statusReason || "Contact the Chuka Soko admin for help."}</p>{adminChat && <a href={adminChat} target="_blank" rel="noreferrer">Message the admin</a>}</div>{group}</div>;
  if (store.status === "pending") return (
    <div className="soko-seller-page">
      <div className="soko-status-card"><h2>Waiting for approval</h2>
        <p><strong>{store.name}</strong> has been submitted. Pay the one-time opening fee of <strong>{money(config.storeFee)}</strong> to the Chuka Soko admin, then message the admin so your store can be approved.</p>
        {adminChat && <a href={adminChat} target="_blank" rel="noreferrer">Message the admin on WhatsApp</a>}
        <small>Payments are made outside this app. The admin approves your store after receiving your payment.</small></div>
      <StoreForm user={user} store={store} fee={config.storeFee} onDone={reload} />
      {group}
    </div>
  );

  const limitReached = me.stats.total >= config.maxProductsPerStore;
  const setQty = (p: ProductView, q: number | { delta: number }) => void run(() => post(user, "setQuantity", { productId: p.id, ...(typeof q === "number" ? { quantity: q } : q) }), "Stock updated.");
  return (
    <div className="soko-seller-page">
      <div className="soko-seller-head">
        <span className="soko-store-logo big"><SokoImg src={store.logoUrl} fallback={<StoreIcon size={28} />} /></span>
        <div><span className="soko-kicker">MY STORE</span><h1>{store.name}</h1><small>{store.location}</small></div>
        <div className="soko-head-actions"><button className="soko-ghost" onClick={() => openStore(store.slug)}>View public page</button><button className="soko-ghost" onClick={() => setEditStore(!editStore)}><Pencil size={14} /> Edit store</button></div>
      </div>
      <div className="soko-stat-grid four">
        <div><Package /><strong>{me.stats.total}</strong><small>Products</small></div>
        <div><CheckCircle2 /><strong>{me.stats.inStock}</strong><small>In stock</small></div>
        <div><ShoppingBag /><strong>{me.stats.lowStock}</strong><small>Low stock</small></div>
        <div><X /><strong>{me.stats.soldOut}</strong><small>Sold out</small></div>
      </div>
      <Msg msg={msg} />
      {editStore && <StoreForm user={user} store={store} fee={config.storeFee} onDone={async () => { await reload(); setEditStore(false); }} />}
      {editing ? <ProductForm user={user} categories={categories} product={editing === "new" ? undefined : editing} onDone={reload} onCancel={() => setEditing(null)} /> : (
        <button className="soko-primary add-btn" disabled={limitReached} onClick={() => setEditing("new")}><Plus size={16} /> {limitReached ? `Limit of ${config.maxProductsPerStore} products reached` : "Add a product"}</button>
      )}
      <section className="soko-admin-card">
        <h2><Package size={19} /> My products</h2>
        <p>Update stock after each sale. At 0 the product shows as sold out; 3 or fewer shows "low stock".</p>
        {me.products.length === 0 ? <div className="soko-inline-empty">You have not added any products yet.</div> : me.products.map((p) => (
          <div className={`soko-row${p.status === "paused" ? " paused" : ""}`} key={p.id}>
            <div className="soko-row-main"><SokoImg src={p.images[0]} fallback={<span className="soko-row-noimg"><ShoppingBag size={16} /></span>} />
              <span><strong>{p.title}</strong><small>{money(p.price)} · {p.status === "paused" ? "Paused (hidden)" : p.availability}</small></span></div>
            <QtyControl product={p} disabled={busy} onSet={(q) => setQty(p, q)} />
            <div className="soko-row-actions">
              <button disabled={busy} onClick={() => void run(() => post(user, "setProductStatus", { productId: p.id, status: p.status === "paused" ? "active" : "paused" }), p.status === "paused" ? "Product is live again." : "Product hidden.")} title={p.status === "paused" ? "Resume" : "Pause"}>{p.status === "paused" ? <Play size={14} /> : <Pause size={14} />}</button>
              <button disabled={busy} onClick={() => setEditing(p)} title="Edit"><Pencil size={14} /></button>
              <button disabled={busy} className="danger" onClick={() => { if (window.confirm(`Delete "${p.title}"?`)) void run(() => post(user, "deleteProduct", { productId: p.id }), "Product deleted."); }} title="Delete"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </section>
      {me.listings.length > 0 && <IndividualPanel user={user} me={me} categories={categories} reload={reload} />}
      {group}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin dashboard                                                     */
/* ------------------------------------------------------------------ */
function AdminDashboard({ user, config, onChanged }: { user: User; config: Config; onChanged: () => Promise<unknown> }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<"requests" | "commissions" | "stores" | "payments" | "products" | "reports">("requests");
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    try { setData(await post(user, "adminOverview")); setLoadError(""); } catch (e) { setLoadError(errMsg(e)); }
    await onChanged();
  }, [user, onChanged]);
  useEffect(() => { void load(); }, [load]);
  const { busy, msg, run } = useRunner(load);
  const [codes, setCodes] = useState<Record<string, { ref: string; amount: string }>>({});
  const [payForm, setPayForm] = useState({ storeId: "", amount: String(config.storeFee), mpesaReference: "", note: "" });
  if (loadError) return <p className="soko-alert error">{loadError}</p>;
  if (!data) return <div className="soko-loading"><LoaderCircle className="spin" /> Loading admin data…</div>;
  const storeName = (id?: string) => data.stores.find((s) => s.storeId === id)?.name || "—";
  const ask = (q: string) => window.prompt(q)?.trim() || "";
  const pending = data.stores.filter((s) => s.status === "pending");
  const pendingC = data.products.filter((x) => x.listingType === "individual" && x.commissionStatus !== "paid");
  const tabs: [typeof tab, string][] = [["requests", `Requests (${pending.length})`], ["commissions", `Commissions (${pendingC.length})`], ["stores", "Stores"], ["payments", "Payments"], ["products", "Products"], ["reports", `Reports (${data.reports.filter((r) => r.status === "new").length})`]];
  return (
    <div>
      <div className="soko-stat-grid four">
        <div><StoreIcon /><strong>{data.stores.length}</strong><small>Stores</small></div>
        <div><Users /><strong>{pending.length}</strong><small>Awaiting approval</small></div>
        <div><ShoppingBag /><strong>{data.products.length}</strong><small>Products</small></div>
        <div><Wallet /><strong>{money(data.totals.collected)}</strong><small>Fees &amp; commission logged</small></div>
      </div>
      <div className="soko-tabs">{tabs.map(([k, label]) => <button key={k} className={tab === k ? "selected" : ""} onClick={() => setTab(k)}>{label}</button>)}</div>
      <Msg msg={msg} />

      {tab === "requests" && <section className="soko-admin-card"><h2><Users size={19} /> Store requests</h2><p>Payments happen outside the app. When you receive the {money(config.storeFee)} fee, enter the M-Pesa code to record it, then approve. The code is optional.</p>
        {pending.length === 0 ? <div className="soko-inline-empty">No stores waiting for approval.</div> : pending.map((s) => {
          const c = codes[s.storeId] || { ref: "", amount: String(config.storeFee) };
          return <div className="soko-request" key={s.storeId}>
            <div><span className="soko-admin-logo"><SokoImg src={s.logoUrl} fallback={<StoreIcon size={18} />} /></span><strong>{s.name}</strong><small>{s.ownerEmail} · {s.location}</small><a href={waLink(s.whatsapp, `Hello, this is Chuka Soko about your store "${s.name}".`)} target="_blank" rel="noreferrer">Chat on WhatsApp</a></div>
            <label>M-Pesa code<input value={c.ref} placeholder="e.g. QAB123XYZ" onChange={(e) => setCodes({ ...codes, [s.storeId]: { ...c, ref: e.target.value.toUpperCase() } })} /></label>
            <label>Amount<input type="number" min={1} value={c.amount} onChange={(e) => setCodes({ ...codes, [s.storeId]: { ...c, amount: e.target.value } })} /></label>
            <div className="soko-row-actions wide">
              <button className="primary" disabled={busy} onClick={() => void run(() => post(user, "approveStore", { storeId: s.storeId, ...(c.ref.trim() ? { payment: { mpesaReference: c.ref, amount: Number(c.amount) } } : {}) }), "Store approved and now live.")}>{c.ref.trim() ? "Log payment & approve" : "Approve"}</button>
              <button className="danger" disabled={busy} onClick={() => { const reason = ask("Reason for rejecting this store?"); if (reason) void run(() => post(user, "rejectStore", { storeId: s.storeId, reason }), "Store rejected."); }}>Reject</button>
            </div></div>;
        })}</section>}

      {tab === "commissions" && <section className="soko-admin-card"><h2><Wallet size={19} /> Individual seller commissions</h2><p>Sellers pay the {config.commissionPercent}% commission to you outside the app. Enter the M-Pesa code to log it and put the listing live. Commission collected so far: <strong>{money(data.totals.commissionCollected)}</strong>.</p>
        {pendingC.length === 0 ? <div className="soko-inline-empty">No listings waiting for commission.</div> : pendingC.map((x) => {
          const c = codes[x.productId] || { ref: "", amount: String(x.commissionAmount) };
          return <div className="soko-request" key={x.productId}>
            <div><span className="soko-admin-logo big"><SokoImg src={x.image} fallback={<ShoppingBag size={18} />} /></span><strong>{x.title}</strong><small>{x.sellerName} · {x.sellerLocation} · listed at {money(x.price)}</small><b className="soko-due">{money(x.commissionAmount)} due</b><a href={waLink(x.sellerWhatsapp || "", `Hello ${x.sellerName}, this is Chuka Soko about your listing "${x.title}". The ${config.commissionPercent}% commission is ${money(x.commissionAmount)}.`)} target="_blank" rel="noreferrer">Chat on WhatsApp</a></div>
            <label>M-Pesa code<input value={c.ref} placeholder="e.g. QAB123XYZ" onChange={(e) => setCodes({ ...codes, [x.productId]: { ...c, ref: e.target.value.toUpperCase() } })} /></label>
            <label>Amount<input type="number" min={1} value={c.amount} onChange={(e) => setCodes({ ...codes, [x.productId]: { ...c, amount: e.target.value } })} /></label>
            <div className="soko-row-actions wide">
              <button className="primary" disabled={busy || c.ref.trim().length < 6} onClick={() => void run(() => post(user, "verifyCommission", { productId: x.productId, mpesaReference: c.ref, amount: Number(c.amount) }), "Commission logged. Listing is live.")}>Log payment & go live</button>
              <button className="danger" disabled={busy} onClick={() => { if (window.confirm(`Remove "${x.title}"?`)) void run(() => post(user, "removeProduct", { productId: x.productId }), "Listing removed."); }}>Reject</button>
            </div></div>;
        })}</section>}

      {tab === "stores" && <section className="soko-admin-card"><h2><StoreIcon size={19} /> All stores</h2>
        {data.stores.map((s) => <div className="soko-row" key={s.storeId}>
          <div className="soko-row-main"><span className="soko-admin-logo"><SokoImg src={s.logoUrl} fallback={<StoreIcon size={18} />} /></span><span><strong>{s.name}</strong><small>{s.ownerEmail} · {s.location}</small></span></div>
          <span className={`soko-badge ${s.status === "active" ? "ok" : s.status === "pending" ? "low" : "out"}`}>{s.status}</span>
          <div className="soko-row-actions wide">
            {s.status === "active" && <><button disabled={busy} onClick={() => void run(() => post(user, "setStoreFeatured", { storeId: s.storeId, featured: !isTrue(s.featured) }), "Featured status updated.")}><Star size={14} />{isTrue(s.featured) ? "Unfeature" : "Feature"}</button>
              <button className="danger" disabled={busy} onClick={() => { const reason = ask("Reason for suspending this store?"); if (reason) void run(() => post(user, "suspendStore", { storeId: s.storeId, reason }), "Store suspended and hidden."); }}>Suspend</button></>}
            {(s.status === "suspended" || s.status === "rejected") && <button disabled={busy} onClick={() => void run(() => post(user, "reinstateStore", { storeId: s.storeId }), "Store is live again.")}>Reinstate</button>}
            {s.status === "pending" && <button disabled={busy} onClick={() => void run(() => post(user, "approveStore", { storeId: s.storeId }), "Store approved.")}>Approve</button>}
          </div></div>)}
        {data.stores.length === 0 && <div className="soko-inline-empty">No stores yet.</div>}</section>}

      {tab === "payments" && <section className="soko-admin-card"><h2><Wallet size={19} /> Payment ledger (private)</h2><p>Your own record of store opening fees. Sellers and the public never see this.</p>
        <form className="soko-pay-form" onSubmit={(e) => { e.preventDefault(); void run(() => post(user, "logPayment", { storeId: payForm.storeId, amount: Number(payForm.amount), mpesaReference: payForm.mpesaReference, note: payForm.note }), "Payment recorded.").then((ok) => ok && setPayForm({ ...payForm, mpesaReference: "", note: "" })); }}>
          <select required value={payForm.storeId} onChange={(e) => setPayForm({ ...payForm, storeId: e.target.value })}><option value="">Select store</option>{data.stores.map((s) => <option key={s.storeId} value={s.storeId}>{s.name}</option>)}</select>
          <input required type="number" min={1} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="Amount" />
          <input required value={payForm.mpesaReference} onChange={(e) => setPayForm({ ...payForm, mpesaReference: e.target.value.toUpperCase() })} placeholder="M-Pesa code" />
          <input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} placeholder="Note (optional)" />
          <button className="soko-primary" disabled={busy}>Record payment</button>
        </form>
        {data.payments.map((p) => <div className="soko-row" key={p.paymentId}><div className="soko-row-main"><span><strong>{p.storeName}</strong><small>{p.kind === "commission" ? "Commission · " : "Store fee · "}{p.mpesaReference} · {String(p.paidOn).slice(0, 10)}{p.note ? ` · ${p.note}` : ""}</small></span></div><strong className="soko-price">{money(p.amount)}</strong></div>)}
        {data.payments.length === 0 && <div className="soko-inline-empty">No payments recorded yet.</div>}</section>}

      {tab === "products" && <section className="soko-admin-card"><h2><ShoppingBag size={19} /> All products</h2>
        {data.products.map((p) => <div className="soko-row" key={p.productId}><div className="soko-row-main"><SokoImg src={p.image} fallback={<span className="soko-row-noimg"><ShoppingBag size={16} /></span>} /><span><strong>{p.title}</strong><small>{p.listingType === "individual" ? `Individual: ${p.sellerName}` : storeName(p.storeId)} · {money(p.price)} · {p.quantity} in stock · {p.status}</small></span></div>
          <div className="soko-row-actions wide"><button disabled={busy} onClick={() => void run(() => post(user, "setProductFeatured", { productId: p.productId, featured: !p.featured }), "Featured status updated.")}><Star size={14} />{p.featured ? "Unfeature" : "Feature"}</button>
            <button className="danger" disabled={busy} onClick={() => { if (window.confirm(`Remove "${p.title}" from Chuka Soko?`)) void run(() => post(user, "removeProduct", { productId: p.productId }), "Product removed."); }}>Remove</button></div></div>)}
        {data.products.length === 0 && <div className="soko-inline-empty">No products yet.</div>}</section>}

      {tab === "reports" && <section className="soko-admin-card"><h2><Flag size={19} /> Reports from buyers</h2>
        {data.reports.map((r) => { const prod = data.products.find((p) => p.productId === r.productId); return <div className="soko-row" key={r.reportId}><div className="soko-row-main"><span><strong>{r.reason}</strong><small>{prod ? `Product: ${prod.title}` : `Store: ${storeName(r.storeId)}`}{r.details ? ` · ${r.details}` : ""}</small></span></div>
          {r.status === "new" ? <div className="soko-row-actions wide"><button disabled={busy} onClick={() => void run(() => post(user, "resolveReport", { reportId: r.reportId, status: "resolved" }), "Report resolved.")}>Resolve</button><button disabled={busy} onClick={() => void run(() => post(user, "resolveReport", { reportId: r.reportId, status: "dismissed" }), "Report dismissed.")}>Dismiss</button></div> : <span className="soko-badge ok">{r.status}</span>}</div>; })}
        {data.reports.length === 0 && <div className="soko-inline-empty">No reports.</div>}</section>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export default function ChukaSoko({ user, onSignIn, onBack }: Props) {
  const [view, setView] = useState<"market" | "store" | "seller" | "admin">("market");
  const [products, setProducts] = useState<ProductView[]>([]);
  const [stores, setStores] = useState<StoreView[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<Config>({ storeFee: 300, adminWhatsApp: "", sellersGroupUrl: "", maxProductsPerStore: 30, commissionPercent: 10, maxIndividualListings: 10 });
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"products" | "stores">("products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [openSlug, setOpenSlug] = useState("");
  const [storePage, setStorePage] = useState<StoreView | null>(null);
  const [notice, setNotice] = useState("");
  const [openProduct, setOpenProduct] = useState<ProductView | null>(null);

  const loadPublic = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [p, s, c, cfg] = await Promise.all([publicGet("products"), publicGet("stores"), publicGet("categories"), publicGet("config")]);
      setProducts(Array.isArray(p) ? p : []); setStores(Array.isArray(s) ? s : []); setCategories(Array.isArray(c) ? c : []); setConfig((old) => ({ ...old, ...(cfg || {}) }));
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, []);
  const loadMe = useCallback(async () => {
    if (!user) { setMe(null); return; }
    try { setMe(await post(user, "me")); } catch (e) { setError(errMsg(e)); }
  }, [user]);
  const refreshAll = useCallback(async () => { await Promise.all([loadMe(), loadPublic()]); }, [loadMe, loadPublic]);

  useEffect(() => { void loadPublic(); }, [loadPublic]);
  useEffect(() => { void loadMe(); }, [loadMe]);
  useEffect(() => {
    if (view !== "store" || !openSlug) return;
    let alive = true;
    setStorePage(null);
    publicGet("store", { slug: openSlug }).then((s) => { if (alive) setStorePage(s); }).catch((e) => { if (alive) { setError(errMsg(e)); setView("market"); } });
    return () => { alive = false; };
  }, [view, openSlug]);

  // Shared links: #/soko/<productId> opens that product, #/soko/store/<slug> opens that store.
  useEffect(() => {
    const m = window.location.hash.match(/^#\/soko\/(store\/)?([^/?#]+)/);
    if (!m) return;
    const key = decodeURIComponent(m[2]);
    if (m[1]) { setOpenSlug(key); setView("store"); return; }
    publicGet("product", { id: key }).then((x) => setOpenProduct(x)).catch(() => setNotice("That product is no longer available."));
  }, []);
  const closeProduct = useCallback(() => { setOpenProduct(null); if (/^#\/soko\//.test(window.location.hash)) history.replaceState(null, "", window.location.pathname + window.location.search); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (category === "All" || p.category === category) && (!q || `${p.title} ${p.description} ${p.category} ${p.store?.name || ""} ${p.store?.location || ""}`.toLowerCase().includes(q)));
  }, [products, category, query]);
  const visibleStores = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter((s) => !q || `${s.name} ${s.description} ${s.location}`.toLowerCase().includes(q));
  }, [stores, query]);

  const openStore = (slug: string) => { setOpenProduct(null); setOpenSlug(slug); setView("store"); window.scrollTo({ top: 0 }); };
  const openDetails = (x: ProductView) => setOpenProduct(x.store ? x : { ...x, store: storePage || undefined });
  async function report(p: ProductView) {
    const reason = window.prompt("Why are you reporting this listing? (e.g. scam, wrong price, prohibited item)")?.trim();
    if (!reason) return;
    try { await post(null, "report", { productId: p.id, storeId: p.storeId, reason }); setNotice("Thank you. The admin will review this listing."); }
    catch (e) { setError(errMsg(e)); }
  }
  const goSeller = () => { setError(""); setView("seller"); };
  const isAdmin = Boolean(me?.isAdmin);

  return (
    <section className="soko-shell">
      <div className="soko-topbar">
        <button className="soko-back" onClick={view === "market" ? onBack : () => setView("market")}><ArrowLeft size={17} /> {view === "market" ? "Back to communities" : "Marketplace"}</button>
        <div className="soko-brand"><span><ShoppingBag size={20} /></span><div><strong>Chuka Soko</strong><small>Campus marketplace</small></div></div>
        <div className="soko-nav">
          <button className={view === "seller" ? "active" : ""} onClick={goSeller}><StoreIcon size={15} /> {me?.store ? "My store" : "Sell"}</button>
          {isAdmin && <button className={view === "admin" ? "active" : ""} onClick={() => { setError(""); setView("admin"); }}><ShieldCheck size={15} /> Admin</button>}
        </div>
      </div>
      {error && <p className="soko-alert error">{error}</p>}
      {notice && <p className="soko-alert success"><CheckCircle2 size={16} />{notice}</p>}

      {view === "market" && <>
        <div className="soko-hero"><div><span className="soko-kicker">BUY • SELL • CONNECT</span><h1>Find what you need.<br /><em>Open your own store.</em></h1><p>Shop from student-run stores around Chuka. Sell a single item with a one-time {config.commissionPercent}% commission, or open your own store for KSh {config.storeFee}. Buyers and sellers chat on WhatsApp and arrange payment and delivery directly.</p>
          <div className="soko-support-links"><button onClick={goSeller}>Start selling</button>{config.adminWhatsApp && <a href={waLink(config.adminWhatsApp)} target="_blank" rel="noreferrer">Seller support on WhatsApp</a>}{config.sellersGroupUrl && <a href={config.sellersGroupUrl} target="_blank" rel="noreferrer">Join sellers' group</a>}</div></div>
          <div className="soko-hero-art"><ShoppingBag size={74} /><span>Chuka community marketplace</span></div></div>
        <div className="soko-market-tools">
          <label className="soko-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, stores or location" /></label>
          <div className="soko-tabs"><button className={tab === "products" ? "selected" : ""} onClick={() => setTab("products")}>Products ({visible.length})</button><button className={tab === "stores" ? "selected" : ""} onClick={() => setTab("stores")}>Stores ({visibleStores.length})</button></div>
          {tab === "products" && <div className="soko-categories"><button className={category === "All" ? "selected" : ""} onClick={() => setCategory("All")}>All</button>{categories.map((c) => <button key={c.id} className={category === c.name ? "selected" : ""} onClick={() => setCategory(c.name)}>{c.name}</button>)}</div>}
        </div>
        {loading ? <div className="soko-loading"><LoaderCircle className="spin" /> Loading…</div> : tab === "products"
          ? (visible.length ? <div className="soko-product-grid">{visible.map((p) => <ProductCard key={p.id} p={p} onStore={openStore} onOpen={openDetails} onReport={(x) => void report(x)} />)}</div> : <div className="soko-empty"><ShoppingBag size={34} /><h3>No products found</h3><p>Try a different search or category, or open your own store and be the first to list.</p></div>)
          : (visibleStores.length ? <div className="soko-store-grid">{visibleStores.map((s) => <StoreCard key={s.id} s={s} onOpen={openStore} />)}</div> : <div className="soko-empty"><StoreIcon size={34} /><h3>No stores yet</h3><p>Stores appear here once the admin approves them.</p></div>)}
        <div className="soko-notice"><ShieldCheck size={17} /><span>Buyers and sellers arrange payment and delivery directly. Chuka Soko does not handle buyer payments. Meet in safe public places and inspect items before paying.</span></div>
      </>}

      {view === "store" && (!storePage ? <div className="soko-loading"><LoaderCircle className="spin" /> Loading store…</div> : <div>
        <div className="soko-store-head"><span className="soko-store-logo big"><SokoImg src={storePage.logoUrl} fallback={<StoreIcon size={28} />} /></span>
          <div><h1>{storePage.name}</h1><small>{storePage.location}</small>{storePage.description && <p>{storePage.description}</p>}</div>
          <div className="soko-store-cta"><a className="soko-wa" href={waLink(storePage.whatsapp, `Hi ${storePage.name}, I found your store on Chuka Soko.`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Chat on WhatsApp</a><a className="soko-share" href={waLink("", `🛍️ *${storePage.name}* on Chuka Soko — ${storePage.location}\n${storeLink(storePage.slug)}`)} target="_blank" rel="noreferrer"><Share2 size={13} /> Share store</a></div></div>
        {(storePage.products || []).length ? <div className="soko-product-grid">{(storePage.products || []).map((p) => <ProductCard key={p.id} p={p} store={storePage} onOpen={openDetails} onReport={(x) => void report(x)} />)}</div> : <div className="soko-empty"><ShoppingBag size={34} /><h3>No products yet</h3><p>This store has not listed any products.</p></div>}
      </div>)}

      {view === "seller" && <SellerDashboard user={user} onSignIn={onSignIn} me={me} categories={categories} reload={refreshAll} openStore={openStore} />}

      {view === "admin" && (isAdmin && user ? <div className="soko-admin-page"><div className="soko-admin-heading"><span className="soko-kicker">RESTRICTED ADMIN AREA</span><h1>Chuka Soko admin</h1><p>Signed in as {user.email}.</p></div><AdminDashboard user={user} config={config} onChanged={refreshAll} /></div>
        : <div className="soko-empty"><ShieldCheck size={34} /><h3>Admin access only</h3><p>Sign in with the approved administrator account.</p>{!user && <button onClick={onSignIn}>Sign in with Google</button>}</div>)}
      {openProduct && <ProductModal p={openProduct} onClose={closeProduct} onStore={openStore} onReport={(x) => void report(x)} />}
    </section>
  );
}
