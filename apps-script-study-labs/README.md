# Study Labs backend (Google Apps Script)

Database = one Google Sheet. Files = one private Drive folder (+ a `Covers` subfolder).

## Update steps
1. Paste `Code.gs` and `appsscript.json` into the Apps Script project.
2. Run **`setupStudyLabs`** once. It is safe to re-run: it adds the new columns/tabs (Products cover, Orders, PartnerRequests…) without touching existing rows.
3. Run **`checkSetup`** and confirm everything says OK / set.
4. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.** The `/exec` URL stays the same.
5. Open Study Labs as the admin → **Admin → Settings** and enter the WhatsApp group link, M-Pesa number/till and the name on the account.

## Script properties
`FIREBASE_API_KEY`, `ADMIN_EMAILS`, `SHEET_ID`, `DRIVE_FOLDER_ID`, `COVERS_FOLDER_ID` are set by setup. `WHATSAPP_COMMUNITY_URL`, `MPESA_NUMBER`, `MPESA_NAME` are managed from Admin → Settings.

## How content flows
- **Notes / past papers / revision guides** → `Resources`, pending → admin approves → public file link. Cards always use `public/notes-cover.svg`.
- **Projects / digital products / templates** → `Products` with an uploaded cover (cover becomes public on approval).
  - Price 0: file becomes public on approval, anyone can download.
  - Paid: file stays private. Buyer pays by M-Pesa and submits the transaction code → `Orders` (pending) → admin verifies → buyer's Google account is added as a Drive viewer.
- **Study partners**: profile (pending → approved). Requests live in `PartnerRequests`; WhatsApp numbers are only revealed to both sides after the owner accepts.
- **Opportunities / Events**: admin posts directly, or students suggest (status `pending`, `suggested_by` set) and admin approves.
