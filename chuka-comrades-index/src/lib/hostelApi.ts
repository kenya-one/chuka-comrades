import type { User } from "firebase/auth";

const API_URL = (
  import.meta.env.VITE_HOSTEL_API_URL ||
  "https://script.google.com/macros/s/AKfycbxtB8jELgHp4N_8PxigHI20siQAl3neMQcwtGhjF0GN81RZzHmwPBRVZyAzRMwB7tWX/exec"
) as string;

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

function jsonp<T>(params: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `__hostelJsonp_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const callbackWindow = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const query = new URLSearchParams({ ...params, callback: callbackName });

    const cleanup = () => {
      delete callbackWindow[callbackName];
      script.remove();
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The hostel service did not respond. Please try again."));
    }, 20000);

    callbackWindow[callbackName] = (data: T) => {
      window.clearTimeout(timeout);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error("Could not connect to the hostel service."));
    };

    script.src = `${API_URL}?${query.toString()}`;
    script.async = true;
    document.head.appendChild(script);
  });
}

async function post<T>(user: User, payload: Record<string, unknown>): Promise<T> {
  if (!API_URL) throw new Error("Hostel service is not configured.");
  const idToken = await user.getIdToken(true);

  // text/plain avoids a browser CORS preflight for the Apps Script web app.
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, idToken }),
      redirect: "follow",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network request failed";
    throw new Error(`Could not read the Apps Script response from this browser (${detail}). Check the Apps Script web-app deployment and browser Console for a CORS or redirect error.`);
  }

  const raw = await response.text();
  let result: (ApiEnvelope<T> & T) | (T & { success?: boolean; error?: string });
  try {
    result = JSON.parse(raw) as typeof result;
  } catch {
    throw new Error(
      "The hostel service returned an unreadable response. Confirm that the latest Apps Script version is deployed and that its POST response is JSON."
    );
  }

  if (!response.ok || result.success === false) {
    throw new Error(result.error || `Hostel request failed (HTTP ${response.status}).`);
  }

  // Apps Script versions may wrap payloads in `data`, or return fields at the top level.
  return ("data" in result && result.data !== undefined ? result.data : result) as T;
}

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [value];
  }
}

function toBoolean(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === "true";
}

function normalizeListing(raw: Record<string, unknown>): HostelListing {
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    description: raw.description ? String(raw.description) : null,
    area: String(raw.area || ""),
    landmark: raw.landmark ? String(raw.landmark) : null,
    location_url: raw.location_url ? String(raw.location_url) : null,
    image_urls: parseArray(raw.image_urls),
    rent_amount: Number(raw.rent_amount || 0),
    rent_period: raw.rent_period === "semester" ? "semester" : "month",
    room_type: String(raw.room_type || ""),
    total_rooms: raw.total_rooms === "" || raw.total_rooms == null ? null : Number(raw.total_rooms),
    available_rooms: Number(raw.available_rooms || 0),
    available_from: raw.available_from ? String(raw.available_from) : null,
    facilities: parseArray(raw.facilities),
    contact_name: raw.contact_name ? String(raw.contact_name) : null,
    landlord_contact: String(raw.landlord_contact || ""),
    verified: toBoolean(raw.verified),
    status: raw.status === "unavailable" ? "unavailable" : "published",
  };
}

export type HostelListing = {
  id: string;
  name: string;
  description: string | null;
  area: string;
  landmark: string | null;
  location_url: string | null;
  image_urls: string[];
  rent_amount: number;
  rent_period: "month" | "semester";
  room_type: string;
  total_rooms: number | null;
  available_rooms: number;
  available_from: string | null;
  facilities: string[];
  contact_name: string | null;
  landlord_contact: string;
  verified: boolean;
  status: "published" | "unavailable";
};

export type HostelAdminData = { listings: HostelListing[] };

export type HostelSettings = {
  adminWhatsApp: string;
  landlordGroup: string;
  studentFeedbackGroup: string;
  maxImagesPerHostel: number;
};

export const hostelApi = {
  publicListings: async () => {
    const result = await jsonp<{ success: boolean; hostels?: Record<string, unknown>[]; error?: string }>({
      action: "public_listings",
    });
    if (!result.success) throw new Error(result.error || "Could not load hostel listings.");
    return { listings: (result.hostels || []).map(normalizeListing) };
  },

  bootstrap: async () => {
    const result = await jsonp<{ success: boolean; settings?: HostelSettings; error?: string }>({
      action: "bootstrap",
    });
    if (!result.success || !result.settings) {
      throw new Error(result.error || "Could not load hostel settings.");
    }
    return result.settings;
  },

  createListing: (user: User, hostel: Record<string, unknown>) =>
    post<{ id: string; name: string; image_urls: string[]; status: string }>(
      user,
      { action: "create_listing", hostel }
    ),

  adminDashboard: async (user: User) => {
    const result = await post<{ success: boolean; admin: string; hostels: Record<string, unknown>[] }>(
      user,
      { action: "admin_dashboard" }
    );
    return {
      listings: (result.hostels || []).map(normalizeListing),
    } satisfies HostelAdminData;
  },

  updateListing: (user: User, id: string, update: Record<string, unknown>) =>
    post(user, { action: "update_listing", hostelId: id, updates: update }),
};
