import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { BadgeCheck, Building2, CalendarDays, Camera, CheckCircle2, ChevronRight, ExternalLink, MapPin, MessageCircle, Pencil, Phone, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { hostelApi, type HostelAdminData, type HostelListing, type HostelSettings } from "./lib/hostelApi";
import "./HostelSection.css";

const money = (value: number) => `KSh ${Number(value).toLocaleString("en-KE")}`;
const digits = (value: string) => value.replace(/\D/g, "");
const waLink = (phone: string, message: string) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(message)}`;
const shareLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;
const HOSTEL_ADMIN_EMAIL = "sidneywafula30@gmail.com";

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
  const [adminError, setAdminError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
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
    const isConfiguredAdmin = user?.email?.trim().toLowerCase() === HOSTEL_ADMIN_EMAIL;
    if (!user || !isConfiguredAdmin) {
      setIsAdmin(false); setAdminData(null); setAdminError(""); return;
    }
    // The client-side email check only reveals the admin interface. Apps Script still
    // verifies the Firebase ID token and its own admin allowlist before any data change.
    setIsAdmin(true);
    try {
      const result = await hostelApi.adminDashboard(user);
      setAdminData(result);
      setAdminError("");
    } catch (err) {
      setAdminData({ listings: [] });
      setAdminError(err instanceof Error ? err.message : "The admin dashboard could not be loaded.");
    }
  }, [user]);

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
      await refresh(); setNotice(status === "unavailable" ? `${listing.name} was removed from the public directory. It can be restored later.` : `${listing.name} was republished.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Listing update failed."); }
    finally { setBusy(""); }
  }

  async function saveListingEdit(listing: HostelListing, updates: Record<string, unknown>) {
    if (!user) return;
    setBusy(`edit-${listing.id}`); setError(""); setNotice("");
    try {
      await hostelApi.updateListing(user, listing.id, updates);
      setEditingId(null);
      await refresh();
      setNotice(`${listing.name} details updated successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this hostel.");
    } finally { setBusy(""); }
  }

  return <section className="cc-hostel" aria-label="Hostel directory">
    <header className="cc-hostel__hero">
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
        <Users size={21}/><span><strong>Students: Hostels & Reviews</strong><small>Find accommodation, ask questions and share hostel experiences.</small></span><ExternalLink size={16}/>
      </a>
      <a href={settings.landlordGroup || undefined} target="_blank" rel="noreferrer" className={!settings.landlordGroup ? "is-disabled" : ""} onClick={(event) => { if (!settings.landlordGroup) event.preventDefault(); }}>
        <Building2 size={21}/><span><strong>Landlords' Group</strong><small>Contact admin to submit hostel details and photos.</small></span><ExternalLink size={16}/>
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
      <div className="cc-hostel__admin-heading"><div><span className="cc-hostel__eyebrow">ADMIN ONLY · {HOSTEL_ADMIN_EMAIL}</span><h2>Hostel management desk</h2><p>Add WhatsApp-submitted hostels, edit details, publish listings and remove listings from the public directory.</p></div><BadgeCheck size={30}/></div>
      {adminError && <p className="cc-hostel__error" role="alert">Admin access check failed: {adminError} The admin controls are shown because this is the configured admin email, but the server must approve each save or update.</p>}
      <AdminCreateHostelForm user={user} busy={busy === "create"} maxImages={settings.maxImagesPerHostel} onCreate={createListing}/>
      <h3>Published / unavailable listings ({adminData.listings.length})</h3>
      {adminData.listings.length === 0 && <p className="cc-hostel__empty">No listings were returned. If you already have hostels in the Sheet, use Refresh and check the admin access message above.</p>}
      {adminData.listings.map((item) => <div key={item.id}>
        <div className="cc-hostel__manage-row"><span><strong>{item.name}</strong><small>{item.area} · {money(item.rent_amount)}</small></span><span className="cc-hostel__status">{item.status}</span><button onClick={() => setEditingId(editingId === item.id ? null : item.id)} disabled={busy === `edit-${item.id}`}><Pencil size={14}/> {editingId === item.id ? "Close edit" : "Edit details"}</button><button onClick={() => void updateStatus(item, item.status === "published" ? "unavailable" : "published")} disabled={busy === item.id}>{item.status === "published" ? "Remove from directory" : "Restore listing"}</button><a href={shareLink(`Chuka Comrades Hostel Listing\n${item.name}\nLocation: ${item.area}${item.landmark ? `, near ${item.landmark}` : ""}\nRent: ${money(item.rent_amount)} / ${item.rent_period}\nRoom type: ${item.room_type}\nAvailable: ${item.available_rooms}\nContact: ${item.landlord_contact}\nBrowse on Chuka Comrades.`)} target="_blank" rel="noreferrer">Share to WhatsApp</a></div>
        {editingId === item.id && <AdminEditHostelForm listing={item} busy={busy === `edit-${item.id}`} onSave={(updates) => saveListingEdit(item, updates)}/>}
      </div>)}
      <p className="cc-hostel__fineprint">“Remove from directory” marks a listing unavailable; it does not permanently erase the Google Sheets record. You can restore it later.</p>
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

function AdminEditHostelForm({ listing, busy, onSave }: {
  listing: HostelListing; busy: boolean; onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: listing.name, area: listing.area, landmark: listing.landmark || "", location_url: listing.location_url || "",
    rent_amount: String(listing.rent_amount), rent_period: listing.rent_period, room_type: listing.room_type,
    total_rooms: listing.total_rooms == null ? "" : String(listing.total_rooms), available_rooms: String(listing.available_rooms),
    available_from: listing.available_from || "", facilities: listing.facilities.join(", "), description: listing.description || "",
    contact_name: listing.contact_name || "", landlord_contact: listing.landlord_contact,
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      ...form, rent_amount: Number(form.rent_amount), total_rooms: form.total_rooms ? Number(form.total_rooms) : null,
      available_rooms: Number(form.available_rooms), facilities: form.facilities.split(",").map((v) => v.trim()).filter(Boolean),
    });
  }
  return <form className="cc-hostel__form cc-hostel__admin-create" onSubmit={submit}>
    <div className="cc-hostel__form-heading"><div><h3>Edit {listing.name}</h3><p>Update the listing details. Existing hostel photos are kept unchanged.</p></div></div>
    <div className="cc-hostel__form-grid">
      <label>Hostel name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Landlord / caretaker name<input required value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></label>
      <label>Area / location<input required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label>
      <label>Nearby landmark<input value={form.landmark} onChange={e=>setForm({...form,landmark:e.target.value})}/></label>
      <label>Google Maps link<input type="url" value={form.location_url} onChange={e=>setForm({...form,location_url:e.target.value})}/></label>
      <label>Rent (KSh)<input type="number" min="0" required value={form.rent_amount} onChange={e=>setForm({...form,rent_amount:e.target.value})}/></label>
      <label>Rent period<select value={form.rent_period} onChange={e=>setForm({...form,rent_period:e.target.value as "month" | "semester"})}><option value="month">Per month</option><option value="semester">Per semester</option></select></label>
      <label>Room type<input required value={form.room_type} onChange={e=>setForm({...form,room_type:e.target.value})}/></label>
      <label>Total rooms<input type="number" min="0" value={form.total_rooms} onChange={e=>setForm({...form,total_rooms:e.target.value})}/></label>
      <label>Available rooms<input type="number" min="0" required value={form.available_rooms} onChange={e=>setForm({...form,available_rooms:e.target.value})}/></label>
      <label>Available from<input type="date" value={form.available_from} onChange={e=>setForm({...form,available_from:e.target.value})}/></label>
      <label>Landlord WhatsApp / call number<input required type="tel" value={form.landlord_contact} onChange={e=>setForm({...form,landlord_contact:e.target.value})}/></label>
      <label className="cc-hostel__wide">Facilities<input value={form.facilities} onChange={e=>setForm({...form,facilities:e.target.value})}/></label>
      <label className="cc-hostel__wide">Description<textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    </div>
    <button className="cc-hostel__primary" disabled={busy}>{busy ? "Saving changes…" : "Save hostel changes"}</button>
  </form>;
}

function HostelCard({ listing, adminWhatsApp }: { listing: HostelListing; adminWhatsApp: string }) {
  const message = `Hello ${listing.contact_name || "Landlord"}, I saw ${listing.name} on Chuka Comrades. Is accommodation still available?`;
  const adminMessage = `Hello Chuka Comrades admin, I am interested in ${listing.name} in ${listing.area}. Please help me connect with the landlord.`;
  return <article className="cc-hostel__card">
    <div className="cc-hostel__images">{listing.image_urls.slice(0,3).map((url) => <img key={url} src={url} alt={`${listing.name} hostel`} loading="lazy"/>)}{listing.image_urls.length === 0 && <div className="cc-hostel__no-image">No photos available</div>}</div>
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
