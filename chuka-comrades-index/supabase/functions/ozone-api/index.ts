import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const adminUids = (
  Deno.env.get("OZONE_ADMIN_UIDS") || Deno.env.get("EFOOTBALL_ADMIN_UIDS") || ""
).split(",").map((uid) => uid.trim()).filter(Boolean);
const allowedOrigins = (Deno.env.get("FRONTEND_ORIGINS") || "http://localhost:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

if (!firebaseProjectId || !supabaseUrl || !serviceRoleKey) {
  throw new Error("Required O Zone API environment variables are missing.");
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const firebaseKeys = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
));

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin && allowedOrigins.includes(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function verifyUser(req: Request): Promise<string> {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Please sign in before continuing.");
  try {
    const { payload } = await jwtVerify(match[1], firebaseKeys, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Invalid Firebase user.");
    }
    return payload.sub;
  } catch {
    throw new Error("Please sign in again to continue.");
  }
}

function requireAdmin(uid: string) {
  if (!adminUids.includes(uid)) throw new Error("Administrator access required.");
}

function text(value: unknown, label: string, max: number, min = 1): string {
  const result = String(value ?? "").trim();
  if (result.length < min || result.length > max) {
    throw new Error(`${label} must be between ${min} and ${max} characters.`);
  }
  return result;
}

function containsContactDetails(value: string): boolean {
  return /(?:\+?254|0)\s?(?:7|1)\d(?:[\s-]?\d){7,8}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|www\./i.test(value);
}

async function activePayment(uid: string) {
  const { data, error } = await db.from("ozone_payments")
    .select("id,user_id,amount_kes,activated_at,expires_at,status")
    .eq("user_id", uid)
    .eq("status", "approved")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function requireActive(uid: string) {
  const payment = await activePayment(uid);
  if (!payment) throw new Error("An approved KSh 100 O Zone weekly membership is required.");
  return payment;
}

async function submitPayment(uid: string, body: Record<string, unknown>) {
  const alias = text(body.alias, "Display alias", 30, 2);
  const age = Number(body.age);
  const gender = body.gender;
  const whatsapp = text(body.whatsapp, "WhatsApp number", 30, 8);
  const mpesaCode = text(body.mpesa_code, "M-Pesa transaction code", 20, 8).toUpperCase();

  if (body.consent_18 !== true || !Number.isInteger(age) || age < 18 || age > 100) {
    throw new Error("O Zone is strictly for adults aged 18 and above.");
  }
  if (!["female", "male", "other"].includes(String(gender))) {
    throw new Error("Choose a valid gender option.");
  }
  if (!/^[+0-9\s()-]+$/.test(whatsapp) || !/\d/.test(whatsapp)) {
    throw new Error("Enter a valid WhatsApp number.");
  }
  if (!/^[A-Z0-9]{8,20}$/.test(mpesaCode)) {
    throw new Error("Enter a valid M-Pesa transaction code without spaces.");
  }

  if (await activePayment(uid)) {
    throw new Error("Your O Zone weekly membership is already active.");
  }
  const { data: pending, error: pendingError } = await db.from("ozone_payments")
    .select("id").eq("user_id", uid).eq("status", "pending").maybeSingle();
  if (pendingError) throw pendingError;
  if (pending) throw new Error("You already have a payment awaiting admin verification.");

  const { error: profileError } = await db.from("ozone_profiles").upsert({
    user_id: uid,
    alias,
    age,
    gender,
    whatsapp,
    consent_18: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (profileError) throw profileError;

  const { data, error } = await db.from("ozone_payments").insert({
    user_id: uid,
    amount_kes: 100,
    mpesa_code: mpesaCode,
    status: "pending",
  }).select("id,status,amount_kes,created_at").single();
  if (error) throw error;
  return data;
}

async function submitRequest(uid: string, body: Record<string, unknown>) {
  const payment = await requireActive(uid);
  const category = body.category;
  const seekingGender = body.seeking_gender;
  const minAge = Number(body.min_age);
  const maxAge = Number(body.max_age);
  const area = text(body.area, "General area", 60, 2);
  const intro = text(body.intro, "Introduction", 300, 10);

  if (category !== "dating" && category !== "hookup") {
    throw new Error("Choose dating or adults-only casual connection.");
  }
  if (!["female", "male", "any"].includes(String(seekingGender))) {
    throw new Error("Choose a valid preference.");
  }
  if (!Number.isInteger(minAge) || !Number.isInteger(maxAge) ||
    minAge < 18 || maxAge > 100 || minAge > maxAge) {
    throw new Error("Age preferences must be valid and start at 18 or older.");
  }
  if (containsContactDetails(area) || containsContactDetails(intro)) {
    throw new Error("Do not include phone numbers, email addresses or links in public-facing details.");
  }

  const { data: existing, error: existingError } = await db.from("ozone_requests")
    .select("id").eq("payment_id", payment.id).maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error("You have already submitted a connection request for this weekly membership.");

  const { data, error } = await db.from("ozone_requests").insert({
    user_id: uid,
    payment_id: payment.id,
    category,
    seeking_gender: seekingGender,
    min_age: minAge,
    max_age: maxAge,
    area,
    intro,
    status: "pending",
  }).select("id,status,created_at").single();
  if (error) throw error;
  return data;
}

async function expressInterest(uid: string, body: Record<string, unknown>) {
  await requireActive(uid);
  const requestId = text(body.request_id, "Request ID", 64);
  const { data: request, error } = await db.from("ozone_requests")
    .select("id,user_id,status,seeking_gender,min_age,max_age")
    .eq("id", requestId).maybeSingle();
  if (error) throw error;
  if (!request || request.status !== "approved") throw new Error("This request is no longer available.");
  if (request.user_id === uid) throw new Error("You cannot express interest in your own request.");
  if (!(await activePayment(request.user_id))) {
    throw new Error("This request owner's weekly membership has expired.");
  }

  const { data: profile, error: profileError } = await db.from("ozone_profiles")
    .select("age,gender").eq("user_id", uid).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error("Complete your O Zone profile before expressing interest.");
  if (profile.age < request.min_age || profile.age > request.max_age) {
    throw new Error("Your age is outside the request owner's preferred age range.");
  }
  if (request.seeking_gender !== "any" && request.seeking_gender !== profile.gender) {
    throw new Error("This request is not seeking your gender preference.");
  }

  const { data, error: insertError } = await db.from("ozone_interests").insert({
    request_id: requestId,
    interested_user_id: uid,
    status: "pending",
  }).select("id,status").single();
  if (insertError) {
    if (insertError.code === "23505") throw new Error("You have already responded to this request.");
    throw insertError;
  }
  return data;
}

async function respondInterest(uid: string, body: Record<string, unknown>) {
  const interestId = text(body.interest_id, "Interest ID", 64);
  const decision = body.decision;
  if (decision !== "accept" && decision !== "decline") {
    throw new Error("Choose accept or decline.");
  }
  const { data: interest, error } = await db.from("ozone_interests")
    .select("id,request_id,interested_user_id,status").eq("id", interestId).maybeSingle();
  if (error) throw error;
  if (!interest || interest.status !== "pending") throw new Error("This interest is no longer pending.");

  const { data: request, error: requestError } = await db.from("ozone_requests")
    .select("id,user_id,status").eq("id", interest.request_id).maybeSingle();
  if (requestError) throw requestError;
  if (!request || request.user_id !== uid || request.status !== "approved") {
    throw new Error("Only the owner of this approved request can respond.");
  }

  if (decision === "decline") {
    const { error: updateError } = await db.from("ozone_interests")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("id", interestId).eq("status", "pending");
    if (updateError) throw updateError;
    return { status: "declined" };
  }

  const { data, error: rpcError } = await db.rpc("ozone_accept_interest", {
    p_interest_id: interestId,
    p_actor_uid: uid,
  });
  if (rpcError) throw rpcError;
  return data;
}

async function getConnectionContact(uid: string, body: Record<string, unknown>) {
  const connectionId = text(body.connection_id, "Connection ID", 64);
  const { data: connection, error } = await db.from("ozone_connections")
    .select("id,requester_id,interested_user_id,status")
    .eq("id", connectionId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!connection || (connection.requester_id !== uid && connection.interested_user_id !== uid)) {
    throw new Error("You are not authorised to view this connection.");
  }
  const otherUid = connection.requester_id === uid
    ? connection.interested_user_id
    : connection.requester_id;
  const { data: profile, error: profileError } = await db.from("ozone_profiles")
    .select("alias,whatsapp").eq("user_id", otherUid).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error("The other member's private contact is unavailable.");
  return { alias: profile.alias, whatsapp: profile.whatsapp };
}

async function syncExpiredRefunds(userId?: string) {
  let query = db.from("ozone_payments")
    .select("id,user_id,activated_at,expires_at")
    .eq("status", "approved")
    .lte("expires_at", new Date().toISOString())
    .limit(300);
  if (userId) query = query.eq("user_id", userId);
  const { data: expired, error } = await query;
  if (error) throw error;

  for (const payment of expired || []) {
    const from = payment.activated_at || "1970-01-01T00:00:00.000Z";
    const until = payment.expires_at || new Date().toISOString();
    const { data: ownConnections, error: ownError } = await db.from("ozone_connections")
      .select("id").eq("requester_id", payment.user_id)
      .gte("mutual_at", from).lte("mutual_at", until).limit(1);
    if (ownError) throw ownError;
    const { data: otherConnections, error: otherError } = await db.from("ozone_connections")
      .select("id").eq("interested_user_id", payment.user_id)
      .gte("mutual_at", from).lte("mutual_at", until).limit(1);
    if (otherError) throw otherError;

    if (!(ownConnections?.length || otherConnections?.length)) {
      const { error: updateError } = await db.from("ozone_payments")
        .update({ status: "refund_due" }).eq("id", payment.id).eq("status", "approved");
      if (updateError) throw updateError;
    }
  }
}

async function myData(uid: string) {
  await syncExpiredRefunds(uid);
  const [{ data: profile, error: profileError }, { data: payments, error: paymentError },
    { data: requests, error: requestError }] = await Promise.all([
    db.from("ozone_profiles").select("alias,age,gender,whatsapp").eq("user_id", uid).maybeSingle(),
    db.from("ozone_payments").select("id,amount_kes,status,created_at,activated_at,expires_at,mpesa_code,refund_mpesa_code")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
    db.from("ozone_requests").select("id,category,seeking_gender,min_age,max_age,area,intro,status,created_at")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
  ]);
  if (profileError) throw profileError;
  if (paymentError) throw paymentError;
  if (requestError) throw requestError;

  const requestIds = (requests || []).map((r) => r.id);
  let incoming: { id: string; request_id: string; status: string; created_at: string }[] = [];
  if (requestIds.length) {
    const incomingResult = await db.from("ozone_interests")
      .select("id,request_id,status,created_at")
      .in("request_id", requestIds).order("created_at", { ascending: false });
    if (incomingResult.error) throw incomingResult.error;
    incoming = incomingResult.data || [];
  }
  const [{ data: sent, error: sentError }, { data: asRequester, error: requesterError },
    { data: asInterested, error: interestedError }] = await Promise.all([
    db.from("ozone_interests").select("id,request_id,status,created_at")
      .eq("interested_user_id", uid).order("created_at", { ascending: false }).limit(30),
    db.from("ozone_connections").select("id,request_id,mutual_at")
      .eq("requester_id", uid).eq("status", "active"),
    db.from("ozone_connections").select("id,request_id,mutual_at")
      .eq("interested_user_id", uid).eq("status", "active"),
  ]);
  for (const err of [sentError, requesterError, interestedError]) if (err) throw err;

  const allConnections = [...(asRequester || []), ...(asInterested || [])];
  const requestMap = new Map<string, { category: string; status: string }>(
    (requests || []).map((r) => [r.id, { category: r.category, status: r.status }]),
  );
  const otherRequestIds = [...new Set([
    ...(sent || []).map((i) => i.request_id),
    ...allConnections.map((c) => c.request_id),
  ].filter((id) => !requestMap.has(id)))];
  if (otherRequestIds.length) {
    const { data: otherRequests, error: otherRequestError } = await db.from("ozone_requests")
      .select("id,category,status").in("id", otherRequestIds);
    if (otherRequestError) throw otherRequestError;
    for (const item of otherRequests || []) {
      requestMap.set(item.id, { category: item.category, status: item.status });
    }
  }
  const received = incoming.filter((i) =>
    ["approved", "matched"].includes(requestMap.get(i.request_id)?.status || "")
  ).map((i) => ({
    ...i,
    category: requestMap.get(i.request_id)?.category,
  }));
  const sentWithRequest = (sent || []).map((i) => ({
    ...i,
    category: requestMap.get(i.request_id)?.category,
  }));
  const connections = allConnections.map((c) => ({
    ...c,
    category: requestMap.get(c.request_id)?.category || "dating",
  }));

  const current = (payments || []).find((p) =>
    p.status === "approved" && p.expires_at && new Date(p.expires_at).getTime() > Date.now()
  ) || null;

  return {
    is_admin: adminUids.includes(uid),
    profile,
    payments: payments || [],
    active_payment: current,
    requests: requests || [],
    incoming_interests: received,
    sent_interests: sentWithRequest,
    connections,
  };
}

async function adminDashboard() {
  await syncExpiredRefunds();
  const [{ data: payments, error: paymentError }, { data: requests, error: requestError },
    { data: approved, error: approvedError }, { data: refunds, error: refundError }] = await Promise.all([
    db.from("ozone_payments").select("id,user_id,amount_kes,status,created_at,mpesa_code,expires_at")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    db.from("ozone_requests").select("id,user_id,category,seeking_gender,min_age,max_age,area,intro,status,created_at")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    db.from("ozone_requests").select("id,category,seeking_gender,min_age,max_age,public_area,public_summary,created_at")
      .eq("status", "approved").order("created_at", { ascending: false }).limit(100),
    db.from("ozone_payments").select("id,user_id,amount_kes,status,created_at,mpesa_code,expires_at,refund_mpesa_code")
      .eq("status", "refund_due").order("expires_at", { ascending: true }).limit(100),
  ]);
  for (const err of [paymentError, requestError, approvedError, refundError]) if (err) throw err;

  const userIds = [...new Set([
    ...(payments || []).map((p) => p.user_id),
    ...(requests || []).map((r) => r.user_id),
    ...(refunds || []).map((p) => p.user_id),
  ])];
  const profileMap = new Map<string, { alias: string; age: number; gender: string; whatsapp: string }>();
  if (userIds.length) {
    const { data: profiles, error } = await db.from("ozone_profiles")
      .select("user_id,alias,age,gender,whatsapp").in("user_id", userIds);
    if (error) throw error;
    for (const profile of profiles || []) profileMap.set(profile.user_id, profile);
  }

  const addProfile = (item: Record<string, unknown>) => {
    const profile = profileMap.get(String(item.user_id));
    return { ...item, alias: profile?.alias, age: profile?.age, gender: profile?.gender, whatsapp: profile?.whatsapp };
  };

  return {
    payments: (payments || []).map(addProfile),
    requests: (requests || []).map(addProfile),
    approved_requests: (approved || []).map((r) => ({
      ...r,
      area: r.public_area,
      intro: r.public_summary,
    })),
    refunds: (refunds || []).map(addProfile),
  };
}

async function adminReviewPayment(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const id = text(body.id, "Payment ID", 64);
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") throw new Error("Invalid payment decision.");
  const update: Record<string, unknown> = {
    status: decision === "approve" ? "approved" : "rejected",
    reviewed_at: new Date().toISOString(),
  };
  if (decision === "approve") {
    const now = new Date();
    update.activated_at = now.toISOString();
    update.expires_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  const { data, error } = await db.from("ozone_payments").update(update)
    .eq("id", id).eq("status", "pending").select("id,status,activated_at,expires_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This payment has already been reviewed.");
  return data;
}

async function adminReviewRequest(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const id = text(body.id, "Request ID", 64);
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") throw new Error("Invalid request decision.");

  const { data: request, error: requestError } = await db.from("ozone_requests")
    .select("id,user_id,status").eq("id", id).maybeSingle();
  if (requestError) throw requestError;
  if (!request || request.status !== "pending") throw new Error("This request has already been reviewed.");

  if (decision === "reject") {
    const { error } = await db.from("ozone_requests").update({
      status: "rejected", reviewed_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "pending");
    if (error) throw error;
    return { id, status: "rejected" };
  }

  if (!(await activePayment(request.user_id))) {
    throw new Error("The member's weekly membership expired before this request was approved.");
  }
  const summary = text(body.public_summary, "Anonymous public summary", 300, 10);
  const area = text(body.public_area, "Public area", 60, 2);
  if (containsContactDetails(summary) || containsContactDetails(area)) {
    throw new Error("Remove phone numbers, emails and links before publishing.");
  }
  const { data, error } = await db.from("ozone_requests").update({
    status: "approved",
    public_summary: summary,
    public_area: area,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "pending")
    .select("id,status,public_summary,public_area").single();
  if (error) throw error;
  return data;
}

async function adminMarkRefunded(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const id = text(body.id, "Payment ID", 64);
  const refundCode = text(body.refund_mpesa_code, "Refund transaction code", 20, 8).toUpperCase();
  if (!/^[A-Z0-9]{8,20}$/.test(refundCode)) throw new Error("Enter a valid refund M-Pesa code.");

  const { data: payment, error } = await db.from("ozone_payments")
    .select("id,user_id,status,activated_at,expires_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!payment || payment.status !== "refund_due") throw new Error("This payment is not eligible for refund recording.");
  const from = payment.activated_at || "1970-01-01T00:00:00.000Z";
  const until = payment.expires_at || new Date().toISOString();
  const { data: first, error: firstError } = await db.from("ozone_connections")
    .select("id").eq("requester_id", payment.user_id).gte("mutual_at", from).lte("mutual_at", until).limit(1);
  const { data: second, error: secondError } = await db.from("ozone_connections")
    .select("id").eq("interested_user_id", payment.user_id).gte("mutual_at", from).lte("mutual_at", until).limit(1);
  if (firstError) throw firstError;
  if (secondError) throw secondError;
  if (first?.length || second?.length) throw new Error("A mutual match was made during this membership; this payment is not refundable.");

  const { data, error: updateError } = await db.from("ozone_payments").update({
    status: "refunded",
    refund_mpesa_code: refundCode,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "refund_due").select("id,status").maybeSingle();
  if (updateError) throw updateError;
  if (!data) throw new Error("Refund status changed. Refresh the admin desk.");
  return data;
}

async function adminPublishTrending(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const title = text(body.title, "Trending title", 100, 3);
  const content = text(body.body, "Trending content", 1500, 10);
  if (containsContactDetails(title) || containsContactDetails(content)) {
    throw new Error("Remove phone numbers, emails and links before publishing a public post.");
  }
  const { data, error } = await db.from("ozone_trendings").insert({
    title,
    body: content,
    status: "published",
    created_by: uid,
    published_at: new Date().toISOString(),
  }).select("id,title,body,created_at").single();
  if (error) throw error;
  return data;
}

async function publicFeed() {
  const [{ data: requests, error: requestError }, { data: trendings, error: trendError }] = await Promise.all([
    db.from("ozone_requests").select("id,category,seeking_gender,min_age,max_age,public_area,public_summary,created_at")
      .eq("status", "approved").order("created_at", { ascending: false }).limit(50),
    db.from("ozone_trendings").select("id,title,body,created_at")
      .eq("status", "published").order("created_at", { ascending: false }).limit(30),
  ]);
  if (requestError) throw requestError;
  if (trendError) throw trendError;
  return {
    requests: (requests || []).map((r) => ({
      id: r.id,
      category: r.category,
      seeking_gender: r.seeking_gender,
      min_age: r.min_age,
      max_age: r.max_age,
      area: r.public_area,
      intro: r.public_summary,
      created_at: r.created_at,
      status: "approved",
    })),
    trendings: trendings || [],
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return json({ error: "Origin not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  try {
    const length = Number(req.headers.get("Content-Length") || 0);
    if (length > 64_000) return json({ error: "Request is too large." }, 413, origin);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body.");

    if (body.action === "public_feed") {
      return json(await publicFeed(), 200, origin);
    }

    const uid = await verifyUser(req);
    let result: unknown;

    switch (body.action) {
      case "submit_payment":
        result = await submitPayment(uid, body);
        break;
      case "submit_request":
        result = await submitRequest(uid, body);
        break;
      case "express_interest":
        result = await expressInterest(uid, body);
        break;
      case "respond_interest":
        result = await respondInterest(uid, body);
        break;
      case "get_connection_contact":
        result = await getConnectionContact(uid, body);
        break;
      case "my_data":
        result = await myData(uid);
        break;
      case "admin_dashboard":
        requireAdmin(uid);
        result = await adminDashboard();
        break;
      case "admin_review_payment":
        result = await adminReviewPayment(uid, body);
        break;
      case "admin_review_request":
        result = await adminReviewRequest(uid, body);
        break;
      case "admin_mark_refunded":
        result = await adminMarkRefunded(uid, body);
        break;
      case "admin_publish_trending":
        result = await adminPublishTrending(uid, body);
        break;
      default:
        return json({ error: "Unknown O Zone action." }, 400, origin);
    }
    return json(result, 200, origin);
  } catch (error) {
    console.error("O Zone API error:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message.includes("Administrator access") ? 403
      : message.includes("sign in") || message.includes("Firebase") ? 401 : 400;
    return json({ error: message }, status, origin);
  }
});
