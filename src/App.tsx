import { useEffect, useState } from "react";
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
  Palette,
  MessageCircle,
  ShoppingBag,
  Trophy,
  Users,
  Clock3,
  RefreshCw,
  MapPin,
  Sparkles,
} from "lucide-react";
import { auth, googleProvider } from "./lib/firebase";
import { supabase } from "./lib/supabase";
import StudyLabs from "./StudyLabs";
import Efootball from "./Efootball";
import OZone from "./OZone";
import HostelSection from "./HostelSection";
import ChukaSoko from "./ChukaSoko";
import "./App.css";

const governmentServices = [
  {
    title: "eCitizen Kenya",
    description: "Access participating national government services, applications and payments online.",
    icon: Landmark,
    label: "National services",
    url: "https://www.ecitizen.go.ke/",
  },
  {
    title: "Huduma Kenya",
    description: "Find information about public services and Huduma service centres.",
    icon: FileText,
    label: "Public service help",
    url: "https://www.hudumakenya.go.ke/",
  },
  {
    title: "KRA iTax",
    description: "Open the Kenya Revenue Authority tax portal for available tax services.",
    icon: Wallet,
    label: "Tax services",
    url: "https://itax.kra.go.ke/",
  },
  {
    title: "HELB",
    description: "Visit the Higher Education Loans Board portal for student financing information and services.",
    icon: GraduationCap,
    label: "Student financing",
    url: "https://www.helb.co.ke/",
  },
  {
    title: "NSSF Kenya",
    description: "Access official information and online services from the National Social Security Fund.",
    icon: BriefcaseBusiness,
    label: "Social security",
    url: "https://www.nssf.or.ke/",
  },
  {
    title: "Chuka / Tharaka-Nithi County",
    description: "Find county government information, announcements and service updates.",
    icon: Landmark,
    label: "County information",
    url: "https://tharakanithi.go.ke/",
  },
];

const schoolServices = [
  {
    title: "Student Portal — Direct Login",
    description: "Sign in with your registration number and password to access your student account and available academic services.",
    icon: GraduationCap,
    label: "Student account",
    url: "https://portal.chuka.ac.ke/",
    action: "Open student login",
  },
  {
    title: "E-Learning / Moodle",
    description: "Open the university e-learning system to access online course materials and learning activities.",
    icon: BookOpen,
    label: "Online classes",
    url: "https://dos.chuka.ac.ke/",
    action: "Open e-learning",
  },
  {
    title: "University Library",
    description: "Find library services, digital resources, e-books, e-journals and research support.",
    icon: BookOpen,
    label: "Library & research",
    url: "https://library.chuka.ac.ke/",
    action: "Open library",
  },
  {
    title: "Current Student Resources",
    description: "Find student forms, handbooks, clearance links, portal guidance and other official student resources.",
    icon: ClipboardList,
    label: "Forms & resources",
    url: "https://www.chuka.ac.ke/current-students/",
    action: "View student resources",
  },
  {
    title: "Student Welfare & Dean of Students",
    description: "Access student welfare information, support services, campus life updates and student assistance contacts.",
    icon: Users,
    label: "Student support",
    url: "https://studentswelfare.chuka.ac.ke/",
    action: "Open student welfare",
  },
  {
    title: "Student Support & Counselling",
    description: "Visit the student support website for welfare information and available counselling support.",
    icon: MessageCircle,
    label: "Wellbeing support",
    url: "https://students.chuka.ac.ke/",
    action: "Get student support",
  },
  {
    title: "University Announcements",
    description: "Visit the official university website for notices, academic updates, events and announcements.",
    icon: BellRing,
    label: "Official updates",
    url: "https://www.chuka.ac.ke/",
    action: "Visit university website",
  },
];

