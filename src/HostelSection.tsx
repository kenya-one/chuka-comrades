import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { BadgeCheck, Building2, CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, MapPin, MessageCircle, Phone, RefreshCw, ShieldCheck, Users, X, ZoomIn } from "lucide-react";
import { hostelApi, type HostelAdminData, type HostelListing, type HostelSettings } from "./lib/hostelApi";
import "./HostelSection.css";

const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

/** Official WhatsApp glyph (Simple Icons) in WhatsApp brand green. */
function WhatsAppLogo({ size = 26 }: { size?: number }) {
  return <span className="cc-hostel__wa" aria-hidden="true">
    <svg viewBox="0 0 24 24" width={size} height={size} focusable="false"><path fill="#25D366" d={WA_PATH}/></svg>
  </span>;
}

const money = (value: number) => `KSh ${Number(value).toLocaleString("en-KE")}`;
const digits = (value: string) => value.replace(/\D/g, "");
const waLink = (phone: string, message: string) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(message)}`;
const shareLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;

export default function HostelSection({ user }: { user: User | null; onSignIn: () => void }) {
  const [tab, setTab] = useState<"browse" | "landlord" | "admin">("browse");
  const [listings, setListings] = useState<HostelListing[]>([]);
  const [adminData, setAdminData] = useState<HostelAdminData | null>(null);
  const [settings, setSettings] = useState<HostelSettings>({
    adminWhatsApp: "254180752220",
    landlordGroup: "https://chat.whatsapp.com/JLyKMkmtpvq0mz4WNSRJYt",
    studentFeedbackGroup: "https://chat.whatsapp.com/D2vvu8BwPMI5Fu06F9YsZC",
    maxImagesPerHostel: 3,
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");

  const loadListings = useCallback(async () => {
    const result = await hostelApi.publicListings();
    setListings(result.listings || []);
  }, []);

  const loadSettings = useCallback(async () => {
    const result = await hostelApi.bootstrap();
    setSettings(result);
  }, []);

  const loadAdmin = useCallback(async () => {
    if (!user) { setIsAdmin(false); setAdminData(null); return; }
    try {
      const result = await hostelApi.adminDashboard(user);
      setAdminData(result);
      setIsAdmin(true);
    } catch {
      setIsAdmin(false);
      setAdminData(null);
      if (tab === "admin") setTab("browse");
    }
  }, [user, tab]);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      await Promise.all([loadListings(), loadSettings()]);
      await loadAdmin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hostel listings could not be loaded.");
    } finally { setLoading(false); }
  }, [loadListings, loadSettings, loadAdmin]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (tab === "admin" && user && isAdmin) void loadAdmin();
  }, [tab, user, isAdmin, loadAdmin]);

  const areas = useMemo(() => Array.from(new Set(listings.map((item) => item.area).filter(Boolean))).sort(), [listings]);
  const visibleListings = useMemo(() => listings.filter((item) =>
    item.status === "published" &&
    (areaFilter === "all" || item.area === areaFilter) &&
    `${item.name} ${item.area} ${item.landmark || ""} ${item.room_type}`.toLowerCase().includes(search.toLowerCase())
  ), [listings, areaFilter, search]);

  async function createListing(payload: Record<string, unknown>) {
    if (!user) throw new Error("Sign in with the authorized hostel admin account.");
    setBusy("create"); setError(""); setNotice("");
    try {
      await hostelApi.createListing(user, payload);
      setNotice("Hostel added and published successfully.");
      await refresh();
    } finally { setBusy(""); }
  }

  async function updateStatus(listing: HostelListing, status: "published" | "unavailable") {
    if (!user) return;
    setBusy(listing.id); setError("");
    try {
      await hostelApi.updateListing(user, listing.id, { status });
      await refresh(); setNotice(`${listing.name} status updated.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Listing update failed."); }
    finally { setBusy(""); }
  }

  return <section className="cc-hostel" aria-label="Hostel directory">
    <header className="cc-hostel__hero" style={{ "--hostel-bg": `url(${import.meta.env.BASE_URL}hostel-bg.jpeg)` } as CSSProperties}>
      <span className="cc-hostel__eyebrow">CHUKA COMRADES ACCOMMODATION</span>
      <h1>Find a hostel. Find your space.</h1>
      <p>Browse student accommodation around Chuka, contact landlords directly, or ask our admin team to help you connect.</p>
      <div className="cc-hostel__hero-actions">
        <button onClick={() => setTab("browse")}>Browse hostels <ChevronRight size={16}/></button>
        <button className="is-light" onClick={() => setTab("landlord")}>List your hostel <Building2 size={16}/></button>
      </div>
    </header>

    <div className="cc-hostel__groups">
      <a href={settings.studentFeedbackGroup || undefined} target="_blank" rel="noreferrer" className={!settings.studentFeedbackGroup ? "is-disabled" : ""} onClick={(event) => { if (!settings.studentFeedbackGroup) event.preventDefault(); }}>
        <WhatsAppLogo/><span><strong>Students: Hostels & Reviews</strong><small>Find accommodation, ask questions and share hostel experiences.</small></span><ExternalLink size={16}/>
      </a>
      <a href={settings.landlordGroup || undefined} target="_blank" rel="noreferrer" className={!settings.landlordGroup ? "is-disabled" : ""} onClick={(event) => { if (!settings.landlordGroup) event.preventDefault(); }}>
        <WhatsAppLogo/><span><strong>Landlords' Group</strong><small>Contact admin to submit hostel details and photos.</small></span><ExternalLink size={16}/>
      </a>
    </div>

    <nav className="cc-hostel__tabs">
      <button className={tab === "browse" ? "active" : ""} onClick={() => setTab("browse")}>Hostel directory</button>
      <button className={tab === "landlord" ? "active" : ""} onClick={() => setTab("landlord")}>Landlords: WhatsApp</button>
      {isAdmin && <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>Admin desk</button>}
      <button className="cc-hostel__refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </nav>

    {notice && <p className="cc-hostel__notice" role="status"><CheckCircle2 size={17}/>{notice}</p>}
    {error && <p className="cc-hostel__error" role="alert">{error}</p>}

    {tab === "browse" && <>
      <div className="cc-hostel__filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search hostel, area or landmark…" aria-label="Search hostels"/>
        <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} aria-label="Filter by area"><option value="all">All areas</option>{areas.map((area) => <option key={area}>{area}</option>)}</select>
      </div>
      {loading ? <p className="cc-hostel__empty">Loading available hostels…</p> : <div className="cc-hostel__grid">
        {visibleListings.map((listing) => <HostelCard key={listing.id} listing={listing} adminWhatsApp={settings.adminWhatsApp}/>) }
        {visibleListings.length === 0 && <p className="cc-hostel__empty">No published hostels match your search yet. Check again soon or contact admin for help.</p>}
      </div>}
    </>}

    {tab === "landlord" && <div className="cc-hostel__form cc-hostel__whatsapp-only">
      <div className="cc-hostel__form-heading"><div><span className="cc-hostel__eyebrow">LANDLORD WHATSAPP SUBMISSIONS</span><h2>Submit your hostel through WhatsApp</h2>
        <p>Landlords do not create listings in the app. Send your information directly to the Chuka Comrades hostel admin. The admin checks the details and adds approved hostels to the directory.</p></div><MessageCircle size={30}/></div>
      <ol className="cc-hostel__whatsapp-steps">
        <li>Send the hostel name and landlord/caretaker name.</li>
        <li>Send the exact location, area and a nearby landmark (a Google Maps pin is helpful).</li>
        <li>Send the rent, rent period, room type, number of available rooms and facilities.</li>
        <li>Attach up to three clear photos of the hostel/rooms.</li>
        <li>Send the landlord or caretaker phone number and confirm that it may be displayed to students.</li>
      </ol>
      {settings.adminWhatsApp ? <a className="cc-hostel__primary cc-hostel__whatsapp-submit" href={waLink(settings.adminWhatsApp, "Hello Chuka Comrades Hostel Admin. I would like to submit my hostel for listing. I will send the hostel details, location, rent, availability, up to three photos and contact number here. I confirm I have authority to share these details and approve display of the contact number to interested students.")} target="_blank" rel="noreferrer"><MessageCircle size={17}/> Send hostel details to admin on WhatsApp</a> : <p className="cc-hostel__error">The admin WhatsApp number has not been configured yet. Please contact the Chuka Comrades team.</p>}
      <p className="cc-hostel__fineprint">Your hostel will not appear automatically. Only the admin can enter and publish listings in the app after checking the information and permission to display the contact number.</p>
    </div>}

    {tab === "admin" && isAdmin && adminData && <div className="cc-hostel__admin">
      <AdminCreateHostelForm user={user} busy={busy === "create"} maxImages={settings.maxImagesPerHostel} onCreate={createListing}/>
      <div className="cc-hostel__admin-heading"><div><span className="cc-hostel__eyebrow">ADMIN ONLY</span><h2>Hostel management desk</h2><p>Add WhatsApp-submitted hostels, publish listings and control availability.</p></div><BadgeCheck size={30}/></div>
      <h3>Published / unavailable listings ({adminData.listings.length})</h3>
      {adminData.listings.map((item) => <div className="cc-hostel__manage-row" key={item.id}><span><strong>{item.name}</strong><small>{item.area} · {money(item.rent_amount)}</small></span><span className="cc-hostel__status">{item.status}</span><button onClick={() => void updateStatus(item, item.status === "published" ? "unavailable" : "published")} disabled={busy === item.id}>{item.status === "published" ? "Mark unavailable" : "Republish"}</button><a href={shareLink(`Chuka Comrades Hostel Listing\n${item.name}\nLocation: ${item.area}${item.landmark ? `, near ${item.landmark}` : ""}\nRent: ${money(item.rent_amount)} / ${item.rent_period}\nRoom type: ${item.room_type}\nAvailable: ${item.available_rooms}\nContact: ${item.landlord_contact}\nBrowse on Chuka Comrades.`)} target="_blank" rel="noreferrer">Share to WhatsApp</a></div>)}
    </div>}
  </section>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      if (comma < 0) reject(new Error("Could not read the selected photo."));
      else resolve(dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function AdminCreateHostelForm({ user, busy, maxImages, onCreate }: {
  user: User | null; busy: boolean; maxImages: number; onCreate: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", area: "", landmark: "", location_url: "", rent_amount: "", rent_period: "month", room_type: "Single room", total_rooms: "", available_rooms: "1", available_from: "", facilities: "Water, electricity", description: "", contact_name: "", landlord_contact: "" });
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!user) { setError("Sign in with the authorized admin account."); return; }
    if (photos.length < 1 || photos.length > maxImages) {
      setError(`Select between 1 and ${maxImages} hostel photos received from the landlord.`);
      return;
    }
    if (photos.some((photo) => photo.size > 5 * 1024 * 1024)) {
      setError("Each photo must be 5 MB or smaller.");
      return;
    }
    try {
      const images = await Promise.all(photos.map(async (photo) => ({
        base64: await fileToBase64(photo),
        mimeType: photo.type,
        name: photo.name,
      })));
      await onCreate({
        ...form,
        rent_amount: Number(form.rent_amount),
        total_rooms: form.total_rooms ? Number(form.total_rooms) : null,
        available_rooms: Number(form.available_rooms),
        facilities: form.facilities.split(",").map((v) => v.trim()).filter(Boolean),
        images,
      });
      setForm({ name: "", area: "", landmark: "", location_url: "", rent_amount: "", rent_period: "month", room_type: "Single room", total_rooms: "", available_rooms: "1", available_from: "", facilities: "Water, electricity", description: "", contact_name: "", landlord_contact: "" });
      setPhotos([]);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not publish this hostel."); }
  }
  return <form className="cc-hostel__form cc-hostel__admin-create" onSubmit={submit}>
    <div className="cc-hostel__form-heading"><div><span className="cc-hostel__eyebrow">ADMIN ONLY · WHATSAPP INTAKE</span><h3>Add hostel received from landlord on WhatsApp</h3><p>Copy the landlord's details from WhatsApp, verify permission and publish the listing here.</p></div><Building2 size={28}/></div>
    <div className="cc-hostel__form-grid">
      <label>Hostel name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Landlord / caretaker name<input required value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></label>
      <label>Area / location<input required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label>
      <label>Nearby landmark<input value={form.landmark} onChange={e=>setForm({...form,landmark:e.target.value})}/></label>
      <label>Google Maps link<input type="url" value={form.location_url} onChange={e=>setForm({...form,location_url:e.target.value})} placeholder="https://…"/></label>
      <label>Rent (KSh)<input type="number" min="0" required value={form.rent_amount} onChange={e=>setForm({...form,rent_amount:e.target.value})}/></label>
      <label>Rent period<select value={form.rent_period} onChange={e=>setForm({...form,rent_period:e.target.value})}><option value="month">Per month</option><option value="semester">Per semester</option></select></label>
      <label>Room type<input required value={form.room_type} onChange={e=>setForm({...form,room_type:e.target.value})}/></label>
      <label>Total rooms<input type="number" min="0" value={form.total_rooms} onChange={e=>setForm({...form,total_rooms:e.target.value})}/></label>
      <label>Available rooms<input type="number" min="0" required value={form.available_rooms} onChange={e=>setForm({...form,available_rooms:e.target.value})}/></label>
      <label>Available from<input type="date" value={form.available_from} onChange={e=>setForm({...form,available_from:e.target.value})}/></label>
      <label>Landlord WhatsApp / call number<input required type="tel" value={form.landlord_contact} onChange={e=>setForm({...form,landlord_contact:e.target.value})}/></label>
      <label className="cc-hostel__wide">Facilities<input value={form.facilities} onChange={e=>setForm({...form,facilities:e.target.value})}/></label>
      <label className="cc-hostel__wide">Description<textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label className="cc-hostel__wide cc-hostel__photo-field"><span><Camera size={17}/> Hostel photos received from landlord (up to 3)</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setPhotos(Array.from(e.target.files||[]).filter(f=>f.type.startsWith("image/")).slice(0,maxImages))}/><small>{photos.length}/{maxImages} selected · Maximum 5 MB each.</small></label>
    </div>
    <label className="cc-hostel__consent"><input type="checkbox" required/><span>I have confirmed that the landlord authorized publication of these photos and contact number.</span></label>
    {error && <p className="cc-hostel__error" role="alert">{error}</p>}
    <button className="cc-hostel__primary" disabled={busy}>{busy ? "Uploading and publishing…" : "Add and publish hostel"}</button>
  </form>;
}

