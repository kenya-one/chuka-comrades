
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const allowedOrigins = new Set(
  (Deno.env.get("FRONTEND_ORIGINS") ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const jwks = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

async function verifiedFirebaseUid(
  request: Request,
): Promise<string | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !firebaseProjectId) return null;

  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
      algorithms: ["RS256"],
    });

    if (typeof payload.sub !== "string" || !payload.sub) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}

function validProfileInput(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;

  if (
    data.campus !== undefined &&
    data.campus !== null &&
    data.campus !== "Chuka Campus"
  ) {
    return false;
  }

  const allowed = new Set([
    "display_name",
    "campus",
    "course",
    "year_of_study",
    "avatar_url",
    "whatsapp_number",
  ]);

  if (Object.keys(data).some((key) => !allowed.has(key))) {
    return false;
  }

  for (const key of ["display_name", "campus", "course"]) {
    const item = data[key];

    if (item !== undefined && item !== null) {
      if (
        typeof item !== "string" ||
        item.trim().length === 0 ||
        item.length > 120
      ) {
        return false;
      }
    }
  }

  const year = data.year_of_study;

  if (
    year !== undefined &&
    year !== null &&
    (typeof year !== "number" ||
      !Number.isInteger(year) ||
      year < 1 ||
      year > 10)
  ) {
    return false;
  }

  const whatsapp = data.whatsapp_number;

  if (whatsapp !== undefined && whatsapp !== null) {
    if (
      typeof whatsapp !== "string" ||
      whatsapp.trim().length === 0 ||
      whatsapp.length > 30 ||
      !/^[+0-9\s()-]+$/.test(whatsapp.trim()) ||
      !/[0-9]/.test(whatsapp)
    ) {
      return false;
    }
  }

  const avatar = data.avatar_url;

  if (avatar !== undefined && avatar !== null) {
    if (
      typeof avatar !== "string" ||
      avatar.length > 2048 ||
      avatar.trim().length === 0
    ) {
      return false;
    }

    try {
      const parsedAvatar = new URL(avatar);

      if (
        parsedAvatar.protocol !== "https:" ||
        !parsedAvatar.hostname
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");

  if (origin && !allowedOrigins.has(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const uid = await verifiedFirebaseUid(request);

  if (!uid) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Server configuration is incomplete" },
      500,
      origin,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const columns =
    "id, display_name, university, campus, course, year_of_study, avatar_url, whatsapp_number, created_at, updated_at";

  if (request.method === "GET") {
    const { data, error } = await supabase
      .from("student_profiles")
      .select(columns)
      .eq("firebase_uid", uid)
      .maybeSingle();

    if (error) {
      return jsonResponse(
        { error: "Could not load student profile" },
        500,
        origin,
      );
    }

    return jsonResponse({ profile: data }, 200, origin);
  }

  const contentLength = Number(
    request.headers.get("Content-Length") ?? "0",
  );

  if (contentLength > 16 * 1024) {
    return jsonResponse({ error: "Request body too large" }, 413, origin);
  }

  let body: unknown;
  let rawBody: string;

  try {
    rawBody = await request.text();

    if (new TextEncoder().encode(rawBody).byteLength > 16 * 1024) {
      return jsonResponse({ error: "Request body too large" }, 413, origin);
    }

    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(
      { error: "Request body must be valid JSON" },
      400,
      origin,
    );
  }

  if (!validProfileInput(body)) {
    return jsonResponse({ error: "Invalid profile fields" }, 400, origin);
  }

  const input = body;

  // Read the existing record so omitted fields are preserved.
  const { data: existing, error: readError } = await supabase
    .from("student_profiles")
    .select(
      "display_name, campus, course, year_of_study, avatar_url, whatsapp_number",
    )
    .eq("firebase_uid", uid)
    .maybeSingle();

  if (readError) {
    return jsonResponse(
      { error: "Could not read existing student profile" },
      500,
      origin,
    );
  }

  const profile = {
    firebase_uid: uid,
    display_name: Object.hasOwn(input, "display_name")
      ? input.display_name
      : existing?.display_name ?? null,
    university: "Chuka University",
    campus: Object.hasOwn(input, "campus")
      ? input.campus
      : existing?.campus ?? null,
    course: Object.hasOwn(input, "course")
      ? input.course
      : existing?.course ?? null,
    year_of_study: Object.hasOwn(input, "year_of_study")
      ? input.year_of_study
      : existing?.year_of_study ?? null,
    avatar_url: Object.hasOwn(input, "avatar_url")
      ? input.avatar_url
      : existing?.avatar_url ?? null,
    whatsapp_number: Object.hasOwn(input, "whatsapp_number")
      ? input.whatsapp_number
      : existing?.whatsapp_number ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("student_profiles")
    .upsert(profile, { onConflict: "firebase_uid" })
    .select(columns)
    .single();

  if (error) {
    // Avoid exposing internal database details to the client.
    console.error("Could not save profile:", error.message);

    return jsonResponse(
      { error: "Could not save student profile" },
      500,
      origin,
    );
  }

  return jsonResponse({ profile: data }, 200, origin);
});
