
const CPL_API_URL =
  "https://script.google.com/macros/s/AKfycbxfMTbxOqkApmebQmUcFDFH_3wCeputbmDJph49clFWDkdC5lopUAaRzgQrIG3456kj/exec";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/* =========================================================
   PUBLIC API
========================================================= */

async function getRequest<T = unknown>(
  action: string,
  params: Record<string, string> = {}
): Promise<T> {
  const query = new URLSearchParams({
    action,
    ...params,
  });

  const response = await fetch(`${CPL_API_URL}?${query.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`CPL API request failed: ${response.status}`);
  }

  const result = await response.json() as ApiResponse<T>;

  if (!result.success) {
    throw new Error(
      result.message || result.error || "CPL API request failed."
    );
  }

  if ("data" in result) {
    return result.data as T;
  }

  return result as T;
}

/* =========================================================
   SECURE CHAIRMAN API
========================================================= */

async function postRequest<T = unknown>(
  action: string,
  idToken: string,
  payload: Record<string, unknown>
): Promise<T> {
  if (!idToken || !idToken.trim()) {
    throw new Error("Your login session is invalid. Please sign in again.");
  }

  const response = await fetch(CPL_API_URL, {
    method: "POST",

    // text/plain avoids a browser JSON preflight request.
    // Apps Script still receives the JSON request body.
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },

    body: JSON.stringify({
      action,
      idToken,
      ...payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`CPL API request failed: ${response.status}`);
  }

  const result = await response.json() as ApiResponse<T>;

  if (!result.success) {
    throw new Error(
      result.message || result.error || "Chairman operation failed."
    );
  }

  return result.data as T;
}

/* =========================================================
   SEASON TYPES AND CREATION
========================================================= */

export interface CreateSeasonData {
  seasonName: string;
  posterImage?: string;
  expectedStartDate: string;
  expectedEndDate: string;
  seasonTransferOpen: string;
  seasonTransferClose: string;
  midSeasonTransferOpen: string;
  midSeasonTransferClose: string;
}

export interface CreatedSeason {
  seasonId: string;
  seasonName: string;
}

/**
 * Create a new CPL season.
 *
 * All dates must use DD/MM/YYYY format.
 * Requires a Firebase ID token from the signed-in Chairman.
 */
export async function createCplSeason(
  idToken: string,
  seasonData: CreateSeasonData
): Promise<CreatedSeason> {
  return postRequest<CreatedSeason>(
    "createCplSeason",
    idToken,
    { seasonData }
  );
}

/* =========================================================
   TEAM TYPES AND CREATION
========================================================= */

export interface CreateTeamData {
  teamName: string;
  teamLogo?: string;
  teamTag: string;
  coachEmail?: string;
  division: "A" | "B";
  status: "Active" | "Inactive";
}

export interface CreatedTeam {
  teamId: string;
  teamName: string;
}

/**
 * Create a new CPL team.
 *
 * The Apps Script backend also creates the team's
 * Google Drive workspace and Players spreadsheet.
 */
export async function createCplTeam(
  idToken: string,
  teamData: CreateTeamData
): Promise<CreatedTeam> {
  return postRequest<CreatedTeam>(
    "createCplTeam",
    idToken,
    { teamData }
  );
}

/* =========================================================
   EXISTING PUBLIC METHODS
========================================================= */

/** Get the currently active CPL season. */
export async function getActiveSeason() {
  return getRequest("activeSeason");
}

/** Get all public active CPL teams. */
export async function getPublicTeams() {
  return getRequest("teams");
}

/** Get one public team. */
export async function getPublicTeam(teamId: string) {
  return getRequest("team", { teamId });
}

/** Get the complete public team profile. */
export async function getPublicTeamProfile(teamId: string) {
  return getRequest("teamProfile", { teamId });
}

/** Get public players for a team through its combined profile. */
export async function getPublicTeamPlayers(teamId: string) {
  const profile = await getPublicTeamProfile(teamId);

  return (profile as { players?: unknown[] }).players || [];
}

/** Get published fixtures for a division. */
export async function getPublicFixtures(
  seasonId: string,
  division: "A" | "B"
) {
  return getRequest("fixtures", { seasonId, division });
}

/** Get all public matches for a team. */
export async function getPublicTeamMatches(teamId: string) {
  return getRequest("teamMatches", { teamId });
}

/** Get public standings for a division. */
export async function getPublicStandings(
  seasonId: string,
  division: "A" | "B"
) {
  return getRequest("standings", { seasonId, division });
}

/* =========================================================
   CENTRAL CPL API EXPORT
========================================================= */

export const cplApi = {
  // Chairman operations
  createCplSeason,
  createCplTeam,

  // Public operations
  getActiveSeason,
  getPublicTeams,
  getPublicTeam,
  getPublicTeamProfile,
  getPublicTeamPlayers,
  getPublicFixtures,
  getPublicTeamMatches,
  getPublicStandings,
};
