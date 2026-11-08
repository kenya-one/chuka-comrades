import { useEffect, useState } from "react";
import { cplApi } from "../services/cplApi";
import "./TeamProfile.css";

interface Team {
  teamId?: string;
  teamName?: string;
  teamLogo?: string;
  teamTag?: string;
  division?: string;
  status?: string;
}

interface Player {
  playerId?: string;
  fullName?: string;
  profileImage?: string;
  position?: string;
  jerseyNumber?: string | number;
  preferredFoot?: string;
  status?: string;
}

interface Standing {
  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  points?: number;
  position?: number;
}

type Match = Record<string, unknown>;

interface TeamProfileData {
  team?: Team;
  players?: Player[];
  fixtures?: {
    matches?: Match[];
    upcomingFixtures?: Match[];
    completedResults?: Match[];
    postponedFixtures?: Match[];
    cancelledFixtures?: Match[];
  };
  standing?: Standing | null;
  season?: {
    seasonName?: string;
  };
}

interface TeamProfileProps {
  teamId: string;
  selectedTeamName: string;
  onBack: () => void;
}

function valueOf(
  item: Match,
  keys: string[]
): string {
  for (const key of keys) {
    const value = item[key];

    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  return "";
}

function formatMatchDate(value: string) {
  if (!value) return "Date to be confirmed";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function FixtureCard({ match }: { match: Match }) {
  const home = valueOf(match, [
    "homeTeamName",
    "Home Team Name",
    "homeTeam",
  ]);

  const away = valueOf(match, [
    "awayTeamName",
    "Away Team Name",
    "awayTeam",
  ]);

  const date = valueOf(match, [
    "matchDate",
    "Match Date",
    "date",
  ]);

  const time = valueOf(match, [
    "matchTime",
    "Match Time",
    "time",
  ]);

  const venue = valueOf(match, [
    "venueName",
    "Venue Name",
    "venue",
    "Venue",
  ]);

  const status = valueOf(match, [
    "status",
    "Status",
  ]);

  const homeScore = valueOf(match, [
    "homeScore",
    "Home Score",
    "homeGoals",
  ]);

  const awayScore = valueOf(match, [
    "awayScore",
    "Away Score",
    "awayGoals",
  ]);

  return (
    <article className="team-fixture-card">
      <div className="team-fixture-heading">
        <span>{formatMatchDate(date)}</span>
        <span className="team-fixture-status">
          {status || "Scheduled"}
        </span>
      </div>

      <div className="team-fixture-match">
        <strong>{home || "Home team"}</strong>

        <span className="team-fixture-score">
          {homeScore !== "" && awayScore !== ""
            ? `${homeScore} - ${awayScore}`
            : "VS"}
        </span>

        <strong>{away || "Away team"}</strong>
      </div>

      <div className="team-fixture-venue">
        {time && <span>{time}</span>}
        {venue && <span>{venue}</span>}
      </div>
    </article>
  );
}

export default function TeamProfile({
  teamId,
  selectedTeamName,
  onBack,
}: TeamProfileProps) {
  const [profile, setProfile] = useState<TeamProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        setLoading(true);
        setError("");

        const result = await cplApi.getPublicTeamProfile(teamId);

        if (!active) return;

        const data = result as TeamProfileData;

        if (!data?.team) {
          throw new Error("Team profile information was not found.");
        }

        setProfile(data);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load this team profile."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (teamId) {
      loadProfile();
    } else {
      setError("A valid team ID is required.");
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [teamId]);

  if (loading) {
    return (
      <section className="cpl-v2-page team-profile-page">
        <button className="team-back-button" onClick={onBack}>
          ← Back to Teams
        </button>
        <div className="team-profile-message">
          Loading team profile...
        </div>
      </section>
    );
  }

  if (error || !profile?.team) {
    return (
      <section className="cpl-v2-page team-profile-page">
        <button className="team-back-button" onClick={onBack}>
          ← Back to Teams
        </button>
        <div className="team-profile-error" role="alert">
          {error || "Team profile unavailable."}
        </div>
      </section>
    );
  }

  const team = profile.team;
  const standing = profile.standing;
  const players = profile.players || [];
  const fixtures = profile.fixtures || {};

  const upcoming = fixtures.upcomingFixtures || [];
  const results = fixtures.completedResults || [];
  const postponed = fixtures.postponedFixtures || [];
  const cancelled = fixtures.cancelledFixtures || [];

  const teamName = team.teamName || selectedTeamName;

  return (
    <section className="cpl-v2-page team-profile-page">
      <button className="team-back-button" onClick={onBack}>
        ← Back to Teams
      </button>

      <div className="team-profile-hero">
        <div className="team-profile-identity">
          <div className="team-profile-logo">
            {team.teamLogo ? (
              <img src={team.teamLogo} alt={`${teamName} logo`} />
            ) : (
              <span>
                {team.teamTag || teamName?.charAt(0) || "CPL"}
              </span>
            )}
          </div>

          <div>
            <span className="team-profile-eyebrow">
              CHUKA PREMIER LEAGUE CLUB
            </span>

            <h1>{teamName}</h1>

            <div className="team-profile-tags">
              <span>Division {team.division || "Unassigned"}</span>
              <span>{team.status || "Active"}</span>
            </div>
          </div>
        </div>

        <div className="team-profile-season">
          <span>Current season</span>
          <strong>
            {profile.season?.seasonName || "Season not available"}
          </strong>
        </div>
      </div>

      <div className="team-profile-section-heading">
        <div>
          <span>LEAGUE PERFORMANCE</span>
          <h2>Team Statistics</h2>
        </div>
      </div>

      <div className="team-performance-grid">
        <div className="team-performance-card">
          <span>Position</span>
          <strong>{standing?.position ?? "—"}</strong>
        </div>

        <div className="team-performance-card">
          <span>Played</span>
          <strong>{standing?.played ?? 0}</strong>
        </div>

        <div className="team-performance-card">
          <span>Points</span>
          <strong>{standing?.points ?? 0}</strong>
        </div>

        <div className="team-performance-card">
          <span>Won</span>
          <strong>{standing?.won ?? 0}</strong>
        </div>

        <div className="team-performance-card">
          <span>Drawn</span>
          <strong>{standing?.drawn ?? 0}</strong>
        </div>

        <div className="team-performance-card">
          <span>Lost</span>
          <strong>{standing?.lost ?? 0}</strong>
        </div>

        <div className="team-performance-card">
          <span>Goals For</span>
          <strong>{standing?.goalsFor ?? 0}</strong>
        </div>

        <div className="team-performance-card">
          <span>Goals Against</span>
          <strong>{standing?.goalsAgainst ?? 0}</strong>
        </div>

        <div className="team-performance-card">
          <span>Goal Difference</span>
          <strong>{standing?.goalDifference ?? 0}</strong>
        </div>
      </div>

      <div className="team-profile-section">
        <div className="team-profile-section-heading">
          <div>
            <span>THE SQUAD</span>
            <h2>Team Players</h2>
          </div>
          <span className="team-section-count">
            {players.length} players
          </span>
        </div>

        {players.length === 0 ? (
          <div className="team-empty-state">
            No players registered for this team yet.
          </div>
        ) : (
          <div className="team-players-grid">
            {players.map((player, index) => (
              <article
                className="team-player-card"
                key={player.playerId || `${player.fullName}-${index}`}
              >
                <div className="team-player-image">
                  {player.profileImage ? (
                    <img
                      src={player.profileImage}
                      alt={player.fullName || "Player"}
                    />
                  ) : (
                    <span>
                      {player.fullName?.charAt(0) || "P"}
                    </span>
                  )}
                </div>

                <div className="team-player-info">
                  <strong>{player.fullName || "Unnamed Player"}</strong>
                  <span>{player.position || "Position not set"}</span>
                  {player.preferredFoot && (
                    <small>{player.preferredFoot} foot</small>
                  )}
                </div>

                <div className="team-player-number">
                  {player.jerseyNumber || "—"}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="team-profile-section">
        <div className="team-profile-section-heading">
          <div>
            <span>MATCH CENTRE</span>
            <h2>Upcoming Fixtures</h2>
          </div>
          <span className="team-section-count">
            {upcoming.length}
          </span>
        </div>

        {upcoming.length === 0 ? (
          <div className="team-empty-state">
            No published upcoming fixtures for this team.
          </div>
        ) : (
          <div className="team-fixtures-grid">
            {upcoming.map((match, index) => (
              <FixtureCard key={index} match={match} />
            ))}
          </div>
        )}
      </div>

      <div className="team-profile-section">
        <div className="team-profile-section-heading">
          <div>
            <span>MATCH HISTORY</span>
            <h2>Completed Results</h2>
          </div>
          <span className="team-section-count">
            {results.length}
          </span>
        </div>

        {results.length === 0 ? (
          <div className="team-empty-state">
            No completed results available yet.
          </div>
        ) : (
          <div className="team-fixtures-grid">
            {results.map((match, index) => (
              <FixtureCard key={index} match={match} />
            ))}
          </div>
        )}
      </div>

      {(postponed.length > 0 || cancelled.length > 0) && (
        <div className="team-profile-section">
          <div className="team-profile-section-heading">
            <div>
              <span>FIXTURE UPDATES</span>
              <h2>Other Fixture Updates</h2>
            </div>
          </div>

          <div className="team-fixtures-grid">
            {[...postponed, ...cancelled].map((match, index) => (
              <FixtureCard key={index} match={match} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}