
import { useState } from "react";
import type { User } from "firebase/auth";

import Home from "./pages/Home";
import Teams from "./pages/Teams";
import Fixtures from "./pages/Fixtures";
import Standings from "./pages/Standings";
import Cup from "./pages/Cup";
import News from "./pages/News";
import TeamProfile from "./pages/TeamProfile";
import ChairmanDashboard from "./pages/ChairmanDashboard";

interface CplAppProps {
  user: User | null;
  onSignIn: () => void;
  onBackMain: () => void;
}

type CplPage =
  | "home"
  | "teams"
  | "team"
  | "fixtures"
  | "standings"
  | "cup"
  | "news"
  | "chairman";

const CHAIRMAN_EMAIL = "sidneywafula30@gmail.com";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"
      />

      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"
      />

      <path
        fill="#FBBC05"
        d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"
      />

      <path
        fill="#EA4335"
        d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z"
      />
    </svg>
  );
}

export default function CplApp({
  user,
  onSignIn,
  onBackMain,
}: CplAppProps) {
  const [page, setPage] = useState<CplPage>("home");

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedTeamName, setSelectedTeamName] = useState("");

  const isChairman =
    user?.email?.trim().toLowerCase() === CHAIRMAN_EMAIL;

  function navigate(nextPage: CplPage) {
    setPage(nextPage);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openTeam(teamId: string, teamName: string) {
    setSelectedTeamId(teamId);
    setSelectedTeamName(teamName);
    navigate("team");
  }

  function backToTeams() {
    navigate("teams");
  }

  function renderPage() {
    switch (page) {
      case "home":
        return <Home />;

      case "teams":
        return (
          <Teams
            onSelectTeam={openTeam}
          />
        );

      case "team":
        return (
          <TeamProfile
            teamId={selectedTeamId}
            selectedTeamName={selectedTeamName}
            onBack={backToTeams}
          />
        );

      case "fixtures":
        return <Fixtures />;

      case "standings":
        return <Standings />;

      case "cup":
        return <Cup />;

      case "news":
        return <News />;

      case "chairman":
        return user && isChairman ? (
          <ChairmanDashboard
            user={user}
            onBack={() => navigate("home")}
          />
        ) : (
          <Home />
        );

      default:
        return <Home />;
    }
  }

  return (
    <div className="cpl-v2-app">
      <header className="cpl-v2-header">

        {/* Back to main Chuka Comrades */}
        <button
          type="button"
          className="cpl-v2-back-main"
          onClick={onBackMain}
        >
          ← Main Chuka Comrades
        </button>

        {/* Official CPL branding */}
        <button
          type="button"
          className="cpl-v2-brand"
          onClick={() => navigate("home")}
          aria-label="Chuka Premier League home"
        >
          <img
            className="cpl-v2-brand-logo"
            src={`${import.meta.env.BASE_URL}cpllogo.jpeg`}
            alt="Chuka Premier League logo"
          />

          <span>
            <strong>Chuka Premier League</strong>
            <small>Official CPL Platform</small>
          </span>
        </button>

        {/* CPL navigation */}
        <nav
          className="cpl-v2-nav"
          aria-label="CPL navigation"
        >
          <button
            type="button"
            className={page === "home" ? "active" : ""}
            onClick={() => navigate("home")}
          >
            Home
          </button>

          <button
            type="button"
            className={
              page === "teams" || page === "team"
                ? "active"
                : ""
            }
            onClick={() => navigate("teams")}
          >
            Teams
          </button>

          <button
            type="button"
            className={page === "fixtures" ? "active" : ""}
            onClick={() => navigate("fixtures")}
          >
            Fixtures
          </button>

          <button
            type="button"
            className={page === "standings" ? "active" : ""}
            onClick={() => navigate("standings")}
          >
            Standings
          </button>

          <button
            type="button"
            className={page === "cup" ? "active" : ""}
            onClick={() => navigate("cup")}
          >
            CPL Cup
          </button>

          <button
            type="button"
            className={page === "news" ? "active" : ""}
            onClick={() => navigate("news")}
          >
            News
          </button>
        </nav>

        {/* Google sign-in / user profile */}
        {!user ? (
          <button
            type="button"
            className="cpl-v2-google-button"
            onClick={onSignIn}
          >
            <GoogleLogo />
            <span>Continue with Google</span>
          </button>
        ) : (
          <div className="cpl-v2-user">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
              />
            ) : (
              <span className="cpl-v2-user-avatar">
                {(user.displayName || user.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </span>
            )}

            <span>
              {user.displayName || "Signed in"}
            </span>
          </div>
        )}

        {/* Chairman dashboard button */}
        {isChairman && (
          <button
            type="button"
            className="cpl-v2-dashboard-button"
            onClick={() => navigate("chairman")}
          >
            Open My Dashboard →
          </button>
        )}
      </header>

      <main>
        {renderPage()}
      </main>

      <footer className="cpl-v2-footer">
        <div>
          <strong>Chuka Premier League</strong>
          <p>Official CPL football platform.</p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => navigate("teams")}
          >
            Teams
          </button>

          <button
            type="button"
            onClick={() => navigate("fixtures")}
          >
            Fixtures
          </button>

          <button
            type="button"
            onClick={() => navigate("standings")}
          >
            Standings
          </button>

          <button
            type="button"
            onClick={() => navigate("cup")}
          >
            CPL Cup
          </button>
        </div>
      </footer>
    </div>
  );
}
