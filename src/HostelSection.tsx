import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { BadgeCheck, Building2, CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, MapPin, MessageCircle, Pencil, Phone, RefreshCw, ShieldCheck, Users, X, ZoomIn } from "lucide-react";
import { hostelApi, type HostelAdminData, type HostelListing, type HostelSettings } from "./lib/hostelApi";
import "./HostelSection.css";

const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

/** Official WhatsApp glyph (Simple Icons) in WhatsApp brand green. */
function WhatsAppLogo({ size = 26 }: { size?: number }) {
  return <span className="cc-hostel__wa" aria-hidden="true">
    <svg viewBox="0 0 24 24" width={size} height={size} focusable="false"><path fill="#25D366" d={WA_PATH}/></svg>
  </span>;
}

/** Google Maps app icon (4-colour pin). If you have the official asset from Google's brand resources, you can swap these paths for it. */
function GoogleMapsLogo({ size = 20 }: { size?: number }) {
  return <svg className="cc-hostel__gmaps-logo" viewBox="0 0 92.3 132.3" height={size} width={size * 92.3 / 132.3} aria-hidden="true" focusable="false">
    <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z"/>
    <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z"/>
    <path fill="#4285f4" d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-4.1 8.4-6.3 13.6-6.3"/>
    <path fill="#fbbc04" d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.5-8.3 4.1-11.3l-28 33.3c4.8 10.6 12.8 19.2 21 29.9l34.1-40.5c-3.3 3.9-8.1 6.3-13.5 6.3"/>
    <path fill="#34a853" d="M59.1 109.2c15.4-24.1 33.3-35 33.3-63 0-7.7-1.9-14.9-5.2-21.3L25.6 98c2.6 3.4 5.3 7.3 7.9 11.3 9.3 14.5 6.7 23.1 12.7 23.1s3.4-8.7 12.9-23.2"/>
  </svg>;
}

