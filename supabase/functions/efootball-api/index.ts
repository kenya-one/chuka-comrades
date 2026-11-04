
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!firebaseProjectId || !supabaseUrl || !serviceRoleKey) {
  throw new Error("Required Efootball API environment variables are missing.");
}

const adminUids = (Deno.env.get("EFOOTBALL_ADMIN_UIDS") || "")
  .split(",").map((uid) => uid.trim()).filter(Boolean);

const allowedOrigins = (Deno.env.get("FRONTEND_ORIGINS") ||
  "http://localhost:5173").split(",").map((origin) => origin.trim());

const supabase = createClient(supabaseUrl, serviceRoleKey);

const firebaseKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

function corsHeaders(origin: string | null) {
  return {
    ...(origin && allowedOrigins.includes(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(
  data: unknown,
  status = 200,
  origin: string | null = null,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

async function verifyUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");

  if (!token) throw new Error("Please sign in before continuing.");

  const { payload } = await jwtVerify(token, firebaseKeys, {
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
    audience: firebaseProjectId,
    algorithms: ["RS256"],
  });

  if (!payload.sub) throw new Error("Invalid Firebase user.");

  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
  };
}

function requireAdmin(uid: string) {
  if (!adminUids.includes(uid)) {
    throw new Error("Administrator access required.");
  }
}

function assertOwnedImageUrl(
  value: unknown,
  uid: string,
  folder: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("An image is required.");
  }

  const expectedPrefix =
    `${supabaseUrl}/storage/v1/object/public/efootball-media/${folder}/${uid}/`;

  if (!value.startsWith(expectedPrefix)) {
    throw new Error(
      "The image must be uploaded through your Efootball account.",
    );
  }

  return value;
}

async function uploadImage(req: Request, uid: string) {
  const form = await req.formData();
  const file = form.get("file");
  const folder = form.get("folder");

  if (!(file instanceof File)) {
    throw new Error("Please select an image.");
  }

  const folders = ["players", "market", "tournaments"];

  if (typeof folder !== "string" || !folders.includes(folder)) {
    throw new Error("Invalid image category.");
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG and WEBP images are allowed.");
  }

  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error("Images must be between 1 byte and 5 MB.");
  }

  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const path =
    `${folder}/${uid}/${crypto.randomUUID()}.${extensions[file.type]}`;

  const { error } = await supabase.storage
    .from("efootball-media")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("efootball-media")
    .getPublicUrl(path);

  return { image_url: data.publicUrl };
}

async function submitPlayer(uid: string, body: Record<string, unknown>) {
  const username = String(body.username || "").trim();
  const whatsapp = String(body.whatsapp || "").trim();
  const mpesaCode = String(body.mpesa_code || "").trim().toUpperCase();
  const imageUrl = assertOwnedImageUrl(
    body.squad_image_url,
    uid,
    "players",
  );

  if (!username || !whatsapp || !mpesaCode) {
    throw new Error("Complete all player registration fields.");
  }

  const { data, error } = await supabase
    .from("efootball_player_submissions")
    .insert({
      user_id: uid,
      username,
      whatsapp,
      squad_image_url: imageUrl,
      mpesa_code: mpesaCode,
      fee_kes: 30,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw error;

  const { error: contactError } = await supabase
    .from("efootball_private_contacts")
    .insert({
      listing_id: data.id,
      owner_firebase_uid: uid,
      whatsapp,
    });

  if (contactError) {
    await supabase.from("efootball_player_submissions")
      .delete().eq("id", data.id);
    throw contactError;
  }

  return { id: data.id, status: "pending" };
}

async function submitMarket(uid: string, body: Record<string, unknown>) {
  const username = String(body.username || "").trim();
  const listingType = body.listing_type;
  const description = String(body.description || "").trim();

  if (!username || !description) {
    throw new Error("Enter a username and listing description.");
  }

  if (listingType !== "buy" && listingType !== "sell") {
    throw new Error("Invalid marketplace listing type.");
  }

  const imageUrl = body.market_image_url
    ? assertOwnedImageUrl(body.market_image_url, uid, "market")
    : null;

  const price = body.asking_price == null || body.asking_price === ""
    ? null
    : Number(body.asking_price);

  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    throw new Error("Enter a valid asking price.");
  }

  const { data, error } = await supabase
    .from("efootball_market_submissions")
    .insert({
      user_id: uid,
      username,
      listing_type: listingType,
      asking_price: price,
      description,
      market_image_url: imageUrl,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id, status: "pending" };
}

async function submitTournament(
  uid: string,
  body: Record<string, unknown>,
) {
  const { data: member, error: memberError } = await supabase
    .from("efootball_members")
    .select("status")
    .eq("user_id", uid)
    .maybeSingle();

  if (memberError) throw memberError;

  if (member?.status !== "approved") {
    throw new Error(
      "Approved Efootball membership is required to create a tournament.",
    );
  }

  const name = String(body.name || "").trim();
  const roomNumber = String(body.room_number || "").trim();
  const posterUrl = assertOwnedImageUrl(
    body.poster_url,
    uid,
    "tournaments",
  );
  const maxMembers = Number(body.max_members);
  const instructions = String(body.instructions || "").trim();

  if (!name || !roomNumber) {
    throw new Error("Enter the tournament name and room number.");
  }

  if (
    !Number.isInteger(maxMembers) ||
    maxMembers < 2 ||
    maxMembers > 256
  ) {
    throw new Error("Maximum players must be between 2 and 256.");
  }

  const { data, error } = await supabase
    .from("efootball_tournament_submissions")
    .insert({
      user_id: uid,
      name,
      poster_url: posterUrl,
      max_members: maxMembers,
      room_number: roomNumber,
      instructions,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id, status: "pending" };
}

async function getTournamentDetails(
  uid: string,
  body: Record<string, unknown>,
) {
  const tournamentId = String(body.tournament_id || "").trim();

  if (!tournamentId) {
    throw new Error("A tournament ID is required.");
  }

  const { data: member, error: memberError } = await supabase
    .from("efootball_members")
    .select("status")
    .eq("user_id", uid)
    .maybeSingle();

  if (memberError) throw memberError;

  if (member?.status !== "approved") {
    throw new Error("Approved Efootball membership is required.");
  }

  const { data, error } = await supabase
    .from("efootball_tournament_submissions")
    .select("id, room_number, instructions, status")
    .eq("id", tournamentId)
    .in("status", ["open", "full"])
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("This tournament is not currently available.");
  }

  return {
    room_number: data.room_number,
    instructions: data.instructions,
  };
}

async function reviewSubmission(body: Record<string, unknown>) {
  const kind = body.kind;
  const id = String(body.id || "");
  const decision = body.decision;

  const tables: Record<string, string> = {
    player: "efootball_player_submissions",
    market: "efootball_market_submissions",
    tournament: "efootball_tournament_submissions",
  };

  if (typeof kind !== "string" || !tables[kind] || !id) {
    throw new Error("Invalid submission.");
  }

  if (kind === "player" && decision === "approve") {
    const { error } = await supabase.rpc("efootball_approve_player", {
      p_submission_id: id,
    });

    if (error) throw error;

    return {
      id,
      status: "approved",
      member_status: "approved",
    };
  }

  let status: string;

  if (decision === "approve") {
    status = kind === "tournament" ? "open" : "approved";
  } else if (decision === "reject") {
    status = "rejected";
  } else if (kind === "tournament" && decision === "complete") {
    status = "completed";
  } else {
    throw new Error("Invalid review decision.");
  }

  const update: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  };

  if (kind === "tournament" && body.winner) {
    update.winner = String(body.winner).trim();
  }

  const { data, error } = await supabase
    .from(tables[kind])
    .update(update)
    .eq("id", id)
    .select("id,status")
    .single();

  if (error) throw error;

  return { id: data.id, status: data.status };
}

async function setMemberStatus(body: Record<string, unknown>) {
  const userId = String(body.user_id || "");
  const status = body.status;

  if (
    !userId ||
    !["pending", "approved", "rejected"].includes(String(status))
  ) {
    throw new Error("Invalid member update.");
  }

  const { error } = await supabase
    .from("efootball_members")
    .upsert({ user_id: userId, status }, { onConflict: "user_id" });

  if (error) throw error;
  return { user_id: userId, status };
}

async function listPending() {
  const tables = [
    "efootball_player_submissions",
    "efootball_market_submissions",
    "efootball_tournament_submissions",
  ];

  const results = await Promise.all(
    tables.map((table) =>
      supabase.from(table).select("*").eq("status", "pending")
        .order("created_at", { ascending: false })
    ),
  );

  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  return {
    players: results[0].data || [],
    market: results[1].data || [],
    tournaments: results[2].data || [],
  };
}

async function getPrivateContact(
  uid: string,
  body: Record<string, unknown>,
) {
  const listingId = String(body.listing_id || "");
  const listingType = body.listing_type || "player";

  if (!listingId) {
    throw new Error("A listing ID is required.");
  }

  if (listingType !== "player" && listingType !== "market") {
    throw new Error("Invalid listing type.");
  }

  const { data: member, error: memberError } = await supabase
    .from("efootball_members")
    .select("status")
    .eq("user_id", uid)
    .maybeSingle();

  if (memberError) throw memberError;

  if (member?.status !== "approved") {
    throw new Error("Approved Efootball membership is required.");
  }

  let ownerUid: string;
  let whatsapp: string | null = null;

  if (listingType === "player") {
    const { data: listing, error } = await supabase
      .from("efootball_player_submissions")
      .select("id,status,user_id")
      .eq("id", listingId)
      .maybeSingle();

    if (error) throw error;

    if (!listing || listing.status !== "approved") {
      throw new Error("This player listing is not available.");
    }

    ownerUid = listing.user_id;

    const { data: contact, error: contactError } = await supabase
      .from("efootball_private_contacts")
      .select("whatsapp")
      .eq("listing_id", listingId)
      .maybeSingle();

    if (contactError) throw contactError;
    whatsapp = contact?.whatsapp || null;
  } else {
    const { data: listing, error } = await supabase
      .from("efootball_market_submissions")
      .select("id,status,user_id")
      .eq("id", listingId)
      .maybeSingle();

    if (error) throw error;

    if (!listing || listing.status !== "approved") {
      throw new Error("This marketplace listing is not available.");
    }

    ownerUid = listing.user_id;

    // Use the owner's approved player registration number.
    const { data: player, error: playerError } = await supabase
      .from("efootball_player_submissions")
      .select("whatsapp")
      .eq("user_id", ownerUid)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (playerError) throw playerError;
    whatsapp = player?.whatsapp || null;
  }

  if (ownerUid === uid) {
    throw new Error("This is your own listing.");
  }

  if (!whatsapp) {
    throw new Error("The owner's approved player contact is unavailable.");
  }

  return { whatsapp };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.includes(origin)) {
      return new Response("Origin not allowed.", { status: 403 });
    }

    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return response({ error: "Method not allowed." }, 405, origin);
  }

  if (origin && !allowedOrigins.includes(origin)) {
    return response({ error: "Origin not allowed." }, 403, origin);
  }

  try {
    const user = await verifyUser(req);
    const contentType = req.headers.get("Content-Type") || "";

    let result: unknown;

    if (contentType.includes("multipart/form-data")) {
      result = await uploadImage(req, user.uid);
      return response(result, 200, origin);
    }

    const contentLength = Number(req.headers.get("Content-Length") || 0);

    if (contentLength > 100_000) {
      return response({ error: "Request is too large." }, 413, origin);
    }

    const body = await req.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body.");
    }

    switch (body.action) {
      case "submit_player":
        result = await submitPlayer(user.uid, body);
        break;

      case "submit_market":
        result = await submitMarket(user.uid, body);
        break;

      case "submit_tournament":
        result = await submitTournament(user.uid, body);
        break;

      case "get_contact":
        result = await getPrivateContact(user.uid, body);
        break;

      case "get_tournament_details":
        result = await getTournamentDetails(user.uid, body);
        break;

      case "check_member": {
        const { data, error } = await supabase
          .from("efootball_members")
          .select("status")
          .eq("user_id", user.uid)
          .maybeSingle();

        if (error) throw error;

        result = { is_member: data?.status === "approved" };
        break;
      }

      case "admin_list_pending":
        requireAdmin(user.uid);
        result = await listPending();
        break;

      case "admin_review":
        requireAdmin(user.uid);
        result = await reviewSubmission(body);
        break;

      case "admin_set_member":
        requireAdmin(user.uid);
        result = await setMemberStatus(body);
        break;

      default:
        return response({ error: "Unknown action." }, 400, origin);
    }

    return response(result, 200, origin);
  } catch (error) {
    console.error("Efootball API error:", error);

    const message = error instanceof Error
      ? error.message
      : "Unexpected server error.";

    const status = message.includes("Administrator access")
      ? 403
      : message.includes("sign in") || message.includes("Firebase")
      ? 401
      : 400;

    return response({ error: message }, status, origin);
  }
});
