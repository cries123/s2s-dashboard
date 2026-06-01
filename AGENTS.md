# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Single-app **S2S Dashboard** (Sales-to-Service): React 19 + Vite 6 frontend with an Express backend in one process (`server.ts`). Firebase Auth + Firestore for persistence. See `README.md` for basic run commands.

### Services

| Service | Port | Start command |
|---------|------|---------------|
| S2S App (Express + Vite) | 3000 | `npm run dev` |

No docker-compose, no local database, no Firebase emulator in this repo.

### Environment setup

Firebase config is committed in `firebase-applet-config.json`. Copy values into `.env.local` (gitignored) before running:

```bash
cp .env.example .env.local
# Populate VITE_FIREBASE_* from firebase-applet-config.json:
#   projectId → VITE_FIREBASE_PROJECT_ID
#   apiKey → VITE_FIREBASE_API_KEY
#   authDomain → VITE_FIREBASE_AUTH_DOMAIN
#   storageBucket → VITE_FIREBASE_STORAGE_BUCKET
#   messagingSenderId → VITE_FIREBASE_MESSAGING_SENDER_ID
#   appId → VITE_FIREBASE_APP_ID
#   firestoreDatabaseId → VITE_FIREBASE_DATABASE_ID
```

Optional: `GEMINI_API_KEY`, `OPENAI_API_KEY` for AI parsing features (server has deterministic fallbacks without them).

### Lint / build / run

| Task | Command |
|------|---------|
| Lint | `npm run lint` (TypeScript `tsc --noEmit`) |
| Build | `npm run build` |
| Dev server | `npm run dev` → http://localhost:3000 |
| Production | `npm run build` then `NODE_ENV=production npm start` |

There is no test script in `package.json`.

### Verifying the environment without login

- Health check: `curl http://localhost:3000/api/ping`
- NHTSA VIN decode (core API proxy): `curl http://localhost:3000/api/nhtsa/decode/<17-char-vin>`

Full dashboard features require Firebase login with an approved user (`status: approved` in Firestore). Signup join codes are in `src/constants.ts` (`HY934`, `FO281`, `NM506`).

### Gotchas

- **Static deploys lack API routes.** Firebase Hosting / Netlify only publish the Vite `dist` frontend. Use `npm run dev` locally to test `/api/*` endpoints (NHTSA proxy, PDF parsing, AI routes).
- **Vite env loading:** `vite.config.ts` uses `loadEnv(mode, '.', '')` so both `.env` and `.env.local` work; the dev server also loads env via `dotenv` in `server.ts`.
- **Node version:** CI/Netlify use Node 20; Node 22 also works in Cloud Agent VMs.
- **`DISABLE_HMR=true`:** Disables Vite HMR (used in AI Studio agent edits); leave unset for normal local dev.
