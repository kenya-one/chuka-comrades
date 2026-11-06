# Chuka Premier League — Google Sheets + Google Drive backend

## Phase 1 scope

This folder is the CPL data layer for the Chuka Comrades app.

**Google Sheets is the structured database. Google Drive is the media/file store. Firebase Google Auth remains the identity provider.**

### Setup

1. Open the Apps Script project.
2. Paste `Code.gs`.
3. Run `setupCplSystem()` once.
4. In **Project Settings → Script properties**, add:
   - `FIREBASE_WEB_API_KEY` = Firebase Web API key
   - `CPL_CHAIRMAN_EMAILS` = Chairman Firebase email(s), comma-separated
5. Deploy as **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the Web App URL into `VITE_CPL_API_URL`.

### Sheets created

Settings, Users, Seasons, TransferWindows, Teams, Players, PlayerApplications, Follows, Fixtures,
MatchPosters, Lineups, MatchReports, MatchEvents, Transfers, TransferLog, Competitions,
CompetitionTeams, CompetitionRounds, CompetitionFixtures, Votes, Awards, TeamCollections,
CollectionPayments, Finance, WhatsAppGroups, News, DriveFiles, Disputes, AuditLog, DeletionReceipts.

### Drive folders

- Team Badges
- Player Photos
- Match Posters
- News Media
- Dispute Evidence
- Receipts
- League Documents

### Business rules included

- One Chairman admin role.
- One head coach per team per season; a coach cannot lead two teams in the same season.
- League A and League B.
- CPL Cup is a single-leg knockout and can contain teams from both leagues.
- Cup referee fee setting defaults to KSh 200 per team.
- Transfer windows control team-to-team transfers.
- Four-step transfer flow: new coach → player → current coach → Chairman.
- Team, CPL Community and CPL Official WhatsApp groups.
- Captains are stored per team/season.
- One match poster per team per fixture.
- Referee submits result; Chairman approves before it becomes public.
- Late lineups are recorded.
- Completed collections can only be permanently deleted by Chairman approval.
- A deletion receipt remains in the audit trail.
- Audit log uses a chained SHA-256 hash so tampering is detectable.
- Drive media can be public only when explicitly marked public.

### Important

Google Sheets is not a tamper-proof database. Keep edit access restricted to the Apps Script owner and trusted administrators. The app should never expose spreadsheet edit links to normal CPL users.

## Next implementation phase

Wire `src/lib/cplApi.ts` to these actions, then replace the static CPL landing placeholders with live:
- season/league cards
- fixtures and match centre
- standings
- teams and players
- top scorers/assists
- Cup bracket
- transfers
- match posters
- WhatsApp links
- sign-in/onboarding for a new CPL user


## Phase 2 frontend wiring

`src/lib/cplApi.ts` now consumes this Apps Script directly. `src/Cpl.tsx` loads public CPL data on entry and renders live fixtures, results, standings, teams and verified top scorers/assists.

Signed-in users get a role-aware **My CPL** dashboard:
- Chairman: role/player approvals and result verification
- Coach: team operations, fixtures and transfer offers
- Player: applications and transfer decisions
- Referee: assigned fixtures and result submission
- Fan: team follows and role applications

Set `VITE_CPL_API_URL` to the deployed Apps Script Web App URL.
