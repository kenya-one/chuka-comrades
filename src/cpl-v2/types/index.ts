export type CplDivision = "A" | "B";

export type CplTeamStatus = "Active" | "Inactive";

export interface CplSeason {
  seasonId: string;
  seasonName: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

export interface CplTeam {
  teamId: string;
  teamName: string;
  division: CplDivision;
  status: CplTeamStatus;
  logo?: string;
  coachName?: string;
  coachEmail?: string;
}

export interface CplPlayer {
  playerId: string;
  fullName: string;
  profileImage?: string;
  position?: string;
  jerseyNumber?: number | string;
  preferredFoot?: string;
}

export interface CplFixture {
  fixtureId?: string;
  seasonId?: string;
  division?: CplDivision;

  homeTeamId?: string;
  homeTeamName?: string;

  awayTeamId?: string;
  awayTeamName?: string;

  venue?: string;
  matchDate?: string;
  matchTime?: string;

  status?: string;
  published?: boolean;
}

export interface CplStanding {
  position: number;
  teamId: string;
  teamName: string;

  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;

  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;

  points?: number;
}

export interface CplTeamMatches {
  teamId: string;
  teamName?: string;

  matches: CplFixture[];
  upcomingFixtures: CplFixture[];
  postponedFixtures: CplFixture[];
  cancelledFixtures: CplFixture[];
  completedResults: CplFixture[];
}

export interface CplTeamsResponse {
  teams: CplTeam[];
  divisionA: CplTeam[];
  divisionB: CplTeam[];

  divisionACount: number;
  divisionBCount: number;
  totalTeams: number;
}