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
  CheckCircle2,
  ChevronRight,
  House,
  Landmark,
  FileText,
  GraduationCap,
  BriefcaseBusiness,
  Wallet,
  Download,
  Palette,
  Menu,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { auth, googleProvider } from "./lib/firebase";
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

const services = [
  {
    title: "Hostels & Roommates",
    description: "Explore accommodation options and find potential roommates.",
    icon: House,
    tag: "Living",
  },
  {
    title: "Chuka Soko",
    description: "Discover student listings, useful items and local services.",
    icon: ShoppingBag,
    tag: "Marketplace",
  },
  {
    title: "Study Labs",
    description: "Find study resources and build better study routines.",
    icon: BookOpen,
    tag: "Academics",
  },
  {
    title: "Campus Updates",
    description: "Keep up with announcements, opportunities and deadlines.",
    icon: BellRing,
    tag: "Stay informed",
  },
  {
    title: "Chuka O Zone",
    description: "Join campus conversations respectfully and safely.",
    icon: MessageCircle,
    tag: "Community",
  },
  {
    title: "Chuka Premier League",
    description: "Follow teams, fixtures, results and campus football.",
    icon: Trophy,
    tag: "Sports",
  },
];

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (authError) => {
        console.error("Authentication state error:", authError);
        setError("We couldn't check your sign-in status. Please refresh and try again.");
        setLoading(false);
      },
    );
    return unsubscribe;
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
      <main className="loading-screen">
        <div className="loading-mark">
          <img src="/chuka%20crest.jfif" alt="" />
        </div>
        <p>Opening your campus community…</p>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#home" aria-label="Chuka Comrades home">
          <span className="brand-crest-wrap">
            <img className="brand-crest" src="/chuka%20crest.jfif" alt="Chuka University crest" />
          </span>
          <span className="brand-copy">
            <strong>Chuka Comrades</strong>
            <small>Your campus. Your community.</small>
          </span>
        </a>

        <button
          className="mobile-menu-button"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav className={`header-nav${mobileMenuOpen ? " is-open" : ""}`}>
          <a href="#explore" onClick={() => setMobileMenuOpen(false)}>Explore</a>
          <a href="#government-services" onClick={() => setMobileMenuOpen(false)}>School & Government</a>
          <a href="#digital-products" onClick={() => setMobileMenuOpen(false)}>Digital products</a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it works</a>
          {user ? (
            <button className="header-signin signed-in" onClick={handleSignOut} disabled={busy}>
              {busy ? "Please wait…" : "Sign out"}
            </button>
          ) : (
            <button className="header-signin" onClick={handleGoogleSignIn} disabled={busy}>
              Sign in <ChevronRight size={16} />
            </button>
          )}
        </nav>
      </header>

      <section className="hero-section" id="home">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="hero-label">
              <span className="live-dot" />
              MADE FOR THE CHUKA CAMPUS COMMUNITY
            </div>

            {user ? (
              <>
                <h1>Welcome back,<br /><span>{user.displayName?.split(" ")[0] || "Comrade"}.</span></h1>
                <p className="hero-description">
                  Your campus community is ready when you are. Explore resources,
                  discover opportunities and connect with fellow students.
                </p>
              </>
            ) : (
              <>
                <h1>Campus life,<br /><span>connected.</span></h1>
                <p className="hero-description">
                  Discover student opportunities, find a place to stay, trade useful
                  items, follow campus football and stay in the loop — all from one
                  community built around Chuka campus life.
                </p>
              </>
            )}

            {user ? (
              <div className="signed-in-card">
                {user.photoURL ? (
                  <img className="user-avatar" src={user.photoURL} alt="Your Google profile" />
                ) : (
                  <span className="user-avatar avatar-fallback">
                    {(user.displayName || user.email || "C").charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="signed-in-details">
                  <strong>{user.displayName || "Chuka Comrades member"}</strong>
                  <small>{user.email}</small>
                  <span className="verified-status"><CheckCircle2 size={14} /> Signed in with Google</span>
                </span>
              </div>
            ) : (
              <div className="hero-actions">
                <button className="google-button" onClick={handleGoogleSignIn} disabled={busy}>
                  <GoogleMark />
                  <span>{busy ? "Connecting to Google…" : "Continue with Google"}</span>
                  {!busy && <ArrowUpRight className="button-arrow" size={17} />}
                </button>
                <p className="signin-caption"><ShieldCheck size={15} /> Secure sign-in. No new password to remember.</p>
              </div>
            )}

            {error && <p className="error-message" role="alert">{error}</p>}

            <div className="hero-proof">
              <span className="proof-icon"><Users size={17} /></span>
              <span><strong>One campus community</strong><small>Many ways to get involved</small></span>
            </div>
          </div>

          <div className="hero-visual" aria-label="Chuka Comrades campus services preview">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="crest-stage">
              <div className="crest-stage-halo" />
              <img src="/chuka%20crest.jfif" alt="Chuka University crest" className="hero-crest" />
              <span className="crest-spark spark-one">✦</span>
              <span className="crest-spark spark-two">✦</span>
            </div>
            <div className="floating-card floating-card-top">
              <span className="float-icon float-green"><House size={18} /></span>
              <span><strong>Find your space</strong><small>Hostels & roommates</small></span>
              <span className="float-check"><CheckCircle2 size={16} /></span>
            </div>
            <div className="floating-card floating-card-bottom">
              <span className="float-icon float-gold"><Trophy size={18} /></span>
              <span><strong>Campus is active</strong><small>Sports, updates & more</small></span>
              <ArrowUpRight size={17} className="float-arrow" />
            </div>
            <div className="visual-caption"><span /> A community for campus life</div>
          </div>
        </div>
      </section>

      <section className="services-section" id="explore">
        <div className="section-heading">
          <div>
            <span className="section-kicker">EXPLORE YOUR COMMUNITY</span>
            <h2>More campus. Less searching.</h2>
          </div>
          <p>Start with what matters to you. You can explore different parts of the community as it grows.</p>
        </div>

        <div className="service-grid">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <article className="service-card" key={service.title}>
                <div className={`service-icon service-icon-${index + 1}`}><Icon size={22} strokeWidth={1.8} /></div>
                <span className="service-tag">{service.tag}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <span className="service-coming">Explore community <ArrowUpRight size={15} /></span>
              </article>
            );
          })}
        </div>
        <p className="availability-note">Services are being introduced in stages. Availability may vary as the platform develops.</p>
      </section>

      <section className="services-section government-section" id="government-services">
        <div className="section-heading">
          <div>
            <span className="section-kicker">PUBLIC SERVICES, EASIER TO FIND</span>
            <h2>Chuka Government Services</h2>
          </div>
          <p>Quick links to useful Kenyan national and county government portals for students and residents around Chuka.</p>
        </div>
        <div className="subsection-heading">
          <span className="section-kicker">CHUKA UNIVERSITY QUICK ACCESS</span>
          <h3>School & Student Services</h3>
          <p>Go straight to the portals and resources you use during the semester.</p>
        </div>
        <div className="service-grid school-service-grid">
          {schoolServices.map((service, index) => {
            const Icon = service.icon;
            return (
              <article className="service-card government-card school-service-card" key={service.title}>
                <div className={`service-icon service-icon-${(index % 6) + 1}`}><Icon size={22} strokeWidth={1.8} /></div>
                <span className="service-tag">{service.label}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a className="service-link" href={service.url} target="_blank" rel="noreferrer">
                  {service.action} <ArrowUpRight size={15} />
                </a>
              </article>
            );
          })}
        </div>
        <div className="subsection-heading government-subheading">
          <span className="section-kicker">KENYA PUBLIC SERVICES</span>
          <h3>Government Services</h3>
          <p>Useful national and county government portals for students and residents.</p>
        </div>
        <div className="service-grid">
          {governmentServices.map((service, index) => {
            const Icon = service.icon;
            return (
              <article className="service-card government-card" key={service.title}>
                <div className={`service-icon service-icon-${(index % 6) + 1}`}><Icon size={22} strokeWidth={1.8} /></div>
                <span className="service-tag">{service.label}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a className="service-link" href={service.url} target="_blank" rel="noreferrer">
                  Open official website <ArrowUpRight size={15} />
                </a>
              </article>
            );
          })}
        </div>
        <p className="availability-note">Chuka Comrades is an independent student platform, not a government agency. These links open external websites; check each portal for current requirements, fees and availability.</p>
      </section>

      <section className="services-section digital-section" id="digital-products">
        <div className="section-heading">
          <div>
            <span className="section-kicker">MADE, SHARED & SOLD DIGITALLY</span>
            <h2>Chuka Digital Products</h2>
          </div>
          <p>A future marketplace for useful digital downloads from the campus community—created by students, for students and local businesses.</p>
        </div>
        <div className="service-grid digital-grid">
          {digitalProducts.map((product, index) => {
            const Icon = product.icon;
            return (
              <article className="service-card digital-card" key={product.title}>
                <div className={`service-icon service-icon-${(index % 6) + 1}`}><Icon size={22} strokeWidth={1.8} /></div>
                <span className="service-tag">{product.tag}</span>
                <h3>{product.title}</h3>
                <p>{product.description}</p>
                <span className="service-coming"><Download size={15} /> Coming to the marketplace</span>
              </article>
            );
          })}
        </div>
        <div className="digital-creator-note">
          <div className="digital-creator-icon"><Palette size={21} /></div>
          <div>
            <strong>Have something useful to sell?</strong>
            <p>Digital products can include original notes, e-books, templates, designs and guides. Only upload content you own or have permission to distribute.</p>
          </div>
          <span className="creator-status">Seller tools planned</span>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-intro">
          <span className="section-kicker">SIMPLE TO GET STARTED</span>
          <h2>Your campus connection starts here.</h2>
          <p>One sign-in gives you a starting point for the Chuka Comrades experience.</p>
        </div>
        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">01</span>
            <div className="step-icon"><GoogleMark /></div>
            <h3>Sign in securely</h3>
            <p>Use your Google account to get started without creating another password.</p>
          </article>
          <article className="step-card">
            <span className="step-number">02</span>
            <div className="step-icon"><Users size={23} /></div>
            <h3>Make it yours</h3>
            <p>Set up your profile and choose the campus services you want to explore.</p>
          </article>
          <article className="step-card">
            <span className="step-number">03</span>
            <div className="step-icon"><ArrowUpRight size={23} /></div>
            <h3>Get involved</h3>
            <p>Discover useful resources, opportunities and ways to connect with others.</p>
          </article>
        </div>
      </section>

      <section className="community-banner" id="community">
        <div className="community-banner-icon"><MessageCircle size={27} /></div>
        <div className="community-banner-copy">
          <span className="section-kicker">CONNECTED ON AND OFF THE APP</span>
          <h2>Campus community, in one place.</h2>
          <p>Chuka Comrades is designed to bring useful campus services together and complement the conversations students already have on WhatsApp.</p>
        </div>
        <div className="community-badge">Growing with the community <ArrowUpRight size={16} /></div>
      </section>

      <footer className="site-footer">
        <a className="footer-brand" href="#home">
          <img src="/chuka%20crest.jfif" alt="" />
          <span><strong>Chuka Comrades</strong><small>Built for campus life.</small></span>
        </a>
        <p>© {new Date().getFullYear()} Chuka Comrades. Community-led, student-focused.</p>
        <span className="footer-note">Chuka University crest displayed as supplied.</span>
      </footer>
    </main>
  );
}

export default App;
