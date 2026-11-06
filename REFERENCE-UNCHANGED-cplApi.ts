import type { User } from "firebase/auth";

const API_URL = import.meta.env.VITE_CPL_API_URL as string | undefined;

export type League = "A" | "B";
export type CplRole = "fan" | "player" | "coach" | "referee" | "chairman";

export type Team = {
  id: string; name: string; league: League; description: string; logo: string;
};
export type Season = { id: string; name: string; status?: string; startDate?: string; endDate?: string };
export type Fixture = {
  id: string; seasonId: string; competitionId?: string; roundName?: string; league: string;
  homeTeamId: string; awayTeamId: string; homeTeamName: string; awayTeamName: string;
  venue: string; kickoffAt: string; lineupDeadlineAt: string; refereeUid: string; status: string;
  result?: { homeScore: number; awayScore: number } | null;
};
export type StandingRow = {
  teamId: string; team: string; league: League; played: number; wins: number; draws: number;
  losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
};
export type Competition = { id: string; name: string; type: string; status: string; startDate?: string; rules?: string; teams: any[]; rounds: any[]; fixtures: any[] };
export type PlayerStat = { playerId: string; name: string; teamId: string; value: number };

export type Bootstrap = {
  season: Season;
  teams: Team[];
  fixtures: Fixture[];
  results: Array<{fixtureId:string;homeScore:number;awayScore:number;events:any[];status:string;verifiedAt:string}>;
  standings: Array<{league:League;rows:StandingRow[]}>;
  topScorers: PlayerStat[];
  topAssists: PlayerStat[];
  competitions: Competition[];
  news: Array<Record<string, string>>;
};

export type CplMe = {
  uid:string; email:string; displayName:string; photoUrl:string; activeRole:CplRole; isChairman:boolean;
  roles:Array<Record<string,string>>; roleRequests:Array<Record<string,string>>; follows:Array<Record<string,string>>;
  playerApplications:Array<Record<string,string>>; assignedTeams:Array<Record<string,string>>;
  assignedFixtures:Array<Record<string,string>>; pendingReports:Array<Record<string,string>>;
  pendingTransfers:Array<Record<string,string>>; collections:Array<Record<string,string>>;
  teamGroups:Array<Record<string,string>>; players:Array<Record<string,string>>;
};

type ApiEnvelope<T> = { success:boolean; data?:T; error?:string };

function jsonp<T>(params:Record<string,string>):Promise<ApiEnvelope<T>> {
  return new Promise((resolve,reject)=>{
    if(!API_URL) return reject(new Error("CPL backend is not configured. Set VITE_CPL_API_URL."));
    const cb=`__cpl_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
    const w=window as unknown as Record<string,unknown>;
    const script=document.createElement("script");
    const cleanup=()=>{delete w[cb];script.remove();};
    const timer=window.setTimeout(()=>{cleanup();reject(new Error("CPL service timed out."));},20000);
    w[cb]=(data:ApiEnvelope<T>)=>{window.clearTimeout(timer);cleanup();resolve(data);};
    script.onerror=()=>{window.clearTimeout(timer);cleanup();reject(new Error("Could not connect to CPL service."));};
    script.src=`${API_URL}?${new URLSearchParams({...params,callback:cb})}`;
    document.head.appendChild(script);
  });
}

async function read<T>(params:Record<string,string>):Promise<T>{
  const r=await jsonp<T>(params); if(!r.success) throw new Error(r.error||"CPL request failed."); return r.data as T;
}

async function post<T>(user:User,payload:Record<string,unknown>):Promise<T>{
  if(!API_URL) throw new Error("CPL backend is not configured. Set VITE_CPL_API_URL.");
  const idToken=await user.getIdToken();
  const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,idToken})});
  const r=await res.json() as ApiEnvelope<T>;
  if(!res.ok||r.success===false) throw new Error(r.error||"CPL request failed.");
  return r.data as T;
}

export const cplApi={
  configured:()=>Boolean(API_URL),
  bootstrap:()=>read<Bootstrap>({action:"bootstrap"}),
  team:(teamId:string)=>read<any>({action:"public_team",teamId}),
  fixture:(fixtureId:string)=>read<any>({action:"public_fixture",fixtureId}),
  competitions:()=>read<Competition[]>({action:"public_competitions"}),
  me:(u:User)=>post<{me:CplMe}>(u,{action:"cpl_me"}).then(x=>x.me),
  action:<T=Record<string,unknown>>(u:User,action:string,body:Record<string,unknown>={})=>post<T>(u,{action,...body}),
};
