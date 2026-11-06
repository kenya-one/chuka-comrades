import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
const appsScriptUrl = Deno.env.get("CHUKA_SOKO_APPS_SCRIPT_URL") || "";
const serverSecret = Deno.env.get("CHUKA_SOKO_SERVER_SECRET") || "";
const adminEmail = "sidneywafula30@gmail.com";
const allowedOrigins = (Deno.env.get("FRONTEND_ORIGINS") || "http://localhost:5173")
  .split(",").map((item) => item.trim()).filter(Boolean);
const firebaseKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

function cors(origin: string | null) {
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
async function verifyAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in with the approved administrator Google account.");
  const { payload } = await jwtVerify(token, firebaseKeys, {
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
    audience: firebaseProjectId,
    algorithms: ["RS256"],
  });
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (email !== adminEmail || payload.email_verified !== true) {
    throw new Error(`Admin access is restricted to the verified ${adminEmail} account.`);
  }
}
async function proxyPublic(url: URL, origin: string | null) {
  const action = url.searchParams.get("action") || "health";
  if (!["health", "products", "categories", "publicConfig"].includes(action)) {
    return json({ success: false, error: "Unknown public action." }, 400, origin);
  }
  if (!appsScriptUrl) throw new Error("Chuka Soko Apps Script URL has not been configured in the server.");
  const target = new URL(appsScriptUrl);
  target.searchParams.set("action", action);
  for (const key of ["q", "category"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const upstream = await fetch(target, { redirect: "follow" });
  const raw = await upstream.text();
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch {
    const contentType = upstream.headers.get("content-type") || "unknown";
    console.error("Chuka Soko public Apps Script returned non-JSON", upstream.status, contentType, raw.slice(0, 500));
    return json({ success: false, error: "The Chuka Soko Apps Script endpoint returned an HTML page instead of JSON. Confirm CHUKA_SOKO_APPS_SCRIPT_URL is the deployed /exec URL and that the deployment is accessible." }, 502, origin);
  }
  return json(data, upstream.ok ? 200 : upstream.status, origin);
}
async function proxyAdmin(req: Request, origin: string | null) {
  await verifyAdmin(req);
  if (!appsScriptUrl || !serverSecret) throw new Error("Chuka Soko admin server settings are incomplete.");
  const body = await req.json();
  const action = String(body.action || "");
  const allowed = ["adminData", "createSeller", "createProduct", "verifyCommission", "updateAvailability", "setFeatured"];
  if (!allowed.includes(action)) return json({ success: false, error: "Unsupported admin action." }, 400, origin);
  const upstream = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: serverSecret, action, payload: body.payload || {} }),
    redirect: "follow",
  });
  const raw = await upstream.text();
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch {
    const contentType = upstream.headers.get("content-type") || "unknown";
    console.error("Chuka Soko admin Apps Script returned non-JSON", upstream.status, contentType, raw.slice(0, 500));
    return json({ success: false, error: "The Chuka Soko admin Apps Script endpoint returned an HTML page instead of JSON. Check the CHUKA_SOKO_APPS_SCRIPT_URL secret, deployment access, and latest deployed version." }, 502, origin);
  }
  return json(data, upstream.ok ? 200 : upstream.status, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  try {
    if (!firebaseProjectId || !appsScriptUrl) throw new Error("Chuka Soko API server configuration is incomplete.");
    if (req.method === "GET") return await proxyPublic(new URL(req.url), origin);
    if (req.method === "POST") return await proxyAdmin(req, origin);
    return json({ success: false, error: "Method not allowed." }, 405, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Chuka Soko API error.";
    const status = message.includes("Admin access") || message.includes("approved administrator") ? 403 : 400;
    return json({ success: false, error: message }, status, origin);
  }
});