function HostelGallery({ name, urls }: { name: string; urls: string[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (urls.length === 0) return <div className="cc-hostel__gallery"><div className="cc-hostel__no-image">No photos available</div></div>;
  const thumbs = urls.slice(1);
  return <div className="cc-hostel__gallery">
    <button type="button" className="cc-hostel__gallery-main" onClick={() => setOpenAt(0)} aria-label={`View photos of ${name}`}>
      <img src={urls[0]} alt={`${name} hostel`} loading="lazy"/>
      <span className="cc-hostel__gallery-badge"><ZoomIn size={14}/> {urls.length > 1 ? `${urls.length} photos` : "View photo"}</span>
    </button>
    {thumbs.length > 0 && <div className="cc-hostel__gallery-thumbs">
      {thumbs.map((url, index) => <button type="button" key={url} onClick={() => setOpenAt(index + 1)} aria-label={`View photo ${index + 2} of ${name}`}><img src={url} alt="" loading="lazy"/></button>)}
    </div>}
    {openAt !== null && <ImageLightbox name={name} urls={urls} start={openAt} onClose={() => setOpenAt(null)}/>}
  </div>;
}

function ImageLightbox({ name, urls, start, onClose }: { name: string; urls: string[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const total = urls.length;
  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && total > 1) prev();
      else if (event.key === "ArrowRight" && total > 1) next();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; };
  }, [onClose, prev, next, total]);

  return createPortal(
    <div className="cc-lightbox" role="dialog" aria-modal="true" aria-label={`${name} photos`} onClick={onClose}>
      <button type="button" className="cc-lightbox__close" onClick={onClose} aria-label="Close photo viewer"><X size={22}/></button>
      {total > 1 && <button type="button" className="cc-lightbox__nav is-prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous photo"><ChevronLeft size={26}/></button>}
      <figure className="cc-lightbox__figure" onClick={(e) => e.stopPropagation()}>
        <img src={urls[index]} alt={`${name} hostel photo ${index + 1}`}/>
        <figcaption>{name}{total > 1 ? ` · ${index + 1} / ${total}` : ""}</figcaption>
      </figure>
      {total > 1 && <button type="button" className="cc-lightbox__nav is-next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next photo"><ChevronRight size={26}/></button>}
    </div>,
    document.body,
  );
}