/** White WhatsApp glyph for use on the green share button. */
function WhatsAppGlyph({ size = 17 }: { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"><path fill="currentColor" d={WA_PATH}/></svg>;
}

/** Website link included in every shared listing. Set VITE_SITE_URL to your live address (e.g. https://chukacomrades.com); falls back to the current page. */
const siteUrl = () => {
  const configured = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SITE_URL;
  return (configured || `${window.location.origin}${window.location.pathname}`).replace(/\/$/, "");
};

const money = (value: number) => `KSh ${Number(value).toLocaleString("en-KE")}`;
const digits = (value: string) => value.replace(/\D/g, "");
const waLink = (phone: string, message: string) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(message)}`;
const shareLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;

const listingShareText = (item: HostelListing) => [
  `*${item.name}* - Chuka Comrades Hostel`,
  `Location: ${item.area}${item.landmark ? `, near ${item.landmark}` : ""}`,
  `Rent: ${money(item.rent_amount)} / ${item.rent_period}`,
  `Room type: ${item.room_type}`,
  `Available rooms: ${item.available_rooms}`,
  item.available_from ? `Available from: ${item.available_from}` : "",
  item.facilities?.length ? `Facilities: ${item.facilities.join(", ")}` : "",
  `Contact: ${item.contact_name ? `${item.contact_name} - ` : ""}${item.landlord_contact}`,
  item.location_url ? `Map: ${item.location_url}` : "",
  "",
  `See more hostels: ${siteUrl()}`,
].filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== "")).join("\n");

/** Shares the listing text AND its photos. Uses the phone's share sheet when it can attach files, otherwise WhatsApp with photo links. */
async function shareListing(item: HostelListing) {
  const text = listingShareText(item);
  const urls = (item.image_urls || []).slice(0, 3);

  if (urls.length && typeof navigator.canShare === "function" && typeof navigator.share === "function") {
    try {
      const files = await Promise.all(urls.map(async (url, i) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Photo download failed");
        const blob = await response.blob();
        const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const safeName = item.name.replace(/[^\w]+/g, "-");
        return new File([blob], `${safeName}-${i + 1}.${ext}`, { type: blob.type || "image/jpeg" });
      }));
      if (navigator.canShare({ files })) {
        await navigator.share({ files, text, title: item.name });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  const withLinks = urls.length ? `${text}\n\nPhotos:\n${urls.join("\n")}` : text;
  window.open(shareLink(withLinks), "_blank", "noopener,noreferrer");
}


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
  const [editingId, setEditingId] = useState<string | null>(null);

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

  async function saveListing(id: string, payload: Record<string, unknown>) {
    if (!user) throw new Error("Sign in with the authorized hostel admin account.");
    setBusy("edit"); setError(""); setNotice("");
    try {
      await hostelApi.updateListing(user, id, payload);
      setNotice("Hostel details updated successfully.");
      setEditingId(null);
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
      <HostelForm mode="create" user={user} busy={busy === "create"} maxImages={settings.maxImagesPerHostel} onSubmit={createListing}/>
      <div className="cc-hostel__admin-heading"><div><span className="cc-hostel__eyebrow">ADMIN ONLY</span><h2>Hostel management desk</h2><p>Add WhatsApp-submitted hostels, publish listings and control availability.</p></div><BadgeCheck size={30}/></div>
      <h3>Published / unavailable listings ({adminData.listings.length})</h3>
      {adminData.listings.map((item) => editingId === item.id
        ? <HostelForm key={item.id} mode="edit" user={user} busy={busy === "edit"} maxImages={settings.maxImagesPerHostel} initial={item} onSubmit={(payload) => saveListing(item.id, payload)} onCancel={() => setEditingId(null)}/>
        : <div className="cc-hostel__manage-row" key={item.id}><span><strong>{item.name}</strong><small>{item.area} · {money(item.rent_amount)} · {item.available_rooms} room(s) available</small></span><span className="cc-hostel__status">{item.status}</span><button onClick={() => { setEditingId(item.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={13}/> Edit</button><button onClick={() => void updateStatus(item, item.status === "published" ? "unavailable" : "published")} disabled={busy === item.id}>{item.status === "published" ? "Mark unavailable" : "Republish"}</button><button onClick={() => void shareListing(item)}>Share to WhatsApp</button></div>)}
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

type FormState = { name: string; area: string; landmark: string; location_url: string; rent_amount: string; rent_period: string; room_type: string; total_rooms: string; available_rooms: string; available_from: string; facilities: string; description: string; contact_name: string; landlord_contact: string };

const emptyForm: FormState = { name: "", area: "", landmark: "", location_url: "", rent_amount: "", rent_period: "month", room_type: "Single room", total_rooms: "", available_rooms: "1", available_from: "", facilities: "Water, electricity", description: "", contact_name: "", landlord_contact: "" };

const formFromListing = (item: HostelListing): FormState => ({
  name: item.name || "", area: item.area || "", landmark: item.landmark || "", location_url: item.location_url || "",
  rent_amount: String(item.rent_amount ?? ""), rent_period: item.rent_period || "month", room_type: item.room_type || "",
  total_rooms: item.total_rooms != null ? String(item.total_rooms) : "", available_rooms: String(item.available_rooms ?? 0),
  available_from: (item.available_from || "").slice(0, 10), facilities: (item.facilities || []).join(", "),
  description: item.description || "", contact_name: item.contact_name || "", landlord_contact: item.landlord_contact || "",
});

/** One form for both adding a hostel and editing an existing one. */
function HostelForm({ mode, user, busy, maxImages, initial, onSubmit, onCancel }: {
  mode: "create" | "edit"; user: User | null; busy: boolean; maxImages: number; initial?: HostelListing;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>; onCancel?: () => void;
}) {
  const editing = mode === "edit";
  const [form, setForm] = useState<FormState>(initial ? formFromListing(initial) : emptyForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const existing = (initial?.image_urls || []).slice(0, 3);
  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!user) { setError("Sign in with the authorized admin account."); return; }
    const needPhotos = !editing || photos.length > 0;
    if (needPhotos && (photos.length < 1 || photos.length > maxImages)) {
      setError(`Select between 1 and ${maxImages} hostel photos.`);
      return;
    }
    if (photos.some((photo) => photo.size > 5 * 1024 * 1024)) {
      setError("Each photo must be 5 MB or smaller.");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        ...form,
        rent_amount: Number(form.rent_amount),
        total_rooms: form.total_rooms ? Number(form.total_rooms) : null,
        available_rooms: Number(form.available_rooms),
        facilities: form.facilities.split(",").map((v) => v.trim()).filter(Boolean),
      };
      if (photos.length) {
        payload.images = await Promise.all(photos.map(async (photo) => ({
          base64: await fileToBase64(photo),
          mimeType: photo.type,
          name: photo.name,
        })));
        if (editing) payload.replace_images = true;
      }
      await onSubmit(payload);
      if (!editing) { setForm(emptyForm); setPhotos([]); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this hostel."); }
  }

  return <form className={`cc-hostel__form ${editing ? "cc-hostel__admin-edit" : "cc-hostel__admin-create"}`} onSubmit={submit}>
    <div className="cc-hostel__form-heading"><div>
      <span className="cc-hostel__eyebrow">{editing ? "ADMIN ONLY · EDIT LISTING" : "ADMIN ONLY · WHATSAPP INTAKE"}</span>
      <h3>{editing ? `Edit ${initial?.name || "hostel"}` : "Add hostel received from landlord on WhatsApp"}</h3>
      <p>{editing ? "Update any detail below. Changes appear on the public directory as soon as you save." : "Copy the landlord's details from WhatsApp, verify permission and publish the listing here."}</p>
    </div>{editing ? <Pencil size={26}/> : <Building2 size={28}/>}</div>
    <div className="cc-hostel__form-grid">
      <label>Hostel name<input required value={form.name} onChange={set("name")}/></label>
      <label>Landlord / caretaker name<input required value={form.contact_name} onChange={set("contact_name")}/></label>
      <label>Area / location<input required value={form.area} onChange={set("area")}/></label>
      <label>Nearby landmark<input value={form.landmark} onChange={set("landmark")}/></label>
      <label>Google Maps link<input type="url" value={form.location_url} onChange={set("location_url")} placeholder="https://…"/></label>
      <label>Rent (KSh)<input type="number" min="0" required value={form.rent_amount} onChange={set("rent_amount")}/></label>
      <label>Rent period<select value={form.rent_period} onChange={set("rent_period")}><option value="month">Per month</option><option value="semester">Per semester</option></select></label>
      <label>Room type<input required value={form.room_type} onChange={set("room_type")}/></label>
      <label>Total rooms<input type="number" min="0" value={form.total_rooms} onChange={set("total_rooms")}/></label>
      <label>Available rooms<input type="number" min="0" required value={form.available_rooms} onChange={set("available_rooms")}/></label>
      <label>Available from<input type="date" value={form.available_from} onChange={set("available_from")}/></label>
      <label>Landlord WhatsApp / call number<input required type="tel" value={form.landlord_contact} onChange={set("landlord_contact")}/></label>
      <label className="cc-hostel__wide">Facilities (comma separated)<input value={form.facilities} onChange={set("facilities")}/></label>
      <label className="cc-hostel__wide">Description<textarea rows={3} value={form.description} onChange={set("description")}/></label>
      <label className="cc-hostel__wide cc-hostel__photo-field">
        <span><Camera size={17}/> {editing ? "Replace photos (optional, up to " : "Hostel photos received from landlord (up to "}{maxImages})</span>
        {editing && existing.length > 0 && <div className="cc-hostel__photo-preview">{existing.map((url) => <img key={url} src={url} alt="Current hostel"/>)}</div>}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/")).slice(0, maxImages))}/>
        <small>{editing ? (photos.length ? `${photos.length} new photo(s) will replace the current ones.` : "Leave empty to keep the current photos.") : `${photos.length}/${maxImages} selected`} · Maximum 5 MB each.</small>
      </label>
    </div>
    {!editing && <label className="cc-hostel__consent"><input type="checkbox" required/><span>I have confirmed that the landlord authorized publication of these photos and contact number.</span></label>}
    {error && <p className="cc-hostel__error" role="alert">{error}</p>}
    <div className="cc-hostel__form-actions">
      <button className="cc-hostel__primary" disabled={busy}>{busy ? (editing ? "Saving…" : "Uploading and publishing…") : (editing ? "Save changes" : "Add and publish hostel")}</button>
      {editing && onCancel && <button type="button" className="cc-hostel__cancel" onClick={onCancel} disabled={busy}>Cancel</button>}
    </div>
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
  const [sharing, setSharing] = useState(false);
  async function share() { setSharing(true); try { await shareListing(listing); } finally { setSharing(false); } }
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
      {listing.location_url && <a className="cc-hostel__map" href={listing.location_url} target="_blank" rel="noreferrer" aria-label={`Open ${listing.name} in Google Maps`}><GoogleMapsLogo size={22}/><span>Open in Google Maps</span><ExternalLink size={12}/></a>}
      <div className="cc-hostel__contact"><strong>{listing.contact_name || "Landlord contact"}</strong><span>{listing.landlord_contact}</span></div>
      <div className="cc-hostel__card-actions"><a href={waLink(listing.landlord_contact,message)} target="_blank" rel="noreferrer"><MessageCircle size={16}/> WhatsApp landlord</a><a className="is-outline" href={`tel:${digits(listing.landlord_contact)}`}><Phone size={16}/> Call landlord</a></div>
      <button type="button" className="cc-hostel__share" onClick={() => void share()} disabled={sharing}><WhatsAppGlyph size={17}/> {sharing ? "Preparing photos…" : "Share this hostel on WhatsApp"}</button>
      {adminWhatsApp && <a className="cc-hostel__admin-link" href={waLink(adminWhatsApp,adminMessage)} target="_blank" rel="noreferrer">Need help? Chat with Chuka Comrades admin</a>}
    </div>
  </article>;
}
