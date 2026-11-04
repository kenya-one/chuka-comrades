import type { User } from "firebase/auth";

const API_URL = import.meta.env.VITE_EFOOTBALL_API_URL as string | undefined;

async function apiRequest<T>(
  user: User,
  options: { action: string; [key: string]: unknown },
): Promise<T> {
  if (!API_URL) {
    throw new Error("Efootball API URL is not configured.");
  }

  const token = await user.getIdToken();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Efootball request failed.");
  }

  return result as T;
}

export async function efootballAction<T = Record<string, unknown>>(
  user: User,
  payload: { action: string; [key: string]: unknown },
): Promise<T> {
  return apiRequest<T>(user, payload);
}

export async function uploadEfootballImage(
  user: User,
  file: File,
  folder: "players" | "market" | "tournaments",
): Promise<string> {
  if (!API_URL) {
    throw new Error("Efootball API URL is not configured.");
  }

  const token = await user.getIdToken();
  const form = new FormData();

  form.append("file", file);
  form.append("folder", folder);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Image upload failed.");
  }

  if (typeof result.image_url !== "string") {
    throw new Error("The image upload did not return a valid URL.");
  }

  return result.image_url;
}
