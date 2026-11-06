import type { User } from "firebase/auth";
import { supabase } from "./supabase";

const API_URL =
  (import.meta.env.VITE_CAMPUS_API_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/campus-ozone-admin`
    : "");

export async function campusApi<T = Record<string, unknown>>(
  user: User | null,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!API_URL) throw new Error("Campus API is not configured yet.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}

/** Shrinks photos in the browser before upload (max 1600px, JPEG). */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.82));
}

export const MAX_VIDEO_MB = 50;

/** Uploads one file through a short-lived signed URL issued by the admin function. */
export async function uploadCampusMedia(user: User, file: File): Promise<{ storage_path: string; kind: "image" | "video" }> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const kind = file.type.startsWith("video/") ? "video" : "image";
  if (kind === "video") {
    if (!["video/mp4", "video/webm"].includes(file.type)) throw new Error("Videos must be MP4 or WebM.");
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`Videos must be under ${MAX_VIDEO_MB} MB. For longer videos, share a YouTube link in the message.`);
  } else if (!file.type.startsWith("image/")) {
    throw new Error("Only images and MP4/WebM videos are allowed.");
  }
  const body = kind === "image" ? await compressImage(file) : file;
  const ext = kind === "video" ? (file.type === "video/webm" ? "webm" : "mp4") : "jpg";
  const { path, token } = await campusApi<{ path: string; token: string }>(user, "media_sign_upload", { kind, ext });
  const { error } = await supabase.storage.from("campus-updates").uploadToSignedUrl(path, token, body, {
    contentType: kind === "image" ? "image/jpeg" : file.type,
  });
  if (error) throw new Error("Upload failed. Please try again.");
  return { storage_path: path, kind };
}

export const waShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Links the admin edits inside the app (stored in the campus_settings table, public to read). */
export type CampusSettings = {
  updates_channel_url: string;
  ozone_channel_url: string;
  ozone_admin_whatsapp: string;
  ozone_ngl_url: string;
};
export const EMPTY_SETTINGS: CampusSettings = {
  updates_channel_url: "", ozone_channel_url: "", ozone_admin_whatsapp: "", ozone_ngl_url: "",
};
export async function fetchSettings(): Promise<CampusSettings> {
  try {
    const r = await campusApi<{ settings: Partial<CampusSettings> }>(null, "settings_public");
    return { ...EMPTY_SETTINGS, ...r.settings };
  } catch {
    return EMPTY_SETTINGS;
  }
}

/** wa.me link to a specific number (digits only, country code) with a prefilled message. */
export const waLink = (number: string, text: string) =>
  `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