const digitalProducts = [
  {
    title: "Study Notes & Revision Packs",
    description: "Student-created summaries, revision guides and learning resources for faster study.",
    icon: GraduationCap,
    tag: "For students",
  },
  {
    title: "CVs, Applications & Templates",
    description: "Editable CV layouts, attachment trackers, business templates and application checklists.",
    icon: FileText,
    tag: "Career tools",
  },
  {
    title: "Designs & Social Media Kits",
    description: "Posters, event flyers, business cards and ready-to-customise social media designs.",
    icon: Palette,
    tag: "Creative assets",
  },
  {
    title: "Digital Skills & Guides",
    description: "Practical e-books and step-by-step guides made for campus projects and small businesses.",
    icon: Download,
    tag: "Learn & build",
  },
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
  { key: "marketplace", title: "Chuka Soko", subtitle: "Latest student listings", icon: ShoppingBag },
  { key: "hostels", title: "Hostels & Roommates", subtitle: "New accommodation posts", icon: House },
  { key: "events", title: "Campus Updates & Events", subtitle: "What's happening around campus", icon: BellRing },
  { key: "sports", title: "Chuka Premier League", subtitle: "Latest football updates", icon: Trophy },
  { key: "discussions", title: "Chuka O Zone", subtitle: "Fresh community conversations", icon: MessageCircle },
  { key: "digital_products", title: "Digital Products", subtitle: "Recently added downloads", icon: Download },
  { key: "opportunities", title: "Opportunities", subtitle: "Jobs, attachments & scholarships", icon: BriefcaseBusiness },
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

function LiveCampusFeed() {
  const [items, setItems] = useState<LandingFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setFeedLoading(false);
      return;
    }

    let active = true;
    const loadFeed = async () => {
      const { data, error: queryError } = await client
        .from("landing_feed")
        .select("id, section, title, description, image_url, price, location, link_url, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(70);
      if (!active) return;
      if (queryError) {
        setFeedError("Live updates are temporarily unavailable.");
      } else {
        setItems((data || []) as LandingFeedItem[]);
        setFeedError("");
        setLastUpdated(new Date());
      }
      setFeedLoading(false);
    };

    void loadFeed();
    const refreshTimer = window.setInterval(() => void loadFeed(), 60000);
    const channel = client
      .channel("landing-feed-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "landing_feed" }, () => void loadFeed())
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      void client.removeChannel(channel);
    };
  }, []);

  const refresh = async () => {
    const client = supabase;
    if (!client) return;
    setFeedLoading(true);
    const { data, error: queryError } = await client
      .from("landing_feed")
      .select("id, section, title, description, image_url, price, location, link_url, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(70);
    if (queryError) setFeedError("Live updates are temporarily unavailable.");
    else { setItems((data || []) as LandingFeedItem[]); setFeedError(""); setLastUpdated(new Date()); }
    setFeedLoading(false);
  };

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
          <button className="feed-refresh" onClick={refresh} disabled={!supabase || feedLoading} aria-label="Refresh campus updates">
            <RefreshCw size={15} className={feedLoading ? "refresh-spinning" : ""} /> Refresh
          </button>
          {lastUpdated && <small>Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>}
        </div>
      </div>
      {!supabase && <div className="feed-setup-note"><Sparkles size={17} /> Connect Supabase and publish approved posts to make these sections update with real campus activity.</div>}
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
                      {item.image_url && <img src={item.image_url} alt="" loading="lazy" />}
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
  const [activeView, setActiveView] = useState("home");
  const [activeCommunity, setActiveCommunity] = useState<string | null>(null);

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

  if (loading) {
    return (
      <main className="loading-screen" aria-label="Loading Chuka Comrades">
        <div className="loading-brand">
          <div className="loading-mark">
            <img src="/chuka%20crest.jfif" alt="Chuka University crest" />
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
    return <StudyLabs user={user} onBack={() => setShowStudyLabs(false)} onSignIn={handleGoogleSignIn} />;
  }

  const communities = [
    { title: "Hostels & Roommates", subtitle: "Find accommodation and roommates", icon: House },
    { title: "Chuka Soko", subtitle: "Buy, sell and discover student services", icon: ShoppingBag },
    { title: "Study Labs", subtitle: "Notes, study partners and resources", icon: BookOpen },
    { title: "Campus Updates", subtitle: "Announcements, events and opportunities", icon: BellRing },
    { title: "Chuka O Zone", subtitle: "Campus conversations and student life", icon: MessageCircle },
    { title: "Chuka Premier League", subtitle: "Fixtures, results and campus football", icon: Trophy },
    { title: "Chuka Efootball", subtitle: "Find players, organise matches and tournaments", icon: Users },
  ];

  return (
    <main className="site-shell onepage-shell">
      <header className="site-header onepage-header">
        <a className="brand" href="#home" onClick={() => { setActiveView("home"); setActiveCommunity(null); }} aria-label="Chuka Comrades home">
          <span className="brand-crest-wrap">
  <img
    className="brand-crest"
    src={`${import.meta.env.BASE_URL}chukalogo.jfif`}
    alt="Chuka University crest"
  />
</span>
          <span className="brand-copy"><strong>Chuka Comrades</strong><small>Your campus. Your community.</small></span>
        </a>
        <nav className="onepage-nav" aria-label="Main navigation">
          {[{id:"home",label:"Home"},{id:"updates",label:"What's new"},{id:"services",label:"Student services"},{id:"digital",label:"Digital products"}].map(item => (
            <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => { setActiveView(item.id); setActiveCommunity(null); }}>{item.label}</button>
          ))}
        </nav>
        {user ? <button className="header-signin signed-in" onClick={handleSignOut} disabled={busy}>{busy ? "Please wait…" : "Sign out"}</button> : <button className="header-signin" onClick={handleGoogleSignIn} disabled={busy}>Sign in <ChevronRight size={16} /></button>}
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
          <div className="onepage-community-grid">{communities.map((community, index) => { const Icon = community.icon; return <button className={`onepage-community-card${community.title === "Chuka Efootball" ? " efootball-community-link" : ""}`} key={community.title} onClick={() => community.title === "Study Labs" ? setShowStudyLabs(true) : setActiveCommunity(community.title)}>{community.title === "Chuka Efootball" ? <span className="efootball-logo-wrap"><img className="efootball-logo" src="https://upload.wikimedia.org/wikipedia/commons/e/ee/EFootball_logo.svg" alt="eFootball logo" /></span> : <span className={`service-icon service-icon-${(index % 6) + 1}`}><Icon size={21}/></span>}<span className="onepage-community-copy"><strong>{community.title}</strong><small>{community.subtitle}</small></span><ChevronRight size={18}/></button>; })}</div>
          <div className="onepage-bottom-row"><div className="onepage-pulse"><span className="section-kicker"><span className="live-dot"/> CAMPUS PULSE</span><strong>What's happening around Chuka?</strong><small>Latest listings, conversations, sports and opportunities.</small><button onClick={() => setActiveView("updates")}>View campus updates <ArrowUpRight size={14}/></button></div><div className="onepage-shortcuts"><span className="section-kicker">QUICK ACCESS</span><button onClick={() => setActiveView("services")}>University & government services <ArrowUpRight size={14}/></button><button onClick={() => setActiveView("digital")}>Digital products <ArrowUpRight size={14}/></button></div></div>
        </>}

        {activeView === "home" && activeCommunity && <div className="onepage-detail"><button className="back-link" onClick={() => setActiveCommunity(null)}>← Back to communities</button>{activeCommunity === "Chuka Efootball" ? <Efootball user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Chuka O Zone" ? <OZone user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Hostels & Roommates" ? <HostelSection user={user} onSignIn={handleGoogleSignIn}/> : activeCommunity === "Chuka Soko" ? <ChukaSoko user={user} onSignIn={handleGoogleSignIn} onBack={() => setActiveCommunity(null)}/> : <><span className="section-kicker">CHUKA COMRADES COMMUNITY</span><h1>{activeCommunity}</h1><p>{communities.find(c => c.title === activeCommunity)?.subtitle}</p><div className="community-detail-card"><Users size={28}/><h2>Welcome to {activeCommunity}</h2><p>This community space is being prepared. Its posts, discussions and activities will appear here as features are connected.</p></div></>}</div>}

        {activeView === "updates" && <div className="onepage-panel"><button className="back-link" onClick={() => setActiveView("home")}>← Home</button><LiveCampusFeed/></div>}
        {activeView === "services" && <div className="onepage-panel"><button className="back-link" onClick={() => setActiveView("home")}>← Home</button><span className="section-kicker">QUICK ACCESS</span><h1>University & Government Services</h1><div className="onepage-link-grid">{[...schoolServices, ...governmentServices].map(service => { const Icon = service.icon; return <a key={service.title} href={service.url} target="_blank" rel="noreferrer"><Icon size={20}/><span><strong>{service.title}</strong><small>{service.description}</small></span><ArrowUpRight size={16}/></a>; })}</div></div>}
        {activeView === "digital" && <div className="onepage-panel"><button className="back-link" onClick={() => setActiveView("home")}>← Home</button><span className="section-kicker">MADE, SHARED & SOLD DIGITALLY</span><h1>Chuka Digital Products</h1><div className="onepage-link-grid">{digitalProducts.map(product => { const Icon = product.icon; return <article key={product.title}><Icon size={20}/><span><strong>{product.title}</strong><small>{product.description}</small></span><small>Coming soon</small></article>; })}</div></div>}
      </section>
      <footer className="onepage-footer"><span>© {new Date().getFullYear()} Chuka Comrades</span><span>Community-led, student-focused.</span></footer>
    </main>
  );
}

export default App;
