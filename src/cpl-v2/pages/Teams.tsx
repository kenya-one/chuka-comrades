
import { useEffect, useMemo, useState } from "react";
import { cplApi } from "../services/cplApi";
import "./Teams.css";

interface Team {
  teamId?: string;
  teamName?: string;
  teamLogo?: string;
  teamTag?: string;
  division?: string;
  status?: string;

  "Team ID"?: string;
  "Team Name"?: string;
  "Team Logo"?: string;
  "Team Tag"?: string;
  Division?: string;
  Status?: string;
}

interface TeamsProps {
  onSelectTeam: (teamId: string, teamName: string) => void;
}

function getTeamName(team: Team) {
  return team.teamName || team["Team Name"] || "Unnamed Team";
}

function getTeamId(team: Team, index: number) {
  return team.teamId || team["Team ID"] || `team-${index}`;
}

function getTeamLogo(team: Team) {
  return team.teamLogo || team["Team Logo"] || "";
}

function getTeamTag(team: Team) {
  return team.teamTag || team["Team Tag"] || "";
}

function getDivision(team: Team) {
  return team.division || team.Division || "";
}

function getStatus(team: Team) {
  return team.status || team.Status || "Active";
}

export default function Teams({ onSelectTeam }: TeamsProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [division, setDivision] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTeams() {
      try {
        setLoading(true);
        setError("");

        const result = await cplApi.getPublicTeams();

        if (!active) return;

        const response = result as
          | Team[]
          | { teams?: Team[] };

        const data = Array.isArray(response)
          ? response
          : response?.teams ?? [];

        setTeams(data);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load CPL teams."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTeams();

    return () => {
      active = false;
    };
  }, []);

  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      const name = getTeamName(team);
      const teamDivision = getDivision(team);

      const matchesSearch = name
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      const matchesDivision =
        division === "All" || teamDivision === division;

      return matchesSearch && matchesDivision;
    });
  }, [teams, search, division]);

  const divisionACount = teams.filter(
    (team) => getDivision(team) === "A"
  ).length;

  const divisionBCount = teams.filter(
    (team) => getDivision(team) === "B"
  ).length;

  return (
    <section className="cpl-v2-page cpl-teams-page">
      <div className="teams-hero">
        <div>
          <span className="teams-eyebrow">
            CPL COMPETITION
          </span>

          <h1>Meet the Teams</h1>

          <p>
            Discover the clubs competing in the Chuka Premier
            League. Explore the teams and follow their journey.
          </p>
        </div>

        <div className="teams-total">
          <strong>{teams.length}</strong>
          <span>Active Teams</span>
        </div>
      </div>

      <div className="teams-stat-grid">
        <div className="teams-stat-card">
          <span>Total Teams</span>
          <strong>{teams.length}</strong>
        </div>

        <div className="teams-stat-card">
          <span>Division A</span>
          <strong>{divisionACount}</strong>
        </div>

        <div className="teams-stat-card">
          <span>Division B</span>
          <strong>{divisionBCount}</strong>
        </div>
      </div>

      <div className="teams-toolbar">
        <div className="teams-search">
          <span>⌕</span>

          <input
            type="search"
            placeholder="Search for a team..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="teams-filters">
          {["All", "A", "B"].map((item) => (
            <button
              key={item}
              type="button"
              className={division === item ? "active" : ""}
              onClick={() => setDivision(item)}
            >
              {item === "All"
                ? "All Divisions"
                : `Division ${item}`}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="teams-message">
          Loading CPL teams...
        </div>
      )}

      {error && (
        <div className="teams-error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="teams-results-heading">
            <h2>
              {division === "All"
                ? "All Clubs"
                : `Division ${division}`}
            </h2>

            <span>{filteredTeams.length} teams found</span>
          </div>

          {filteredTeams.length === 0 ? (
            <div className="teams-message">
              No teams match your search.
            </div>
          ) : (
            <div className="cpl-teams-grid">
              {filteredTeams.map((team, index) => {
                const name = getTeamName(team);
                const id = getTeamId(team, index);
                const logo = getTeamLogo(team);
                const tag = getTeamTag(team);
                const teamDivision = getDivision(team);
                const status = getStatus(team);

                return (
                  <button
                    type="button"
                    className="cpl-team-card cpl-team-card-clickable"
                    key={id}
                    onClick={() => onSelectTeam(id, name)}
                    aria-label={`View ${name} team profile`}
                  >
                    <div className="team-card-top">
                      <div className="team-logo-wrap">
                        {logo ? (
                          <img
                            src={logo}
                            alt={`${name} logo`}
                            className="cpl-team-logo"
                          />
                        ) : (
                          <div className="cpl-team-logo-placeholder">
                            {tag || name.charAt(0)}
                          </div>
                        )}
                      </div>

                      <span className="team-status">
                        <span className="status-dot" />
                        {status}
                      </span>
                    </div>

                    <div className="team-card-info">
                      <h3>{name}</h3>

                      <div className="team-card-bottom">
                        <span className="team-division">
                          Division {teamDivision || "Unassigned"}
                        </span>

                        <span className="team-card-arrow">
                          →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
