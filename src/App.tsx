import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  ArrowUpRight,
  BookOpen,
  BellRing,
  ClipboardList,
  ChevronRight,
  House,
  Landmark,
  FileText,
  GraduationCap,
  BriefcaseBusiness,
  Wallet,
  Download,
  Printer,
  Banknote,
  MessageCircle,
  ShoppingBag,
  Trophy,
  Users,
  Clock3,
  RefreshCw,
  MapPin,
  Copy,
  Gamepad2,
  Target,
  ShieldAlert,
  ScrollText,
  Camera,
  Layers,
  PackageSearch,
  Globe,
  Sparkles,
} from "lucide-react";
import { auth, googleProvider } from "./lib/firebase";
import { supabase } from "./lib/supabase";
import StudyLabs from "./StudyLabs";
import CampusUpdates from "./CampusUpdates";
import { campusApi } from "./lib/campusApi";
import { loadDirectFeed, imageCandidates, resolveImage } from "./lib/landingFeed";
import Efootball from "./Efootball";
import Pool from "./Pool";
import { PoolLogo } from "./games/logos";
import OZone from "./OZone";
import HostelSection from "./HostelSection";
import ChukaSoko from "./ChukaSoko";
import Cpl from "./Cpl";
import "./App.css";
import InstallAppButton from "./InstallAppButton";

