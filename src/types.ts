export type Hostel = {
  id: string;
  name: string;
  description?: string | null;
  area: string;
  landmark?: string | null;
  location_url?: string | null;
  image_urls: string[];
  rent_amount: number;
  rent_period: "month" | "semester";
  room_type: string;
  total_rooms?: number | null;
  available_rooms: number;
  occupied_rooms?: number | null;
  available_from?: string | null;
  facilities: string[];
  contact_name?: string | null;
  verified: boolean;
  availability_updated_at?: string | null;
  status: "draft" | "published" | "unavailable";
};

export type RoommatePost = {
  id: string;
  display_name: string;
  course?: string | null;
  study_year?: string | null;
  gender?: string | null;
  area: string;
  budget_min: number;
  budget_max: number;
  move_in_date?: string | null;
  accommodation_type: string;
  listing_type: "seeking_roommate" | "has_room";
  roommates_needed: number;
  lifestyle?: string | null;
  message?: string | null;
  status: "pending" | "published" | "matched" | "closed";
  created_at?: string;
};

export type HostelUpdate = Partial<Pick<
  Hostel,
  "rent_amount" | "available_rooms" | "occupied_rooms" | "available_from" |
  "status" | "description" | "facilities"
>>;

export type RoommateRequestInput = Omit<
  RoommatePost,
  "id" | "status" | "created_at"
> & { private_contact: string };
