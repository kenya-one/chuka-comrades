import type { User } from "firebase/auth";

const API_URL = import.meta.env.VITE_GAMES_API_URL as string | undefined;

export type Availability = { day: string; start: string; end: string };
export type Settings = { activationFee: number; mpesaTill: string; adminWhatsApp: string };
export type Player = { id: string; username: string; image: string; imageId?: string; course: string; year: string; availability: Availability[] };
export type PoolPlayer = { id: string; name: string; points: string; course: string; year: string; availability: Availability[] };
export type Tournament = {
  id: string; game: "eFootball" | "Pool"; name: string; course: string; year: string; date: string; time: string;
  max: number; registered: number; description: string; poster: string; posterId?: string; organizer: string; organizerWhatsApp: string;
  hasRoom: boolean; poolPointId: string; status: "open" | "full" | "completed"; winner: string; expiresAt: string;
};
export type Listing = { id: string; username: string; image: string; imageId?: string; description: string; price: number; status: string; created: string };
export type PoolPoint = { id: string; name: string; image: string; imageId?: string; location: string; mapsUrl: string; description: string; status?: string; managerName?: string; managerWhatsApp?: string };
export type Me = {
  isAdmin: boolean;
  user: { course: string; year: string; whatsapp: string; activation: "inactive" | "pending" | "active"; profile: string };
  efootball: { username: string; image: string } | null;
  pool: { name: string; points: string } | null;
  availability: Availability[];
  lastPayment: { status: string; code: string } | null;
};
export type MyTournament = { id: string; name: string; game: string; status: string; room: string; winner: string; participants: { id: string; name: string; whatsapp: string }[] };

