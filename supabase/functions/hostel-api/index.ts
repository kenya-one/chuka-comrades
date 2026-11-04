import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const adminUids = (Deno.env.get("HOSTEL_ADMIN_UIDS") || Deno.env.get("EFOOTBALL_ADMIN_UIDS") || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const allowedOrigins = (Deno.env.get("FRONTEND_ORIGINS") || "http://localhost:5173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const bucket = "hostel-media";

if (!firebaseProjectId || !supabaseUrl || !serviceRoleKey) {
  throw new Error("Required Hostel API environment variables are missing.");
}

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const firebaseKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}
async function verifyUser(req: Request): Promise<string> {
  const match = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Please sign in before continuing.");
  try {
    const { payload } = await jwtVerify(match[1], firebaseKeys, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Invalid Firebase user.");
    return payload.sub;
  } catch { throw new Error("Please sign in again to continue."); }
}
function requireAdmin(uid: string) {
  if (!adminUids.includes(uid)) throw new Error("Administrator access required.");
}
function text(value: unknown, label: string, max: number, min = 1): string {
  const result = String(value ?? "").trim();
  if (result.length < min || result.length > max) throw new Error(`${label} must be between ${min} and ${max} characters.`);
  return result;
}
function number(value: unknown, label: string, min = 0, max = 100000000): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${label} must be a valid number.`);
  return result;
}
function validPhone(value: string) {
  return /^[+0-9\s()-]{8,24}$/.test(value) && value.replace(/\D/g, "").length >= 9;
}
function validImageUrls(value: unknown, uid: string): string[] {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "string")) {
    throw new Error("Please upload exactly two hostel photos.");
  }
  const prefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/hostels/${uid}/`;
  const urls = value as string[];
  if (urls.some((url) => !url.startsWith(prefix))) throw new Error("One or more photos are not valid hostel uploads.");
  return urls;
}

async function uploadImage(req: Request, uid: string, origin: string | null) {
  requireAdmin(uid); // Only the admin adds landlord-supplied hostel photos.
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Choose an image to upload." }, 400, origin);
  if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ error: "Each photo must be 5 MB or smaller." }, 413, origin);
  const allowed: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const extension = allowed[file.type];
  if (!extension) return json({ error: "Use a JPG, PNG or WEBP image." }, 415, origin);
  const path = `hostels/${uid}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (error) throw error;
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return json({ image_url: data.publicUrl }, 200, origin);
}

async function publicListings() {
  const { data, error } = await db.from("hostel_listings_public")
    .select("id,name,description,area,landmark,location_url,image_urls,rent_amount,rent_period,room_type,total_rooms,available_rooms,available_from,facilities,contact_name,landlord_contact,verified,status")
    .eq("status", "published").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return { listings: data || [] };
}

async function submitHostel(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid); // Legacy submissions are admin-only; landlords use WhatsApp.
  const name = text(body.name, "Hostel name", 100, 2);
  const area = text(body.area, "Location / area", 100, 2);
  const landlordName = text(body.landlord_name, "Landlord name", 80, 2);
  const landlordContact = text(body.landlord_whatsapp, "Landlord contact number", 24, 9);
  if (!validPhone(landlordContact)) throw new Error("Enter a valid landlord WhatsApp/call number.");
  if (body.contact_public !== true) throw new Error("Please confirm that the landlord contact may be displayed on the published listing.");
  const imageUrls = validImageUrls(body.image_urls, uid);
  const rentPeriod = body.rent_period;
  if (rentPeriod !== "month" && rentPeriod !== "semester") throw new Error("Choose a valid rent period.");
  const locationUrl = body.location_url ? text(body.location_url, "Map link", 500) : null;
  if (locationUrl && !/^https:\/\//i.test(locationUrl)) throw new Error("The map link must start with https://.");
  const facilities = Array.isArray(body.facilities) ? body.facilities.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [];
  const availableFrom = body.available_from ? text(body.available_from, "Availability date", 10) : null;
  const { data, error } = await db.from("hostel_submissions").insert({
    submitted_by: uid,
    name,
    description: body.description ? text(body.description, "Description", 2000, 0) : null,
    area,
    landmark: body.landmark ? text(body.landmark, "Landmark", 120) : null,
    location_url: locationUrl,
    image_urls: imageUrls,
    rent_amount: number(body.rent_amount, "Rent amount"),
    rent_period: rentPeriod,
    room_type: text(body.room_type, "Room type", 80, 2),
    total_rooms: body.total_rooms === null || body.total_rooms === "" ? null : number(body.total_rooms, "Total rooms"),
    available_rooms: number(body.available_rooms, "Available rooms"),
    available_from: availableFrom,
    facilities,
    landlord_name: landlordName,
    landlord_whatsapp: landlordContact,
    contact_public: true,
    status: "pending",
  }).select("id,status,created_at").single();
  if (error) throw error;
  return data;
}


async function createListing(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const name = text(body.name, "Hostel name", 100, 2);
  const area = text(body.area, "Location / area", 100, 2);
  const contactName = text(body.contact_name, "Landlord / caretaker name", 80, 2);
  const landlordContact = text(body.landlord_contact, "Landlord contact number", 24, 9);
  if (!validPhone(landlordContact)) throw new Error("Enter a valid landlord WhatsApp/call number.");
  const imageUrls = validImageUrls(body.image_urls, uid);
  const rentPeriod = body.rent_period;
  if (rentPeriod !== "month" && rentPeriod !== "semester") throw new Error("Choose a valid rent period.");
  const locationUrl = body.location_url ? text(body.location_url, "Map link", 500) : null;
  if (locationUrl && !/^https:\/\//i.test(locationUrl)) throw new Error("The map link must start with https://.");
  const facilities = Array.isArray(body.facilities) ? body.facilities.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [];
  const availableFrom = body.available_from ? text(body.available_from, "Availability date", 10) : null;
  const { data: listing, error } = await db.from("hostel_listings").insert({
    name,
    description: body.description ? text(body.description, "Description", 2000, 0) : null,
    area,
    landmark: body.landmark ? text(body.landmark, "Landmark", 120) : null,
    location_url: locationUrl,
    image_urls: imageUrls,
    rent_amount: number(body.rent_amount, "Rent amount"),
    rent_period: rentPeriod,
    room_type: text(body.room_type, "Room type", 80, 2),
    total_rooms: body.total_rooms === null || body.total_rooms === "" ? null : number(body.total_rooms, "Total rooms"),
    available_rooms: number(body.available_rooms, "Available rooms"),
    available_from: availableFrom,
    facilities,
    contact_name: contactName,
    verified: true,
    status: "published",
    availability_updated_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  const { error: contactError } = await db.from("hostel_private_contacts").insert({
    hostel_id: listing.id,
    landlord_contact: landlordContact,
    public_contact: true,
  });
  if (contactError) {
    await db.from("hostel_listings").delete().eq("id", listing.id);
    throw contactError;
  }
  return { id: listing.id, status: "published" };
}

async function adminDashboard(uid: string) {
  requireAdmin(uid);
  const [{ data: pending, error: pendingError }, { data: listings, error: listingsError }] = await Promise.all([
    db.from("hostel_submissions").select("id,name,description,area,landmark,location_url,image_urls,rent_amount,rent_period,room_type,total_rooms,available_rooms,available_from,facilities,landlord_name,landlord_whatsapp,created_at")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    db.from("hostel_listings").select("id,name,description,area,landmark,location_url,image_urls,rent_amount,rent_period,room_type,total_rooms,available_rooms,available_from,facilities,contact_name,verified,status,created_at,hostel_private_contacts!inner(landlord_contact)")
      .in("status", ["published", "unavailable"]).order("created_at", { ascending: false }).limit(200),
  ]);
  if (pendingError) throw pendingError;
  if (listingsError) throw listingsError;
  return {
    pending: pending || [],
    listings: (listings || []).map((item) => {
      const contact = Array.isArray(item.hostel_private_contacts) ? item.hostel_private_contacts[0] : item.hostel_private_contacts;
      const { hostel_private_contacts: _privateContacts, ...listing } = item;
      return { ...listing, landlord_contact: contact?.landlord_contact || "" };
    }),
  };
}

async function approveSubmission(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const id = text(body.submission_id, "Submission ID", 64);
  const { data: submission, error } = await db.from("hostel_submissions").select("*").eq("id", id).eq("status", "pending").maybeSingle();
  if (error) throw error;
  if (!submission) throw new Error("This submission is no longer pending.");
  const { data: listing, error: insertError } = await db.from("hostel_listings").insert({
    name: submission.name,
    description: submission.description,
    area: submission.area,
    landmark: submission.landmark,
    location_url: submission.location_url,
    image_urls: submission.image_urls,
    rent_amount: submission.rent_amount,
    rent_period: submission.rent_period,
    room_type: submission.room_type,
    total_rooms: submission.total_rooms,
    available_rooms: submission.available_rooms,
    available_from: submission.available_from,
    facilities: submission.facilities,
    contact_name: submission.landlord_name,
    verified: true,
    status: "published",
    availability_updated_at: new Date().toISOString(),
  }).select("id").single();
  if (insertError) throw insertError;
  const { error: contactError } = await db.from("hostel_private_contacts").insert({
    hostel_id: listing.id,
    landlord_contact: submission.landlord_whatsapp,
    public_contact: submission.contact_public,
  });
  if (contactError) {
    await db.from("hostel_listings").delete().eq("id", listing.id);
    throw contactError;
  }
  const { error: updateError } = await db.from("hostel_submissions").update({
    status: "approved", listing_id: listing.id, reviewed_by: uid, reviewed_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "pending");
  if (updateError) {
    await db.from("hostel_private_contacts").delete().eq("hostel_id", listing.id);
    await db.from("hostel_listings").delete().eq("id", listing.id);
    throw updateError;
  }
  return { id: listing.id, status: "published" };
}

async function rejectSubmission(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const id = text(body.submission_id, "Submission ID", 64);
  const reason = body.reason ? text(body.reason, "Rejection reason", 500) : "Please contact admin for corrections.";
  const { data, error } = await db.from("hostel_submissions").update({
    status: "rejected", rejection_note: reason, reviewed_by: uid, reviewed_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "pending").select("id,status").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This submission is no longer pending.");
  return data;
}

async function updateListing(uid: string, body: Record<string, unknown>) {
  requireAdmin(uid);
  const id = text(body.listing_id, "Listing ID", 64);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (body.status !== "published" && body.status !== "unavailable") throw new Error("Invalid listing status.");
    update.status = body.status;
  }
  if (body.available_rooms !== undefined) update.available_rooms = number(body.available_rooms, "Available rooms");
  if (body.rent_amount !== undefined) update.rent_amount = number(body.rent_amount, "Rent amount");
  const { data, error } = await db.from("hostel_listings").update(update).eq("id", id).select("id,status").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Hostel listing not found.");
  return data;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return json({ error: "Origin not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  try {
    const length = Number(req.headers.get("Content-Length") || 0);
    if (length > 11 * 1024 * 1024) return json({ error: "Request is too large." }, 413, origin);
    const contentType = req.headers.get("Content-Type") || "";
    if (contentType.includes("multipart/form-data")) {
      const uid = await verifyUser(req);
      requireAdmin(uid);
      return await uploadImage(req, uid, origin);
    }
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body.");
    if (body.action === "public_listings") return json(await publicListings(), 200, origin);

    const uid = await verifyUser(req);
    let result: unknown;
    switch (body.action) {
      case "submit_hostel": result = await submitHostel(uid, body); break;
      case "create_listing": result = await createListing(uid, body); break;
      case "admin_dashboard": result = await adminDashboard(uid); break;
      case "approve_submission": result = await approveSubmission(uid, body); break;
      case "reject_submission": result = await rejectSubmission(uid, body); break;
      case "update_listing": result = await updateListing(uid, body); break;
      default: return json({ error: "Unknown Hostel action." }, 400, origin);
    }
    return json(result, 200, origin);
  } catch (error) {
    console.error("Hostel API error:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message.includes("Administrator access") ? 403
      : message.includes("sign in") || message.includes("Firebase") ? 401 : 400;
    return json({ error: message }, status, origin);
  }
});
