import { useState } from "react";
import type { User } from "firebase/auth";
import {
  createCplSeason,
  createCplTeam,
  type CreateSeasonData,
  type CreateTeamData,
} from "../services/cplApi";

interface ChairmanDashboardProps {
  user: User;
  onBack: () => void;
}

function formatDateForCpl(date: string): string {
  if (!date) return "";

  const [year, month, day] = date.split("-");

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

export default function ChairmanDashboard({
  user,
  onBack,
}: ChairmanDashboardProps) {
  const chairmanEmail = "sidneywafula30@gmail.com";

  const isChairman =
    user.email?.trim().toLowerCase() === chairmanEmail;

  const [activeSection, setActiveSection] = useState<
    "none" | "season" | "team"
  >("none");

  const [seasonForm, setSeasonForm] = useState<CreateSeasonData>({
    seasonName: "",
    posterImage: "",
    expectedStartDate: "",
    expectedEndDate: "",
    seasonTransferOpen: "",
    seasonTransferClose: "",
    midSeasonTransferOpen: "",
    midSeasonTransferClose: "",
  });

  const [teamForm, setTeamForm] = useState<CreateTeamData>({
    teamName: "",
    teamLogo: "",
    teamTag: "",
    coachEmail: "",
    division: "A",
    status: "Active",
  });

  const [seasonBusy, setSeasonBusy] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);

  const [seasonMessage, setSeasonMessage] = useState("");
  const [teamMessage, setTeamMessage] = useState("");

  const [seasonError, setSeasonError] = useState("");
  const [teamError, setTeamError] = useState("");

  if (!isChairman) {
    return (
      <section className="cpl-chairman-dashboard">
        <h1>Access Restricted</h1>

        <p>
          This dashboard is reserved for the CPL Chairman.
        </p>

        <button type="button" onClick={onBack}>
          Back to CPL
        </button>
      </section>
    );
  }

  async function handleCreateSeason() {
    setSeasonMessage("");
    setSeasonError("");

    if (!seasonForm.seasonName.trim()) {
      setSeasonError("Season name is required.");
      return;
    }

    const requiredDates = [
      seasonForm.expectedStartDate,
      seasonForm.expectedEndDate,
      seasonForm.seasonTransferOpen,
      seasonForm.seasonTransferClose,
      seasonForm.midSeasonTransferOpen,
      seasonForm.midSeasonTransferClose,
    ];

    if (requiredDates.some((date) => !date)) {
      setSeasonError("All season and transfer-window dates are required.");
      return;
    }

    try {
      setSeasonBusy(true);

      const idToken = await user.getIdToken();

      const payload: CreateSeasonData = {
        ...seasonForm,
        seasonName: seasonForm.seasonName.trim(),
        posterImage: seasonForm.posterImage?.trim() || "",
        expectedStartDate: formatDateForCpl(
          seasonForm.expectedStartDate
        ),
        expectedEndDate: formatDateForCpl(
          seasonForm.expectedEndDate
        ),
        seasonTransferOpen: formatDateForCpl(
          seasonForm.seasonTransferOpen
        ),
        seasonTransferClose: formatDateForCpl(
          seasonForm.seasonTransferClose
        ),
        midSeasonTransferOpen: formatDateForCpl(
          seasonForm.midSeasonTransferOpen
        ),
        midSeasonTransferClose: formatDateForCpl(
          seasonForm.midSeasonTransferClose
        ),
      };

      const result = await createCplSeason(
        idToken,
        payload
      );

      setSeasonMessage(
        `Season created successfully. Season ID: ${result.seasonId}`
      );

      setSeasonForm({
        seasonName: "",
        posterImage: "",
        expectedStartDate: "",
        expectedEndDate: "",
        seasonTransferOpen: "",
        seasonTransferClose: "",
        midSeasonTransferOpen: "",
        midSeasonTransferClose: "",
      });
    } catch (error) {
      setSeasonError(
        error instanceof Error
          ? error.message
          : "Unable to create the season."
      );
    } finally {
      setSeasonBusy(false);
    }
  }

  async function handleCreateTeam() {
    setTeamMessage("");
    setTeamError("");

    if (!teamForm.teamName.trim()) {
      setTeamError("Team name is required.");
      return;
    }

    if (!teamForm.teamTag.trim()) {
      setTeamError("Team tag is required.");
      return;
    }

    if (!teamForm.division) {
      setTeamError("Division is required.");
      return;
    }

    try {
      setTeamBusy(true);

      const idToken = await user.getIdToken();

      const payload: CreateTeamData = {
        teamName: teamForm.teamName.trim(),
        teamLogo: teamForm.teamLogo?.trim() || "",
        teamTag: teamForm.teamTag.trim(),
        coachEmail: teamForm.coachEmail?.trim() || "",
        division: teamForm.division,
        status: teamForm.status,
      };

      const result = await createCplTeam(
        idToken,
        payload
      );

      setTeamMessage(
        `Team created successfully. Team ID: ${result.teamId}`
      );

      setTeamForm({
        teamName: "",
        teamLogo: "",
        teamTag: "",
        coachEmail: "",
        division: "A",
        status: "Active",
      });
    } catch (error) {
      setTeamError(
        error instanceof Error
          ? error.message
          : "Unable to create the team."
      );
    } finally {
      setTeamBusy(false);
    }
  }

  return (
    <section className="cpl-chairman-dashboard">
      <div className="cpl-chairman-heading">
        <div>
          <span>CPL MANAGEMENT</span>

          <h1>Chairman Dashboard</h1>

          <p>
            Welcome, {user.displayName || "Chairman"}.
          </p>
        </div>

        <button type="button" onClick={onBack}>
          ← Back to CPL
        </button>
      </div>

      <div className="cpl-chairman-welcome">
        <h2>Chuka Premier League Control Centre</h2>

        <p>
          Manage CPL seasons, teams, fixtures, referees,
          transfers, cup competitions and announcements.
        </p>
      </div>

      <div className="cpl-chairman-modules">

        <article>
          <h3>Season Management</h3>

          <p>
            Create and manage CPL seasons.
          </p>

          <button
            type="button"
            onClick={() => {
              setActiveSection(
                activeSection === "season"
                  ? "none"
                  : "season"
              );

              setSeasonMessage("");
              setSeasonError("");
            }}
          >
            {activeSection === "season"
              ? "Close"
              : "Create New Season"}
          </button>
        </article>

        <article>
          <h3>Team Management</h3>

          <p>
            Add teams and manage league participation.
          </p>

          <button
            type="button"
            onClick={() => {
              setActiveSection(
                activeSection === "team"
                  ? "none"
                  : "team"
              );

              setTeamMessage("");
              setTeamError("");
            }}
          >
            {activeSection === "team"
              ? "Close"
              : "Add New Team"}
          </button>
        </article>

        <article>
          <h3>Fixture Management</h3>

          <p>
            Create, edit and publish fixtures.
          </p>
        </article>

        <article>
          <h3>Referee Management</h3>

          <p>
            Manage referee registrations and assignments.
          </p>
        </article>

        <article>
          <h3>Transfers</h3>

          <p>
            Manage player transfers and transfer windows.
          </p>
        </article>

        <article>
          <h3>CPL Cup</h3>

          <p>
            Manage cup rounds and match schedules.
          </p>
        </article>

      </div>

      {/* =====================================================
          CREATE SEASON
      ===================================================== */}

      {activeSection === "season" && (
        <div className="cpl-chairman-form">

          <h2>Create New CPL Season</h2>

          <p>
            Enter the official season information below.
          </p>

          <div>
            <label htmlFor="seasonName">
              Season Name
            </label>

            <input
              id="seasonName"
              type="text"
              placeholder="e.g. CPL 2026/2027"
              value={seasonForm.seasonName}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  seasonName: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="seasonPoster">
              Poster Image URL
            </label>

            <input
              id="seasonPoster"
              type="url"
              placeholder="https://..."
              value={seasonForm.posterImage}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  posterImage: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="seasonStart">
              Expected Start Date
            </label>

            <input
              id="seasonStart"
              type="date"
              value={seasonForm.expectedStartDate}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  expectedStartDate: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="seasonEnd">
              Expected End Date
            </label>

            <input
              id="seasonEnd"
              type="date"
              value={seasonForm.expectedEndDate}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  expectedEndDate: event.target.value,
                })
              }
            />
          </div>

          <h3>Season Transfer Window</h3>

          <div>
            <label htmlFor="seasonTransferOpen">
              Opens
            </label>

            <input
              id="seasonTransferOpen"
              type="date"
              value={seasonForm.seasonTransferOpen}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  seasonTransferOpen: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="seasonTransferClose">
              Closes
            </label>

            <input
              id="seasonTransferClose"
              type="date"
              value={seasonForm.seasonTransferClose}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  seasonTransferClose: event.target.value,
                })
              }
            />
          </div>

          <h3>Mid-Season Transfer Window</h3>

          <div>
            <label htmlFor="midSeasonTransferOpen">
              Opens
            </label>

            <input
              id="midSeasonTransferOpen"
              type="date"
              value={seasonForm.midSeasonTransferOpen}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  midSeasonTransferOpen: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="midSeasonTransferClose">
              Closes
            </label>

            <input
              id="midSeasonTransferClose"
              type="date"
              value={seasonForm.midSeasonTransferClose}
              onChange={(event) =>
                setSeasonForm({
                  ...seasonForm,
                  midSeasonTransferClose: event.target.value,
                })
              }
            />
          </div>

          {seasonError && (
            <p role="alert">
              {seasonError}
            </p>
          )}

          {seasonMessage && (
            <p role="status">
              {seasonMessage}
            </p>
          )}

          <button
            type="button"
            onClick={handleCreateSeason}
            disabled={seasonBusy}
          >
            {seasonBusy
              ? "Creating Season..."
              : "Create Season"}
          </button>

        </div>
      )}

      {/* =====================================================
          CREATE TEAM
      ===================================================== */}

      {activeSection === "team" && (
        <div className="cpl-chairman-form">

          <h2>Add New CPL Team</h2>

          <p>
            Register a new team and automatically create
            its Google Drive workspace.
          </p>

          <div>
            <label htmlFor="teamName">
              Team Name
            </label>

            <input
              id="teamName"
              type="text"
              placeholder="e.g. Chuka United"
              value={teamForm.teamName}
              onChange={(event) =>
                setTeamForm({
                  ...teamForm,
                  teamName: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="teamLogo">
              Team Logo URL
            </label>

            <input
              id="teamLogo"
              type="url"
              placeholder="https://..."
              value={teamForm.teamLogo}
              onChange={(event) =>
                setTeamForm({
                  ...teamForm,
                  teamLogo: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="teamTag">
              Team Tag
            </label>

            <input
              id="teamTag"
              type="text"
              placeholder="e.g. CHU"
              maxLength={12}
              value={teamForm.teamTag}
              onChange={(event) =>
                setTeamForm({
                  ...teamForm,
                  teamTag: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="coachEmail">
              Coach Email
            </label>

            <input
              id="coachEmail"
              type="email"
              placeholder="coach@example.com"
              value={teamForm.coachEmail}
              onChange={(event) =>
                setTeamForm({
                  ...teamForm,
                  coachEmail: event.target.value,
                })
              }
            />
          </div>

          <div>
            <label htmlFor="teamDivision">
              Division
            </label>

            <select
              id="teamDivision"
              value={teamForm.division}
              onChange={(event) =>
                setTeamForm({
                  ...teamForm,
                  division: event.target.value as "A" | "B",
                })
              }
            >
              <option value="A">
                Division A
              </option>

              <option value="B">
                Division B
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="teamStatus">
              Status
            </label>

            <select
              id="teamStatus"
              value={teamForm.status}
              onChange={(event) =>
                setTeamForm({
                  ...teamForm,
                  status: event.target.value as
                    | "Active"
                    | "Inactive",
                })
              }
            >
              <option value="Active">
                Active
              </option>

              <option value="Inactive">
                Inactive
              </option>
            </select>
          </div>

          {teamError && (
            <p role="alert">
              {teamError}
            </p>
          )}

          {teamMessage && (
            <p role="status">
              {teamMessage}
            </p>
          )}

          <button
            type="button"
            onClick={handleCreateTeam}
            disabled={teamBusy}
          >
            {teamBusy
              ? "Creating Team..."
              : "Create Team"}
          </button>

        </div>
      )}

      <p className="cpl-chairman-note">
        Chairman management actions are secured through
        Firebase authentication and the CPL Apps Script backend.
      </p>
    </section>
  );
}