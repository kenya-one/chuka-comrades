import React, { useMemo, useState } from "react";
import type { Hostel, RoommatePost, RoommateRequestInput, HostelUpdate } from "./types";

type Props = {
  adminWhatsApp: string;
  hostels: Hostel[];
  roommatePosts: RoommatePost[];
  onSubmitRoommateRequest: (request: RoommateRequestInput) => Promise<void> | void;
  /** Connect this to a secure admin endpoint; do not write with a service key in the browser. */
  onAdminUpdateHostel?: (hostelId: string, update: HostelUpdate) => Promise<void> | void;
  isAdmin?: boolean;
};

const money = (value: number) => `KSh ${Number(value).toLocaleString("en-KE")}`;
const waLink = (phone: string, message: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

export function HostelRoommateSection({
  adminWhatsApp, hostels, roommatePosts, onSubmitRoommateRequest,
  onAdminUpdateHostel, isAdmin = false,
}: Props) {
  const [tab, setTab] = useState<"hostels" | "roommates">("hostels");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "seeking_roommate" | "has_room">("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    display_name: "", course: "", study_year: "", gender: "", area: "",
    budget_min: "2000", budget_max: "4000", move_in_date: "",
    accommodation_type: "Shared room", listing_type: "seeking_roommate" as RoommateRequestInput["listing_type"],
    roommates_needed: "1", lifestyle: "", message: "", private_contact: "",
  });

  const visibleHostels = useMemo(() => hostels.filter(h =>
    h.status === "published" &&
    `${h.name} ${h.area} ${h.landmark ?? ""}`.toLowerCase().includes(query.toLowerCase())
  ), [hostels, query]);

  const visibleRoommates = useMemo(() => roommatePosts.filter(p =>
    p.status === "published" &&
    (kind === "all" || p.listing_type === kind) &&
    `${p.display_name} ${p.area} ${p.course ?? ""}`.toLowerCase().includes(query.toLowerCase())
  ), [roommatePosts, kind, query]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setNotice("");
    try {
      await onSubmitRoommateRequest({
        ...form,
        budget_min: Number(form.budget_min),
        budget_max: Number(form.budget_max),
        roommates_needed: Number(form.roommates_needed),
      });
      setNotice("Request sent to admin for review. Your contact details will remain private.");
      setShowForm(false);
      setForm({ ...form, display_name: "", private_contact: "", message: "" });
    } catch {
      setNotice("Could not submit the request. Please try again or contact admin on WhatsApp.");
    } finally { setSaving(false); }
  }

  const adminMessage = "Hello Chuka Comrades Admin. I would like help with hostel/roommate services.";
  return (
    <section className="cc-hr" aria-label="Hostel and roommate services">
      <header className="cc-hr__hero">
        <p className="cc-hr__eyebrow">CHUKA COMRADES SERVICES</p>
        <h2>Find a place. Find a roommate.</h2>
        <p>Browse verified hostel information or ask admin to help you connect with a roommate.</p>
        <a className="cc-hr__button cc-hr__button--light"
          href={adminWhatsApp ? waLink(adminWhatsApp, adminMessage) : undefined}
          target="_blank" rel="noreferrer" aria-disabled={!adminWhatsApp}>
          Chat with admin on WhatsApp
        </a>
      </header>

      <nav className="cc-hr__tabs" aria-label="Service category">
        <button className={tab === "hostels" ? "is-active" : ""} onClick={() => {setTab("hostels"); setQuery("");}}>Hostels</button>
        <button className={tab === "roommates" ? "is-active" : ""} onClick={() => {setTab("roommates"); setQuery("");}}>Roommate finder</button>
      </nav>

      <div className="cc-hr__toolbar">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or location…" aria-label="Search listings" />
        {tab === "roommates" && <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} aria-label="Roommate listing type">
          <option value="all">All roommate requests</option>
          <option value="seeking_roommate">Looking for a roommate</option>
          <option value="has_room">Room available, need roommate</option>
        </select>}
      </div>

      {tab === "hostels" ? (
        <div className="cc-hr__grid">
          {visibleHostels.map(h => <article className="cc-hr__card" key={h.id}>
            {h.image_urls[0] ? <img className="cc-hr__photo" src={h.image_urls[0]} alt={`${h.name} hostel`} /> : <div className="cc-hr__photo cc-hr__photo--empty">No photo yet</div>}
            <div className="cc-hr__cardbody">
              <div className="cc-hr__titleline"><h3>{h.name}</h3>{h.verified && <span className="cc-hr__tag">Verified</span>}</div>
              <p className="cc-hr__muted">{h.area}{h.landmark ? ` · Near ${h.landmark}` : ""}</p>
              <p className="cc-hr__price">{money(h.rent_amount)} <small>/ {h.rent_period}</small></p>
              <p>{h.room_type} · <strong>{h.available_rooms}</strong> rooms available</p>
              {h.facilities.length > 0 && <p className="cc-hr__muted">{h.facilities.join(" · ")}</p>}
              {h.available_from && <p className="cc-hr__muted">Available from {h.available_from}</p>}
              {h.location_url && <a href={h.location_url} target="_blank" rel="noreferrer">View location</a>}
              <a className="cc-hr__button" href={adminWhatsApp ? waLink(adminWhatsApp, `Hello admin, I am interested in ${h.name} in ${h.area}. Please help me enquire about room availability.`) : undefined} target="_blank" rel="noreferrer">Enquire on WhatsApp</a>
              {isAdmin && onAdminUpdateHostel && <AdminHostelEditor hostel={h} onSave={onAdminUpdateHostel} />}
            </div>
          </article>)}
          {visibleHostels.length === 0 && <p className="cc-hr__empty">No published hostels match your search yet.</p>}
        </div>
      ) : (
        <>
          <div className="cc-hr__intro">
            <div><h3>Connect through admin</h3><p>Phone numbers are kept private. Admin reviews requests and helps interested students connect.</p></div>
            <button className="cc-hr__button" onClick={() => setShowForm(v => !v)}>Post a roommate request</button>
          </div>
          {showForm && <form className="cc-hr__form" onSubmit={submit}>
            <h3>Roommate request</h3>
            <div className="cc-hr__formgrid">
              <label>Display name<input required value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})}/></label>
              <label>Course<input value={form.course} onChange={e=>setForm({...form,course:e.target.value})}/></label>
              <label>Year of study<input value={form.study_year} onChange={e=>setForm({...form,study_year:e.target.value})}/></label>
              <label>Gender (optional)<select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select></label>
              <label>Preferred location<input required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label>
              <label>Accommodation type<select value={form.accommodation_type} onChange={e=>setForm({...form,accommodation_type:e.target.value})}><option>Shared room</option><option>Bedsitter</option><option>One-bedroom</option><option>Apartment</option><option>Other</option></select></label>
              <label>Minimum budget (KSh/month)<input type="number" min="0" required value={form.budget_min} onChange={e=>setForm({...form,budget_min:e.target.value})}/></label>
              <label>Maximum budget (KSh/month)<input type="number" min="0" required value={form.budget_max} onChange={e=>setForm({...form,budget_max:e.target.value})}/></label>
              <label>Move-in date<input type="date" value={form.move_in_date} onChange={e=>setForm({...form,move_in_date:e.target.value})}/></label>
              <label>Listing type<select value={form.listing_type} onChange={e=>setForm({...form,listing_type:e.target.value as RoommateRequestInput["listing_type"]})}><option value="seeking_roommate">I am looking for a roommate</option><option value="has_room">I have a room and need a roommate</option></select></label>
              <label>Number of roommates needed<input type="number" min="1" value={form.roommates_needed} onChange={e=>setForm({...form,roommates_needed:e.target.value})}/></label>
              <label>Contact WhatsApp (private)<input required value={form.private_contact} onChange={e=>setForm({...form,private_contact:e.target.value})} placeholder="07… or 254…"/></label>
              <label className="cc-hr__wide">Lifestyle/preferences<textarea value={form.lifestyle} onChange={e=>setForm({...form,lifestyle:e.target.value})} placeholder="Quiet, tidy, study-focused…"/></label>
              <label className="cc-hr__wide">Additional message<textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></label>
            </div>
            <p className="cc-hr__muted">Your phone number is sent for admin review and is not shown on the public listing.</p>
            <button className="cc-hr__button" disabled={saving}>{saving ? "Submitting…" : "Submit for admin review"}</button>
          </form>}
          {notice && <p className="cc-hr__notice" role="status">{notice}</p>}
          <div className="cc-hr__grid">
            {visibleRoommates.map(p => <article className="cc-hr__card cc-hr__card--text" key={p.id}>
              <div className="cc-hr__cardbody">
                <span className="cc-hr__tag">{p.listing_type === "has_room" ? "Room available" : "Looking for roommate"}</span>
                <h3>{p.display_name}</h3>
                <p className="cc-hr__muted">{[p.course,p.study_year,p.area].filter(Boolean).join(" · ")}</p>
                <p className="cc-hr__price">{money(p.budget_min)}–{money(p.budget_max)} <small>/ month</small></p>
                <p>{p.accommodation_type} · {p.roommates_needed} roommate(s) needed</p>
                {p.move_in_date && <p className="cc-hr__muted">Move-in: {p.move_in_date}</p>}
                {p.lifestyle && <p>{p.lifestyle}</p>}
                {p.message && <p>{p.message}</p>}
                <a className="cc-hr__button" href={adminWhatsApp ? waLink(adminWhatsApp, `Hello admin, please connect me with ${p.display_name}'s roommate listing (${p.area}).`) : undefined} target="_blank" rel="noreferrer">Ask admin to connect us</a>
              </div>
            </article>)}
            {visibleRoommates.length === 0 && <p className="cc-hr__empty">No published roommate requests yet. You can submit one for admin review.</p>}
          </div>
        </>
      )}
    </section>
  );
}

function AdminHostelEditor({ hostel, onSave }: {
  hostel: Hostel;
  onSave: (id: string, update: HostelUpdate) => Promise<void> | void;
}) {
  const [rent, setRent] = useState(String(hostel.rent_amount));
  const [available, setAvailable] = useState(String(hostel.available_rooms));
  const [status, setStatus] = useState(hostel.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    try {
      await onSave(hostel.id, { rent_amount: Number(rent), available_rooms: Number(available), status });
      setMessage("Update saved.");
    } catch { setMessage("Update failed."); }
    finally { setBusy(false); }
  }
  return <div className="cc-hr__admin">
    <strong>Admin: update listing</strong>
    <label>Rent (KSh)<input type="number" min="0" value={rent} onChange={e=>setRent(e.target.value)}/></label>
    <label>Available rooms<input type="number" min="0" value={available} onChange={e=>setAvailable(e.target.value)}/></label>
    <label>Listing status<select value={status} onChange={e=>setStatus(e.target.value as Hostel["status"])}><option value="published">Published</option><option value="unavailable">Unavailable</option><option value="draft">Draft</option></select></label>
    <button className="cc-hr__button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
    {message && <small role="status">{message}</small>}
  </div>;
}