function HostelCard({ listing, adminWhatsApp }: { listing: HostelListing; adminWhatsApp: string }) {
  const message = `Hello ${listing.contact_name || "Landlord"}, I saw ${listing.name} on Chuka Comrades. Is accommodation still available?`;
  const adminMessage = `Hello Chuka Comrades admin, I am interested in ${listing.name} in ${listing.area}. Please help me connect with the landlord.`;
  return <article className="cc-hostel__card">
    <HostelGallery name={listing.name} urls={listing.image_urls.slice(0,3)}/>
    <div className="cc-hostel__card-body"><div className="cc-hostel__title"><h3>{listing.name}</h3>{listing.verified && <span><ShieldCheck size={13}/> Verified</span>}</div>
      <p className="cc-hostel__location"><MapPin size={15}/> {listing.area}{listing.landmark ? ` · Near ${listing.landmark}` : ""}</p>
      <strong className="cc-hostel__rent">{money(listing.rent_amount)} <small>/ {listing.rent_period}</small></strong>
      <p>{listing.room_type} · {listing.available_rooms} room(s) available</p>
      {listing.available_from && <p className="cc-hostel__muted"><CalendarDays size={14}/> Available from {listing.available_from}</p>}
      {listing.description && <p className="cc-hostel__description">{listing.description}</p>}
      {listing.facilities.length > 0 && <p className="cc-hostel__facilities">{listing.facilities.join(" · ")}</p>}
      {listing.location_url && <a className="cc-hostel__map" href={listing.location_url} target="_blank" rel="noreferrer"><MapPin size={14}/> Open map <ExternalLink size={12}/></a>}
      <div className="cc-hostel__contact"><strong>{listing.contact_name || "Landlord contact"}</strong><span>{listing.landlord_contact}</span></div>
      <div className="cc-hostel__card-actions"><a href={waLink(listing.landlord_contact,message)} target="_blank" rel="noreferrer"><MessageCircle size={16}/> WhatsApp landlord</a><a className="is-outline" href={`tel:${digits(listing.landlord_contact)}`}><Phone size={16}/> Call landlord</a></div>
      {adminWhatsApp && <a className="cc-hostel__admin-link" href={waLink(adminWhatsApp,adminMessage)} target="_blank" rel="noreferrer">Need help? Chat with Chuka Comrades admin</a>}
    </div>
  </article>;
}
