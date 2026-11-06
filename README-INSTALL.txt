# Chuka CPL — Team Management Update

## Files in this package

- `src/Cpl.tsx` — adds Chairman team editing and Coach team-profile editing.
- `src/Cpl.css` — styles the new team editor and logo preview.
- `apps-script/cpl/Code.gs` — adds the secure Chairman update action, coach profile updates with Drive logo upload, and direct coach approval during team creation.

## Files not changed

`src/lib/cplApi.ts` does not need modification. Its existing generic `cplApi.action(user, action, body)` supports these actions and the image payload. Do not replace it.

## Install frontend

Copy `src/Cpl.tsx` to your project `src/Cpl.tsx` and `src/Cpl.css` to `src/Cpl.css`. Keep your existing `src/lib/cplApi.ts`, logo assets, Firebase configuration, and all other project files.

## Update Apps Script

1. Open the existing CPL Apps Script project.
2. Back up the current `Code.gs` first.
3. Replace the existing CPL backend code with `apps-script/cpl/Code.gs` from this package. This file includes the existing CPL backend modules as well as the new changes.
4. Save, then Deploy → Manage deployments → Edit the existing web app deployment → select **New version** → Deploy.
5. Keep the same Apps Script web app URL. Do not run `rebuildCplDatabase()` or `setupCplSystem()` again.

## Permissions and behaviour

- Chairman can edit team name, league, description, WhatsApp group link/ID and logo.
- A Coach can edit description, WhatsApp group link/ID and logo only for a team assigned to that coach.
- Logo uploads accept JPG, PNG and WEBP up to 5 MB and are stored in the existing configured Drive folder under `Team Logos`.
- When a Chairman creates a team with a registered, active user email, that user is promoted to Coach and assigned to the new team. The coach must have signed into CPL at least once.
- The Chairman does not gain coach privileges from this operation.

## Verify

Run `npm run build`. Then test Chairman editing, Coach editing, logo upload, and coach assignment using a registered account. Check the `Teams` sheet for updated fields and `Users.activeRole` / `RoleRequests` for direct coach approval.