const ADMIN_WHATSAPP = "254180752220";
const waHref = (message: string) => `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
const fill = (intro: string, fields: string[]) => `Hello Chuka Comrades admin, ${intro}\n\n${fields.map((f) => `${f}: `).join("\n")}`;

type ServiceCard = {
  title: string;
  description: string;
  icon: typeof Landmark;
  label: string;
  mode: "link" | "whatsapp";
  url?: string;
  action: string;
  waMessage?: string;
};

// Opened directly: the student does these themselves on the official site.
const linkServices: ServiceCard[] = [
  { title: "Student Portal — Direct Login", description: "Sign in with your registration number and password to access your student account and available academic services.", icon: GraduationCap, label: "Student account", mode: "link", url: "https://portal.chuka.ac.ke/", action: "Open student login" },
  { title: "E-Learning / Moodle", description: "Open the university e-learning system to access online course materials and learning activities.", icon: BookOpen, label: "Online classes", mode: "link", url: "https://dos.chuka.ac.ke/", action: "Open e-learning" },
  { title: "University Library", description: "Find library services, digital resources, e-books, e-journals and research support.", icon: BookOpen, label: "Library & research", mode: "link", url: "https://library.chuka.ac.ke/", action: "Open library" },
  { title: "Current Student Resources", description: "Find student forms, handbooks, clearance links, portal guidance and other official student resources.", icon: ClipboardList, label: "Forms & resources", mode: "link", url: "https://www.chuka.ac.ke/current-students/", action: "View student resources" },
  { title: "Student Welfare & Dean of Students", description: "Access student welfare information, support services, campus life updates and student assistance contacts.", icon: Users, label: "Student support", mode: "link", url: "https://studentswelfare.chuka.ac.ke/", action: "Open student welfare" },
  { title: "Student Support & Counselling", description: "Visit the student support website for welfare information and available counselling support.", icon: MessageCircle, label: "Wellbeing support", mode: "link", url: "https://students.chuka.ac.ke/", action: "Get student support" },
  { title: "University Announcements", description: "Visit the official university website for notices, academic updates, events and announcements.", icon: BellRing, label: "Official updates", mode: "link", url: "https://www.chuka.ac.ke/", action: "Visit university website" },
  { title: "Chuka / Tharaka-Nithi County", description: "Find county government information, announcements and service updates.", icon: Landmark, label: "County information", mode: "link", url: "https://tharakanithi.go.ke/", action: "Open county website" },
];

// Handled entirely in WhatsApp with the admin: the button opens a pre-filled message.
const applicationServices: ServiceCard[] = [
  { title: "eCitizen Applications", description: "Help with national government applications such as ID, passport, birth certificate and good conduct.", icon: Landmark, label: "National services", mode: "whatsapp", action: "Apply on WhatsApp",
    waMessage: fill("I need help with an eCitizen application.", ["Service (ID / passport / birth certificate / good conduct / other)", "Full name", "ID number"]) },
  { title: "KRA iTax", description: "PIN registration, PIN retrieval and filing of tax returns.", icon: Wallet, label: "Tax services", mode: "whatsapp", action: "Apply on WhatsApp",
    waMessage: fill("I need help with KRA iTax.", ["Service (PIN registration / PIN retrieval / file returns)", "Full name", "ID number"]) },
  { title: "HELB", description: "New loan application, subsequent loan application and appeals.", icon: GraduationCap, label: "Student financing", mode: "whatsapp", action: "Apply on WhatsApp",
    waMessage: fill("I need help with HELB.", ["Service (new loan / subsequent loan / appeal)", "Full name", "Registration number"]) },
  { title: "NSSF", description: "Member registration, statements and updates.", icon: BriefcaseBusiness, label: "Social security", mode: "whatsapp", action: "Apply on WhatsApp",
    waMessage: fill("I need help with NSSF.", ["Service (registration / statement / update)", "Full name", "ID number"]) },
  { title: "Huduma Kenya", description: "Guidance on public services and Huduma service centres.", icon: FileText, label: "Public service help", mode: "whatsapp", action: "Ask on WhatsApp",
    waMessage: fill("I need help with a Huduma Kenya service.", ["Service needed", "Full name"]) },
];

// Print-out help: everything here is ordered through the admin on WhatsApp.
const printServices: ServiceCard[] = [
  { title: "Request a Letter", description: "Introduction, recommendation, attachment, bank, visa or any other official letter. Tell us who it is addressed to.", icon: ScrollText, label: "Letters", mode: "whatsapp", action: "Request on WhatsApp",
    waMessage: fill("I would like to request a letter.", ["Type of letter (introduction / recommendation / attachment / bank / other)", "Full name", "Registration number", "Addressed to", "Needed by (date)"]) },
  { title: "Printing", description: "Send your file in the chat and we print it in colour or black & white, ready for pick-up or delivery.", icon: Printer, label: "Cyber & printing", mode: "whatsapp", action: "Order on WhatsApp",
    waMessage: fill("I need printing done.", ["Number of pages", "Colour or black & white", "Single or double sided", "Pick-up or delivery"]) },
  { title: "Photocopying & Scanning", description: "Photocopies of IDs, certificates and notes, plus scanning to PDF sent straight to your WhatsApp or email.", icon: Copy, label: "Copies & scans", mode: "whatsapp", action: "Order on WhatsApp",
    waMessage: fill("I need photocopying / scanning.", ["Service (photocopy / scan)", "Number of pages", "Pick-up or delivery"]) },
  { title: "Typing, Binding & Lamination", description: "Typing of assignments and CVs, spiral binding, hard binding and lamination for projects and documents.", icon: Layers, label: "Finishing", mode: "whatsapp", action: "Order on WhatsApp",
    waMessage: fill("I need typing / binding / lamination.", ["Service (typing / spiral binding / hard binding / lamination / CV)", "Number of pages or copies", "Needed by (date)"]) },
  { title: "Passport Photos", description: "Passport-size photos for applications, IDs and forms. Tell us how many you need.", icon: Camera, label: "Photos", mode: "whatsapp", action: "Order on WhatsApp",
    waMessage: fill("I need passport photos.", ["Number of photos", "Needed by (date)", "Pick-up or delivery"]) },
  { title: "Fee Transfer", description: "Get help paying university fees and other fees. Share the details in the chat.", icon: Banknote, label: "Payments", mode: "whatsapp", action: "Request on WhatsApp",
    waMessage: fill("I need help with a fee transfer.", ["Type (university fees / other)", "Registration number", "Amount (KSh)", "Payment code or reference"]) },
  { title: "Lost & Found", description: "Lost something on campus or found something that is not yours? Report it and we help it find its owner.", icon: PackageSearch, label: "Campus help", mode: "whatsapp", action: "Report on WhatsApp",
    waMessage: fill("I want to report a lost / found item.", ["Lost or found", "Item (ID, phone, keys, bag, other)", "Where and when", "Short description"]) },
  { title: "Anything Else", description: "Need something that is not listed? Message the admin and describe what you need.", icon: Sparkles, label: "Other requests", mode: "whatsapp", action: "Ask on WhatsApp",
    waMessage: fill("I need help with a request that is not listed.", ["What you need", "Full name", "Needed by (date)"]) },
];

type ServiceGroup = { id: string; step: string; kicker: string; title: string; blurb: string; note?: string; icon: typeof Landmark; tone: "links" | "apply" | "print"; items: ServiceCard[] };
const serviceGroups: ServiceGroup[] = [
  { id: "svc-links", step: "01", kicker: "OPEN ONLINE", title: "Important links", blurb: "Official university and county websites, one tap away.", icon: Globe, tone: "links", items: linkServices },
  { id: "svc-apply", step: "02", kicker: "WE HELP YOU APPLY", title: "Help with online applications & services", blurb: "We guide you through government and student-finance applications on WhatsApp.", note: "Never send your passwords, PINs or OTP codes in chat. The admin will never ask for them.", icon: Landmark, tone: "apply", items: applicationServices },
  { id: "svc-print", step: "03", kicker: "ORDER VIA WHATSAPP", title: "Print-out help", blurb: "Letters, printing, photocopying, fee transfer, lost & found and more, all handled by the admin on WhatsApp.", icon: Printer, tone: "print", items: printServices },
];

type LandingFeedItem = {
  id: string;
  section: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price: string | null;
  location: string | null;
  link_url: string | null;
  created_at: string;
};

const feedSections = [
  { key: "campus_updates", openLabel: "Open Campus Updates", title: "Campus Updates", subtitle: "Official announcements, events & opportunities", icon: BellRing },
  { key: "marketplace", openLabel: "Open Chuka Soko", title: "Chuka Soko", subtitle: "Latest student listings", icon: ShoppingBag },
  { key: "hostels", openLabel: "Open Hostels & Roommates", title: "Hostels & Roommates", subtitle: "New accommodation posts", icon: House },
  { key: "sports", openLabel: "See sports updates", title: "Chuka Premier League", subtitle: "Latest football updates", icon: Trophy },
  { key: "efootball", openLabel: "Open Chuka Efootball", title: "Chuka Efootball", subtitle: "Tournaments & accounts for sale", icon: Gamepad2 },
  { key: "pool", openLabel: "Open Chuka Pool", title: "Chuka Pool", subtitle: "Tournaments & pool points", icon: Target },
  { key: "discussions", openLabel: "Open Chuka O Zone", title: "Chuka O Zone", subtitle: "Fresh community conversations", icon: MessageCircle },
  { key: "digital_products", openLabel: "Open Project Hub", title: "Digital Products", subtitle: "Recently added downloads", icon: Download },
  { key: "opportunities", openLabel: "See opportunities", title: "Opportunities", subtitle: "Jobs, attachments & scholarships", icon: BriefcaseBusiness },
];

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const SYNC_URL = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/landing-feed-sync` : "";
/** Asks the server to refresh landing_feed from Soko, Hostels, O Zone and Study Labs. It is throttled server-side (every 5 minutes). */
async function syncLandingFeed(): Promise<boolean> {
  if (!SYNC_URL) return false;
  try {
    const res = await fetch(SYNC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.synced === true;
  } catch { return false; }
}

const updateSection: Record<string, string> = { opportunities: "opportunities", sports: "sports" };
// The separate Events card was removed: event posts and old "events" rows show under Campus Updates.
const normalizeSection = (section: string) => (section === "events" ? "campus_updates" : section);

/** Feed thumbnail: tries alternate Google Drive addresses, and disappears cleanly if none load. */
function FeedImg({ src }: { src: string }) {
  const list = useMemo(() => imageCandidates(src), [src]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [src]);
  if (i >= list.length) return null;
  return <img src={list[i]} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setI((n) => n + 1)} />;
}

