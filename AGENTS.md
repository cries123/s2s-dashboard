# AGENTS.md

## Cursor Cloud specific instructions

### Stack

Single-repo **React + Vite** frontend (`src/`) and **Node/Express** API (`server.ts`, bundled to `dist/server.cjs`). Firebase Auth/Firestore for data. Deploy target is **Netlify** (production: `salestoservice.net`).

### Entry point

The live UI shell is **`src/AuthenticatedApp.tsx`**, mounted from `src/main.tsx`. It provides the Manager nav, admin gear menu (User Settings / Master Users / Audit Logs), and URL-synced routes via `src/lib/appNavigation.ts`. Do not re-point `main.tsx` at the legacy `App.tsx` shell unless intentionally reverting.

### Common commands

See `package.json` scripts:

- **Dev:** `npm run dev` (Vite + server)
- **Build:** `npm run build`
- **Lint:** `npm run lint` (if defined)

### Netlify / cache

After merging to `main`, Netlify auto-deploys. If the site looks stale, hard-refresh or clear cache (especially on Fire Stick / Silk). Deep links like `/sales/onboard` and `/manager/operations` should restore the correct tab on reload.

### Services for E2E testing

| Service | Required | Notes |
|---------|----------|-------|
| `npm run dev` or built static + server | Yes | Full dashboard |
| Firebase (hosted) | Yes | Auth + Firestore; config in repo |
| OpenAI / DMS parsers | Optional | Only for PDF/OCR import flows |
