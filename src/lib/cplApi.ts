import type { User } from "firebase/auth";

const API_URL = import.meta.env.VITE_CPL_API_URL as string | undefined;

export type League = "A" | "B";
export type Team = { id: string; name: string; league: League; description: string; logo: string };
export type Season = { id: string; name: string };
export type Follow = { teamId: string; primary: boolean };
export type Preferences = { matchReminders: boolean; matchResults: boolean; transfers: boolean; news: boolean };
export type CplRole = { role: "coach" | "referee"; teamId: string; seasonId: string };
export type CplMe = { isChairman: boolean; roles: CplRole[]; follows: Follow[]; preferences: Preferences };
export type Bootstrap = { season: Season; teams: Team[]; followerCounts: Record<string, number> };

const NOT_CONFIGURED = "Chuka Premier League is not configured yet (VITE_CPL_API_URL).";

function jsonp<T>(params: Record<string, string>): Promise<T & { success: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    if (!API_URL) return reject(new Error(NOT_CONFIGURED));
    const cb = `__cpl_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const cleanup = () => { delete w[cb]; script.remove(); };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("The league service did not respond. Try again.")); }, 20000);
    w[cb] = (data: never) => { window.clearTimeout(timer); cleanup(); resolve(data); };
    script.onerror = () => { window.clearTimeout(timer); cleanup(); reject(new Error("Could not connect to the league service.")); };
    script.src = `${API_URL}?${new URLSearchParams({ ...params, callback: cb })}`;
    document.head.appendChild(script);
  });
}

async function read<T>(params: Record<string, string>): Promise<T> {
  const r = await jsonp<T>(params);
  if (!r.success) throw new Error(r.error || "Request failed.");
  return r;
}

async function post<T>(user: User, payload: Record<string, unknown>): Promise<T> {
  if (!API_URL) throw new Error(NOT_CONFIGURED);
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
    body: JSON.stringify({ ...payload, idToken }),
    redirect: "follow",
  });
  let r: T & { success?: boolean; error?: string };
  try { r = JSON.parse(await res.text()); } catch { throw new Error("The league service returned an unreadable response."); }
  if (r.success === false) throw new Error(r.error || "Request failed.");
  return r;
}

export const cplApi = {
  bootstrap: () => read<Bootstrap>({ action: "bootstrap" }),
  me: (u: User) => post<CplMe>(u, { action: "cpl_me" }),
  follow: (u: User, teamId: string) => post<{ follows: Follow[] }>(u, { action: "follow_team", teamId }).then(r => r.follows),
  unfollow: (u: User, teamId: string) => post<{ follows: Follow[] }>(u, { action: "unfollow_team", teamId }).then(r => r.follows),
  setPrimary: (u: User, teamId: string) => post<{ follows: Follow[] }>(u, { action: "set_primary_team", teamId }).then(r => r.follows),
  savePreferences: (u: User, p: Preferences) => post<{ preferences: Preferences }>(u, { action: "save_preferences", ...p }).then(r => r.preferences),
  // Chairman only (the server enforces this)
  saveTeam: (u: User, body: { teamId?: string; name: string; league: League; description: string }) => post<{ teamId: string }>(u, { action: "save_team", ...body }),
  removeTeam: (u: User, teamId: string) => post(u, { action: "remove_team", teamId }),
  startSeason: (u: User, name: string) => post(u, { action: "start_season", name }),
};
