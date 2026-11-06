# Chuka Comrades — Hostel & Roommate Add-on

This is an isolated React + TypeScript feature bundle. It is designed to be copied into
an existing Vite app without replacing or editing existing app files. It does not change
authentication, routing, existing Services, Efootball, Firebase, or Supabase setup.

## Included
- Hostel directory with images, location, rent, facilities and live room availability.
- WhatsApp enquiry link to the same admin number used for hostel and roommate enquiries.
- Roommate finder with two listing types:
  - Looking for a roommate.
  - Has a room and needs a roommate.
- Private contact details: public cards do not display a student's phone number.
- Admin editing is exposed through callbacks. Connect those callbacks to your existing
  secure admin API/Edge Function; never put a Supabase service-role key in the browser.
- SQL migration for the two data tables.

## Add to the existing project
1. Copy `src/hostel-roommate/` into your app's `src/` folder.
2. Copy the SQL file in `supabase/migrations/` into your Supabase migrations and review it
   before applying.
3. Import `HostelRoommateSection` where you want this section to appear:
   ```tsx
   import { HostelRoommateSection } from "./hostel-roommate/HostelRoommateSection";
   import "./hostel-roommate/hostel-roommate.css";

   <HostelRoommateSection
     adminWhatsApp={import.meta.env.VITE_SERVICES_ADMIN_WHATSAPP ?? ""}
     hostels={hostels}
     roommatePosts={roommatePosts}
     onSubmitRoommateRequest={submitRoommateRequest}
   />
   ```
4. Supply data from your existing Supabase layer. The props and row types are in
   `types.ts`. The section does not create a second Supabase client.
5. Set `VITE_SERVICES_ADMIN_WHATSAPP=2547XXXXXXXX` in `.env` (digits only, country code,
   no `+`). This is the shared admin WhatsApp contact for hostel and roommate enquiries.
6. For admin price/availability changes, connect `onAdminUpdateHostel` to a secure
   server-side function that verifies the existing admin identity before writing.
   This bundle intentionally does not bypass or replace your current admin/auth system.

## Data flow
- Landlord sends hostel name, photos, location/map pin, contact, rent, facilities and
  room counts to the admin on WhatsApp.
- Admin verifies and publishes the hostel in the app.
- Landlord can message the same admin WhatsApp to request rent or room-count changes.
  Admin verifies the request and updates the app through the existing secure admin flow.
- Students browse hostels and send enquiries to admin using the same WhatsApp contact.
- Students submit roommate requests; admin reviews and publishes them. Interested
  students ask admin to connect them. A student's phone number is never rendered publicly.

## Security notes
- Do not publish a student's phone number or private contact details in public queries.
- Do not expose Supabase service-role keys in Vite environment variables.
- Apply admin-only write policies through your existing verified admin mechanism.
- Verify landlord authorization and availability before marking a listing verified.
- Never ask students to pay a deposit through this app. Encourage in-person viewing
  and independent verification before payment.

## Important integration note
The project-specific router, Supabase client, Firebase token bridge and admin allowlist are
not available in this bundle. Therefore this is a non-invasive feature module with typed
integration points, not a claim that it is already wired into your live app. Existing
files remain untouched.


## Hostel admin editing and deletion update

The hostel admin desk now includes **Edit**, **Delete**, status controls and WhatsApp sharing for each existing listing.

### What administrators can edit
- Hostel name, description, area, landmark and Google Maps link
- Rent amount and rent period
- Room type, total rooms and available rooms
- Availability date, facilities and landlord/caretaker contact
- Verification and publication status
- Optional photo replacement (leave the photo picker empty to retain existing photos)

The editor prevents available rooms from exceeding total rooms when a total is provided. Deletion asks for confirmation, records the action in `ActivityLog`, removes the spreadsheet row and attempts to move that hostel's Drive photos to Trash.

### Deploy the backend update

The frontend uses the Google Apps Script URL configured in `src/lib/hostelApi.ts` (`VITE_HOSTEL_API_URL`, if supplied, overrides the default URL).

1. Open the Apps Script project currently serving the hostel database.
2. Replace/update its code with `apps-script/Code.gs`.
3. Confirm the administrator email in `isHostelAdmin()` is the correct account. The supplied backend currently authorizes `sidneywafula30@gmail.com`; do not change this unless that is the intended administrator.
4. Save the project.
5. Deploy > Manage deployments > Edit the existing Web App deployment, select **New version**, and deploy.
6. Keep the web app's existing access setting compatible with your Firebase-authenticated requests.
7. Test an edit, room-count update and deletion using a test listing before deleting any real hostel.

**Important:** The frontend update alone is not enough. The Apps Script backend must be redeployed with the new `delete_listing` action and photo-update support, otherwise Edit/Save or Delete will fail.
