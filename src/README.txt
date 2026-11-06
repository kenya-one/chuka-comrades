CHUKA PREMIER LEAGUE — SINGLE-SCREEN REDESIGN

Replace these files in your project:
  src/Cpl.tsx
  src/Cpl.css

Keep your existing public/cpllogo.jpeg file. The header and hero both use it.

What changed:
- Replaced the long scrolling landing page with tab-based views that switch in place.
- Added a visible Back to Home link in the header. It returns to the main Chuka Comrades site home anchor (#home).
- Kept My CPL / Sign in access in the header.
- Kept the existing CPL data/API calls and dashboard components in place.
- Added responsive sizing for desktop and mobile screens.

After replacing the files, run:
  npm run build
  npm run dev

This package was syntax-transpiled for TSX validation here, but it has not been built against your local project dependencies. If TypeScript reports a project-specific error, share the complete output.