function LiveCampusFeed({ onOpenSection }: { onOpenSection: (sectionKey: string) => void }) {
  const [items, setItems] = useState<LandingFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadFeed = useCallback(async () => {
    const client = supabase;
    // Real Campus Updates posts (published by the admin) and the moderated landing_feed table.
    const [updatesResult, feedResult, directResult] = await Promise.allSettled([
      campusApi<{ updates: Array<{ id: string; title: string; body: string; category?: string; published_at: string | null; created_at: string; media?: Array<{ kind: string; url: string | null }> }> }>(null, "updates_list"),
      client
        ? client.from("landing_feed").select("id, section, title, description, image_url, price, location, link_url, created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(70)
        : Promise.resolve({ data: [], error: null }),
      // Read Soko, Hostels, O Zone, Study Labs and CPL directly so every card fills in.
      loadDirectFeed(),
    ]);

    const merged: LandingFeedItem[] = [];
    let updatesOk = false;
    let feedOk = false;
    if (updatesResult.status === "fulfilled") {
      updatesOk = true;
      for (const u of updatesResult.value.updates || []) {
        const image = (u.media || []).find((m) => m.kind === "image" && m.url);
        merged.push({
          id: `update-${u.id}`,
          section: updateSection[u.category || ""] || "campus_updates",
          title: u.title,
          description: u.body.length > 160 ? `${u.body.slice(0, 160).trim()}…` : u.body,
          image_url: resolveImage(image?.url),
          price: null,
          location: null,
          link_url: null,
          created_at: u.published_at || u.created_at,
        });
      }
    }
    if (feedResult.status === "fulfilled" && !feedResult.value.error) {
      feedOk = true;
      merged.push(...((feedResult.value.data || []) as LandingFeedItem[]).map((row) => ({ ...row, section: normalizeSection(row.section), image_url: resolveImage(row.image_url) })));
    }
    if (directResult.status === "fulfilled" && directResult.value.okCount > 0) {
      feedOk = true;
      // Direct items win; drop synced rows that repeat the same title in the same section.
      const dupKey = (m: LandingFeedItem) => `${m.section}|${m.title.trim().toLowerCase()}|${(m.description || "").slice(0, 60).toLowerCase()}`;
      const seen = new Set(merged.map(dupKey));
      for (const d of directResult.value.items) {
        if (!seen.has(dupKey(d))) { merged.push(d); seen.add(dupKey(d)); }
      }
    }
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(merged);
    if (updatesOk || feedOk) { setFeedError(""); setLastUpdated(new Date()); }
    else setFeedError("Live updates are temporarily unavailable. Please try again shortly.");
    setFeedLoading(false);
  }, []);

  useEffect(() => {
    const client = supabase;
    void loadFeed();
    // Refresh the shared feed from the live sources, then reload if anything changed.
    void syncLandingFeed().then((ran) => { if (ran) void loadFeed(); });
    const refreshTimer = window.setInterval(() => void loadFeed(), 60000);
    const channel = client
      ? client.channel("landing-feed-live").on("postgres_changes", { event: "*", schema: "public", table: "landing_feed" }, () => void loadFeed()).subscribe()
      : null;
    return () => {
      window.clearInterval(refreshTimer);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [loadFeed]);

  const refresh = async () => { setFeedLoading(true); await syncLandingFeed(); await loadFeed(); };

  return (
    <section className="live-campus-section" id="campus-live">
      <div className="live-campus-heading">
        <div>
          <span className="section-kicker"><span className="live-dot" /> CAMPUS PULSE</span>
          <h2>What's new around Chuka?</h2>
          <p>Fresh listings, campus conversations, events and opportunities — brought together in one place.</p>
        </div>
        <div className="live-status-wrap">
          <span className="live-status"><span className="live-dot" /> LIVE UPDATES</span>
          <button className="feed-refresh" onClick={refresh} disabled={feedLoading} aria-label="Refresh campus updates">
            <RefreshCw size={15} className={feedLoading ? "refresh-spinning" : ""} /> Refresh
          </button>
          {lastUpdated && <small>Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>}
        </div>
      </div>
      {feedError && <p className="feed-error" role="status">{feedError}</p>}
      <div className="live-feed-grid">
        {feedSections.map((section) => {
          const Icon = section.icon;
          const sectionItems = items.filter((item) => item.section === section.key).slice(0, 3);
          return (
            <article className="live-feed-card" key={section.key}>
              <div className="live-feed-card-head">
                <span className="live-feed-icon"><Icon size={19} /></span>
                <span className="live-feed-heading-copy"><strong>{section.title}</strong><small>{section.subtitle}</small></span>
                <span className="feed-count">{sectionItems.length}</span>
              </div>
              {sectionItems.length > 0 ? (
                <div className="live-feed-items">
                  {sectionItems.map((item) => (
                    <article className="live-feed-item" key={item.id}>
                      {item.image_url && <FeedImg src={item.image_url} />}
                      <div className="live-feed-item-copy">
                        <strong>{item.title}</strong>
                        {item.description && <p>{item.description}</p>}
                        <div className="feed-meta">
                          {item.price && <b>{item.price}</b>}
                          {item.location && <span><MapPin size={12} /> {item.location}</span>}
                          <span><Clock3 size={12} /> {timeAgo(item.created_at)}</span>
                        </div>
                        {item.link_url && <a href={item.link_url} target="_blank" rel="noreferrer">View details <ArrowUpRight size={13} /></a>}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="feed-empty">
                  {feedLoading ? "Checking for new posts…" : "New posts will appear here as students share updates."}
                </div>
              )}
              <button className="feed-open-updates" onClick={() => onOpenSection(section.key)}><span>{section.openLabel}</span><span className="feed-open-arrow"><ArrowUpRight size={14} /></span></button>
            </article>
          );
        })}
      </div>
      <p className="feed-footnote">Only approved public posts appear here. Private messages, student records and account details are never shown in this feed.</p>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z" />
      <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z" />
    </svg>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showStudyLabs, setShowStudyLabs] = useState(false);
  const [studyLabsTab, setStudyLabsTab] = useState<"Resources" | "Products">("Resources");
  const openStudyLabs = (tab: "Resources" | "Products") => { setStudyLabsTab(tab); setShowStudyLabs(true); };
  const [activeView, setActiveView] = useState("home");
  const [activeCommunity, setActiveCommunity] = useState<string | null>(() => /^#\/cpl(?:$|[/?])/.test(window.location.hash) ? "Chuka Premier League" : /^#\/efootball\//.test(window.location.hash) ? "Chuka Efootball" : /^#\/pool\//.test(window.location.hash) ? "Chuka Pool" : /^#\/soko\//.test(window.location.hash) ? "Chuka Soko" : null);

  useEffect(() => {
    // Keep the branded welcome screen visible long enough to be noticed,
    // even when Firebase restores the user's session almost instantly.
    let authResolved = false;
    let minimumTimeElapsed = false;
    const finishLoadingWhenReady = () => {
      if (authResolved && minimumTimeElapsed) setLoading(false);
    };
    const minimumDisplayTimer = window.setTimeout(() => {
      minimumTimeElapsed = true;
      finishLoadingWhenReady();
    }, 3200);

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        authResolved = true;
        finishLoadingWhenReady();
      },
      (authError) => {
        console.error("Authentication state error:", authError);
        setError("We couldn't check your sign-in status. Please refresh and try again.");
        authResolved = true;
        finishLoadingWhenReady();
      },
    );
    return () => {
      window.clearTimeout(minimumDisplayTimer);
      unsubscribe();
    };
  }, []);

  async function handleGoogleSignIn() {
    setError("");
    setBusy(true);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String(err.code)
          : "";

      if (code === "auth/popup-closed-by-user") {
        setError("Sign-in was cancelled. You can try again whenever you're ready.");
      } else if (code === "auth/unauthorized-domain") {
        setError("This domain isn't authorized yet. Add it in Firebase Authentication settings.");
      } else if (code === "auth/popup-blocked") {
        setError("Your browser blocked the sign-in popup. Allow popups for this site and try again.");
      } else if (code === "auth/operation-not-allowed") {
        setError("Google sign-in is not enabled yet. Enable Google in Firebase Authentication providers.");
      } else {
        console.error("Google sign-in error:", err);
        setError("Google sign-in couldn't be completed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setError("");
    setBusy(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign-out error:", err);
      setError("Unable to sign out right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && activeCommunity !== "Chuka Premier League") {
    return (
      <main className="loading-screen" aria-label="Loading Chuka Comrades">
        <div className="loading-brand">
          <div className="loading-mark">
            <img src={`${import.meta.env.BASE_URL}chukalogo.png`} alt="Chuka Comrades logo" />
          </div>
          <p className="loading-tagline">Knowledge is wealth</p>
        </div>
        <div className="loading-progress" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Welcome to Chuka Comrades</p>
        </div>
      </main>
    );
  }

  if (showStudyLabs) {
    return <StudyLabs key={studyLabsTab} initialTab={studyLabsTab} user={user} onBack={() => setShowStudyLabs(false)} onSignIn={handleGoogleSignIn} />;
  }

  const communities = [
    { title: "Hostels & Roommates", subtitle: "Find accommodation and roommates", icon: House },
    { title: "Chuka Soko", subtitle: "Buy, sell and discover student services", icon: ShoppingBag },
    { title: "Study Labs", subtitle: "Notes, study partners and resources", icon: BookOpen },
    { title: "Campus Updates", subtitle: "Announcements, events and opportunities", icon: BellRing },
    { title: "Chuka O Zone", subtitle: "Campus conversations and student life", icon: MessageCircle },
    { title: "Chuka Premier League", subtitle: "Fixtures, results and campus football", icon: Trophy },
    { title: "Chuka Efootball", subtitle: "Find players, organise matches and tournaments", icon: Users },
    { title: "Chuka Pool", subtitle: "Pool points, players and competitions", icon: Trophy },
  ];

  return (
    <main className={`site-shell onepage-shell${activeCommunity === "Chuka Premier League" ? " cpl-mode" : ""}`}>
      <header className="site-header onepage-header">
        <a className="brand" href="#home" onClick={() => { setActiveView("home"); setActiveCommunity(null); }} aria-label="Chuka Comrades home">
          <span className="brand-crest-wrap">
  <img
    className="brand-crest"
    src={`${import.meta.env.BASE_URL}chukalogo.png`}
    alt="Chuka University crest"
  />
</span>
          <span className="brand-copy"><strong>Chuka Comrades</strong><small>Your campus. Your community.</small></span>
        </a>
        <nav className="onepage-nav" aria-label="Main navigation">
          {[{id:"home",label:"Home"},{id:"updates",label:"What's new"},{id:"services",label:"Student services"},{id:"digital",label:"Digital products"}].map(item => (
            <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => { setActiveCommunity(null); if (item.id === "digital") openStudyLabs("Products"); else setActiveView(item.id); }}>{item.label}</button>
          ))}
        </nav>
        <InstallAppButton />

{user ? (
  <button
    className="header-signin signed-in"
    onClick={handleSignOut}
    disabled={busy}
  >
    {busy ? "Please wait…" : "Sign out"}
  </button>
) : (
  <button
    className="header-signin"
    onClick={handleGoogleSignIn}
    disabled={busy}
  >
    Sign in <ChevronRight size={16} />
  </button>
)}
      </header>

      <section className="onepage-content" id="home">
        {activeView === "home" && !activeCommunity && <>
          <div className="onepage-welcome">
            <div><span className="section-kicker"><span className="live-dot" /> MADE FOR THE CHUKA CAMPUS COMMUNITY</span>
              <h1>{user ? `Welcome back, ${user.displayName?.split(" ")[0] || "Comrade"}.` : "Your campus. Your community."}</h1>
              <p>Find your people, follow campus life and get to the student resources you need.</p>
            </div>
            {user ? <div className="onepage-user">{user.photoURL ? <img src={user.photoURL} alt="Your profile" /> : <Users size={22}/>}<span><strong>{user.displayName || "Chuka Comrades member"}</strong><small>{user.email}</small></span></div> : <button className="google-button compact-google" onClick={handleGoogleSignIn} disabled={busy}><GoogleMark/><span>{busy ? "Connecting…" : "Continue with Google"}</span></button>}
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="onepage-section-title"><div><span className="section-kicker">EXPLORE YOUR COMMUNITY</span><h2>Choose your community</h2></div><span>7 campus spaces</span></div>
          <div className="onepage-community-grid">{communities.map((community, index) => { const Icon = community.icon; return <button className={`onepage-community-card${community.title === "Chuka Efootball" ? " efootball-community-link game-community-link" : ""}${community.title === "Hostels & Roommates" ? " hostel-community-link" : ""}${community.title === "Chuka Soko" ? " soko-community-link" : ""}${community.title === "Study Labs" ? " study-community-link" : ""}${community.title === "Chuka Pool" ? " pool-community-link game-community-link" : ""}${community.title === "Campus Updates" ? " campus-community-link themed-community-link" : ""}${community.title === "Chuka O Zone" ? " ozone-community-link themed-community-link" : ""}${community.title === "Chuka Premier League" ? " premier-community-link themed-community-link" : ""}`} style={community.title === "Hostels & Roommates" ? ({ "--hostel-bg": `url(${import.meta.env.BASE_URL}hostel-bg.jpeg)` } as CSSProperties) : community.title === "Chuka Soko" ? ({ "--soko-bg": `url(${import.meta.env.BASE_URL}soko-bg.svg)` } as CSSProperties) : community.title === "Study Labs" ? ({ "--study-bg": `url(${import.meta.env.BASE_URL}study-labs-bg.svg)` } as CSSProperties) : community.title === "Chuka Efootball" ? ({ "--game-logo": `url(https://upload.wikimedia.org/wikipedia/commons/e/ee/EFootball_logo.svg)` } as CSSProperties) : community.title === "Chuka Pool" ? ({ "--game-logo": `url(${import.meta.env.BASE_URL}pool-bg.svg)` } as CSSProperties) : community.title === "Campus Updates" ? ({ "--theme-bg": `url(${import.meta.env.BASE_URL}campus-bg.svg)` } as CSSProperties) : community.title === "Chuka O Zone" ? ({ "--theme-bg": `url(${import.meta.env.BASE_URL}ozone-bg.svg)` } as CSSProperties) : community.title === "Chuka Premier League" ? ({ "--theme-bg": `url(${import.meta.env.BASE_URL}premier-bg.svg)` } as CSSProperties) : undefined} key={community.title} onClick={() => community.title === "Study Labs" ? openStudyLabs("Resources") : setActiveCommunity(community.title)}>{community.title === "Chuka Efootball" ? <span className="efootball-logo-wrap"><img className="efootball-logo" src="https://upload.wikimedia.org/wikipedia/commons/e/ee/EFootball_logo.svg" alt="eFootball logo" /></span> : community.title === "Chuka Pool" ? <span className="efootball-logo-wrap"><PoolLogo /></span> : <span className={`service-icon service-icon-${(index % 6) + 1}`}><Icon size={21}/></span>}<span className="onepage-community-copy"><strong>{community.title}</strong><small>{community.subtitle}</small></span><ChevronRight size={18}/></button>; })}</div>
          <div className="onepage-bottom-row"><div className="onepage-pulse"><span className="section-kicker"><span className="live-dot"/> CAMPUS PULSE</span><strong>What's happening around Chuka?</strong><small>Latest listings, conversations, sports and opportunities.</small><button onClick={() => setActiveView("updates")}>View campus updates <ArrowUpRight size={14}/></button></div><div className="onepage-shortcuts"><span className="section-kicker">QUICK ACCESS</span><button onClick={() => setActiveView("services")}>University & government services <ArrowUpRight size={14}/></button><button onClick={() => openStudyLabs("Products")}>Digital products <ArrowUpRight size={14}/></button></div></div>
        </>}

        {activeView === "home" && activeCommunity && <div className={activeCommunity === "Chuka Premier League" ? "onepage-detail cpl-detail-shell" : "onepage-detail"}>{activeCommunity !== "Chuka Premier League" && <button className="back-link" onClick={() => setActiveCommunity(null)}>← Back to communities</button>}{activeCommunity === "Chuka Efootball" ? <Efootball user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Chuka Pool" ? <Pool user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Campus Updates" ? <CampusUpdates user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Chuka O Zone" ? <OZone user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Hostels & Roommates" ? <HostelSection user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Chuka Soko" ? <ChukaSoko user={user} onSignIn={handleGoogleSignIn} onBack={() => setActiveCommunity(null)}/> : activeCommunity === "Chuka Premier League" ? <Cpl user={user} onSignIn={handleGoogleSignIn}/> : <><span className="section-kicker">CHUKA COMRADES COMMUNITY</span><h1>{activeCommunity}</h1><p>{communities.find(c => c.title === activeCommunity)?.subtitle}</p><div className="community-detail-card"><Users size={28}/><h2>Welcome to {activeCommunity}</h2><p>This community space is being prepared. Its posts, discussions and activities will appear here as features are connected.</p></div></>}</div>}

        {activeView === "updates" && <div className="onepage-panel"><button className="back-link" onClick={() => setActiveView("home")}>← Home</button><LiveCampusFeed onOpenSection={(key) => {
            if (key === "digital_products") { openStudyLabs("Products"); return; }
            const target: Record<string, string> = { marketplace: "Chuka Soko", hostels: "Hostels & Roommates", discussions: "Chuka O Zone", sports: "Chuka Premier League", efootball: "Chuka Efootball", pool: "Chuka Pool" };
            setActiveView("home"); setActiveCommunity(target[key] || "Campus Updates");
          }}/></div>}
        {activeView === "services" && <div className="onepage-panel svc-panel"><button className="back-link" onClick={() => setActiveView("home")}>← Home</button><span className="section-kicker">QUICK ACCESS</span><h1>Student Services</h1><p className="services-intro">Open official portals directly, get help with online applications, or order print-outs and other requests through the Chuka Comrades admin on WhatsApp.</p>
          <nav className="svc-jump" aria-label="Jump to a service group">{serviceGroups.map(group => { const GIcon = group.icon; return <button key={group.id} className={`svc-jump-${group.tone}`} onClick={() => document.getElementById(group.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}><GIcon size={14}/> {group.title}</button>; })}</nav>
          {serviceGroups.map(group => { const GIcon = group.icon; return <section className={`svc-group svc-${group.tone}`} id={group.id} key={group.id}>
            <header className="svc-group-head"><span className="svc-group-badge"><GIcon size={20}/></span><div><span className="section-kicker">{group.step} · {group.kicker}</span><h2>{group.title}</h2><p>{group.blurb}</p></div></header>
            {group.note && <p className="svc-note"><ShieldAlert size={14}/> {group.note}</p>}
            <div className="svc-grid">{group.items.map(service => { const Icon = service.icon; const isWa = service.mode === "whatsapp"; return <a key={service.title} className="svc-card" href={isWa ? waHref(service.waMessage || "") : service.url} target="_blank" rel="noreferrer"><span className="svc-card-top"><span className="svc-icon"><Icon size={20}/></span><em className="svc-chip">{service.label}</em></span><strong>{service.title}</strong><small>{service.description}</small><span className="svc-action">{isWa ? <MessageCircle size={14}/> : <ArrowUpRight size={14}/>}<span>{service.action}</span><ArrowUpRight size={14} className="svc-action-arrow"/></span></a>; })}</div>
          </section>; })}
        </div>}
        </section>
      <footer className="onepage-footer"><span>© {new Date().getFullYear()} Chuka Comrades</span><span>Community-led, student-focused.</span></footer>
    </main>
  );
}

export default App;
