import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

/**
 * Chuka Soko v2 gateway (Google Sheets + Apps Script is the database).
 * This function never stores data. It:
 *   - forwards public reads (GET) to the Apps Script web app, and
 *   - verifies the Firebase Google login on POST, works out whether the caller is the admin,
 *     then forwards { secret, action, caller, payload } to Apps Script, which enforces ownership.
 * Secrets: FIREBASE_PROJECT_ID, CHUKA_SOKO_APPS_SCRIPT_URL, CHUKA_SOKO_SERVER_SECRET,
 *          FRONTEND_ORIGINS, SOKO_ADMIN_EMAILS (optional, default sidneywafula30@gmail.com)
 */
const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
const appsScriptUrl = Deno.env.get("CHUKA_SOKO_APPS_SCRIPT_URL") || "";
const serverSecret = Deno.env.get("CHUKA_SOKO_SERVER_SECRET") || "";
const adminEmails = (Deno.env.get("SOKO_ADMIN_EMAILS") || "sidneywafula30@gmail.com")
  .split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
const allowedOrigins = (Deno.env.get("FRONTEND_ORIGINS") || "http://localhost:5173")
  .split(",").map((v) => v.trim()).filter(Boolean);
const firebaseKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

const PUBLIC_GET = ["health", "categories", "config", "publicConfig", "stores", "store", "products", "product"];
const PUBLIC_PARAMS = ["q", "category", "store", "slug", "id"];
const SELLER_ACTIONS = ["me", "requestStore", "updateStore", "uploadImage", "createProduct", "updateProduct", "createListing", "updateListing", "setQuantity", "setProductStatus", "deleteProduct"];
const ADMIN_ACTIONS = ["adminOverview", "approveStore", "rejectStore", "suspendStore", "reinstateStore", "logPayment", "verifyCommission", "removeProduct", "setProductFeatured", "setStoreFeatured", "resolveReport"];

class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }

function cors(origin: string | null): Record<string, string> {
  return {
    ...(origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
async function callAppsScript(init: RequestInit & { url: string }): Promise<{ status: number; data: any }> {
  const upstream = await fetch(init.url, { ...init, redirect: "follow" });
  const raw = await upstream.text();
  try { return { status: upstream.status, data: JSON.parse(raw) }; }
  catch {
    console.error("Apps Script returned non-JSON", upstream.status, raw.slice(0, 300));
    throw new HttpError("The Chuka Soko Apps Script returned a web page instead of data. Check CHUKA_SOKO_APPS_SCRIPT_URL is the /exec URL, access is 'Anyone', and the latest version is deployed.", 502);
  }
}

async function verifyUser(req: Request) {
  const match = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError("Please sign in with Google to continue.", 401);
  try {
    const { payload } = await jwtVerify(match[1], firebaseKeys, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`, audience: firebaseProjectId, algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("bad uid");
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    return { uid: payload.sub, email, isAdmin: payload.email_verified === true && adminEmails.includes(email) };
  } catch { throw new HttpError("Please sign in again to continue.", 401); }
}

async function publicGet(url: URL, origin: string | null) {
  const action = url.searchParams.get("action") || "health";
  if (!PUBLIC_GET.includes(action)) throw new HttpError("Unknown public action.");
  const target = new URL(appsScriptUrl);
  target.searchParams.set("action", action);
  for (const key of PUBLIC_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value.slice(0, 80));
  }
  const { data } = await callAppsScript({ url: target.toString(), method: "GET" });
  return json(data, data.success === false ? 400 : 200, origin);
}

async function handlePost(req: Request, origin: string | null) {
  const body = await req.json().catch(() => { throw new HttpError("Invalid request."); });
  const action = String(body.action || "");
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  let caller = { uid: "", email: "", isAdmin: false };

  if (action === "report") { /* buyers may report without signing in */ }
  else if (SELLER_ACTIONS.includes(action) || ADMIN_ACTIONS.includes(action)) {
    caller = await verifyUser(req);
    if (ADMIN_ACTIONS.includes(action) && !caller.isAdmin) throw new HttpError("Administrator access required.", 403);
  } else throw new HttpError("Unsupported action.");

  const { data } = await callAppsScript({
    url: appsScriptUrl, method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: serverSecret, action, caller, payload }),
  });
  return json(data, data.success === false ? 400 : 200, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  try {
    if (!firebaseProjectId || !appsScriptUrl || !serverSecret) throw new HttpError("Chuka Soko server settings are incomplete.", 500);
    if (req.method === "GET") return await publicGet(new URL(req.url), origin);
    if (req.method === "POST") return await handlePost(req, origin);
    throw new HttpError("Method not allowed.", 405);
  } catch (error) {
    if (error instanceof HttpError) return json({ success: false, error: error.message }, error.status, origin);
    console.error("Chuka Soko gateway error:", error);
    return json({ success: false, error: "Something went wrong. Please try again." }, 500, origin);
  }
});