function jsonp<T>(params: Record<string, string>): Promise<T & { success: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    if (!API_URL) return reject(new Error("Games service is not configured (VITE_GAMES_API_URL)."));
    const cb = `__games_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const cleanup = () => { delete w[cb]; script.remove(); };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("The games service did not respond. Try again.")); }, 20000);
    w[cb] = (data: never) => { window.clearTimeout(timer); cleanup(); resolve(data); };
    script.onerror = () => { window.clearTimeout(timer); cleanup(); reject(new Error("Could not connect to the games service.")); };
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
  if (!API_URL) throw new Error("Games service is not configured (VITE_GAMES_API_URL).");
  const idToken = await user.getIdToken(true);
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
    body: JSON.stringify({ ...payload, idToken }),
    redirect: "follow",
  });
  let r: T & { success?: boolean; error?: string };
  try { r = JSON.parse(await res.text()); } catch { throw new Error("The games service returned an unreadable response."); }
  if (r.success === false) throw new Error(r.error || "Request failed.");
  return r;
}

/** Resize to <=1400px JPEG so uploads stay small, then base64 for Apps Script. */
async function prepareImage(file: File): Promise<{ mime: string; data: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { mime: "image/jpeg", data: dataUrl.split(",")[1] };
}

export const gamesApi = {
  settings: () => read<{ settings: Settings }>({ action: "bootstrap" }).then(r => r.settings),
  players: () => read<{ players: Player[] }>({ action: "players" }).then(r => r.players),
  poolPlayers: () => read<{ players: PoolPlayer[] }>({ action: "pool_players" }).then(r => r.players),
  tournaments: (game?: string) => read<{ tournaments: Tournament[] }>({ action: "tournaments", ...(game ? { game } : {}) }).then(r => r.tournaments),
  tournament: (id: string) => read<{ tournament: Tournament | null }>({ action: "tournament", id }).then(r => r.tournament),
  market: () => read<{ listings: Listing[] }>({ action: "market" }).then(r => r.listings),
  marketItem: (id: string) => read<{ listing: Listing | null }>({ action: "market_item", id }).then(r => r.listing),
  poolPoints: () => read<{ points: PoolPoint[] }>({ action: "pool_points" }).then(r => r.points),

  me: (u: User) => post<Me>(u, { action: "get_me" }),
  saveProfile: (u: User, body: Record<string, unknown>) => post(u, { action: "save_profile", ...body }),
  submitActivation: (u: User, mpesaCode: string) => post(u, { action: "submit_activation", mpesaCode }),
  contact: (u: User, kind: "player" | "pool" | "market", id: string) => post<{ whatsapp: string }>(u, { action: "get_contact", kind, id }),
  room: (u: User, id: string) => post<{ room: string }>(u, { action: "get_room", id }),

  upload: async (u: User, file: File, folder: "players" | "market" | "tournaments" | "pool") => {
    const img = await prepareImage(file);
    return post<{ fileId: string; url: string }>(u, { action: "upload_image", folder, ...img });
  },

  createTournament: (u: User, body: Record<string, unknown>) => post<{ id: string }>(u, { action: "create_tournament", ...body }),
  myTournaments: (u: User) => post<{ tournaments: MyTournament[] }>(u, { action: "my_tournaments" }).then(r => r.tournaments),
  addParticipant: (u: User, id: string, name: string, whatsapp: string) => post(u, { action: "add_participant", id, name, whatsapp }),
  removeParticipant: (u: User, id: string, participantId: string) => post(u, { action: "remove_participant", id, participantId }),
  setRoom: (u: User, id: string, room: string) => post(u, { action: "set_room", id, room }),
  setRegistration: (u: User, id: string, open: boolean) => post(u, { action: "set_registration", id, open }),
  declareWinner: (u: User, id: string, winner: string) => post(u, { action: "declare_winner", id, winner }),

  createListing: (u: User, body: Record<string, unknown>) => post<{ id: string }>(u, { action: "create_listing", ...body }),
  myListings: (u: User) => post<{ listings: { id: string; price: number; status: string; description: string }[] }>(u, { action: "my_listings" }).then(r => r.listings),
  markSold: (u: User, id: string) => post(u, { action: "mark_sold", id }),

  adminPayments: (u: User) => post<{ payments: { id: string; email: string; code: string; amount: string; at: string }[] }>(u, { action: "admin_payments" }).then(r => r.payments),
  adminReviewPayment: (u: User, id: string, approve: boolean) => post(u, { action: "admin_review_payment", id, approve }),
  adminPoolPoints: (u: User) => post<{ points: PoolPoint[] }>(u, { action: "admin_pool_points" }).then(r => r.points),
  adminSavePoolPoint: (u: User, body: Record<string, unknown>) => post(u, { action: "admin_save_pool_point", ...body }),
  adminRemoveListing: (u: User, id: string) => post(u, { action: "admin_remove_listing", id }),
  adminRemoveTournament: (u: User, id: string) => post(u, { action: "admin_remove_tournament", id }),
};

/* ---------- WhatsApp / share helpers ---------- */

export function waNumber(raw: string): string {
  let n = raw.replace(/\D/g, "");
  if (n.startsWith("0")) n = "254" + n.slice(1);
  if (n.length === 9) n = "254" + n;
  return n;
}

export function openWhatsApp(text: string, number?: string) {
  const base = number ? `https://wa.me/${waNumber(number)}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

export function shareLink(kind: "efootball/tournament" | "pool/tournament" | "efootball/account", id: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/${kind}/${id}`;
}

export function formatDate(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" });
}

export function formatTime(t: string) {
  const match = String(t).match(/(\d{1,2}):(\d{2})/); // tolerates "18:00" and legacy date-time strings
  if (!match) return t;
  const [h, m] = [Number(match[1]), Number(match[2])];
  if (isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function tournamentShareText(t: Tournament): string {
  const status = t.status === "open" ? "🟢 Registration Open" : t.status === "full" ? "🔴 Registration Closed" : `🏆 Winner: ${t.winner}`;
  return [
    `🏆 ${t.name}`,
    `🎮 ${t.game}`,
    t.course && t.course !== "All courses" ? `🎓 ${t.course}${t.year && t.year !== "All years" ? ` — ${t.year}` : ""}` : "",
    `📅 ${formatDate(t.date)}`,
    `🕗 ${formatTime(t.time)}`,
    `👥 ${t.registered}/${t.max} players`,
    status,
    "",
    `Register with organizer: ${t.organizer}`,
    "",
    `🔗 View Tournament: ${shareLink(t.game === "Pool" ? "pool/tournament" : "efootball/tournament", t.id)}`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

export function listingShareText(l: Listing): string {
  return [
    "🎮 eFootball Account for Sale",
    `💰 KSh ${l.price.toLocaleString()}`,
    "🟢 Available",
    `👤 Seller: ${l.username}`,
    "",
    `View account: ${shareLink("efootball/account", l.id)}`,
  ].join("\n");
}
