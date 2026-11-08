import { useEffect, useState } from "react";
import {
  getActiveSeason,
  getPublicTeams,
} from "../services/cplApi";
import type {
  CplSeason,
  CplTeam,
  CplTeamsResponse,
} from "../types";

export default function Home() {
  const [season, setSeason] = useState<CplSeason | null>(null);
  const [teams, setTeams] = useState<CplTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadHomeData() {
      try {
        setLoading(true);

        const [seasonData, teamsData] = await Promise.all([
          getActiveSeason(),
          getPublicTeams(),
        ]);

        setSeason(seasonData as CplSeason);

        const response = teamsData as CplTeamsResponse;
        setTeams(response.teams || []);
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load CPL data."
        );
      } finally {
        setLoading(false);
      }
    }

    loadHomeData();
  }, []);

  if (loading) {
    return (
      <section className="cpl-v2-page">
        <div className="cpl-v2-loading">
          <h2>Chuka Premier League</h2>
          <p>Loading CPL data...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="cpl-v2-page">
        <div className="cpl-v2-error">
          <h2>Unable to load CPL</h2>
          <p>{error}</p>

          <button onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  const divisionACount = teams.filter(
    (team) => team.division === "A"
  ).length;

  const divisionBCount = teams.filter(
    (team) => team.division === "B"
  ).length;

  return (
    <section className="cpl-v2-page">

      <section className="cpl-v2-hero">
        <div className="cpl-v2-hero-content">
          <span className="cpl-v2-eyebrow">
            CHUKA PREMIER LEAGUE
          </span>

          <h1>
            The home of
            <br />
            CPL football.
          </h1>

          <p>
            Follow teams, fixtures, standings, results and
            the CPL Cup from one official platform.
          </p>

          {season && (
            <div className="cpl-v2-season">
              <span>ACTIVE SEASON</span>

              <strong>
                {season.seasonName || season.seasonId}
              </strong>
            </div>
          )}
        </div>
      </section>

      <section className="cpl-v2-stats">

        <div className="cpl-v2-stat-card">
          <span>ACTIVE TEAMS</span>
          <strong>{teams.length}</strong>
        </div>

        <div className="cpl-v2-stat-card">
          <span>DIVISION A</span>
          <strong>{divisionACount}</strong>
        </div>

        <div className="cpl-v2-stat-card">
          <span>DIVISION B</span>
          <strong>{divisionBCount}</strong>
        </div>

      </section>

      <section className="cpl-v2-section">

        <div className="cpl-v2-section-heading">
          <div>
            <span>COMPETITION</span>
            <h2>Teams</h2>
          </div>

          <p>
            {teams.length} active teams
          </p>
        </div>

        <div className="cpl-v2-team-grid">

          {teams.map((team) => (
            <article
              key={team.teamId}
              className="cpl-v2-team-card"
            >

              <div className="cpl-v2-team-logo">

                {team.logo ? (
                  <img
                    src={team.logo}
                    alt={`${team.teamName} logo`}
                  />
                ) : (
                  <span>
                    {team.teamName.charAt(0)}
                  </span>
                )}

              </div>

              <div className="cpl-v2-team-info">

                <h3>{team.teamName}</h3>

                <p>
                  Division {team.division}
                </p>

                <small>
                  {team.status}
                </small>

              </div>

            </article>
          ))}

        </div>

      </section>

    </section>
  );
}