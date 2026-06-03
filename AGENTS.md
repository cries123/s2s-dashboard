# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

- **Frontend**: Vite + React SPA in `src/` (built to `dist/`).
- **Backend API**: Express routes in `server.ts`, with DMS parsers under `server/dms/`. PBS productivity PDF import uses `POST /api/parse-performance` via `registerParsePerformanceRoute` in `server/dms/handlers/parsePerformance.ts`.
- **Local dev**: `npm run dev` runs `tsx server.ts` (Express on port 3000 + Vite middleware).
- **Production (Netlify)**: Static site from `dist/`; `/api/*` is proxied to the Netlify function at `netlify/functions/api.ts`, which wraps `createApiApp()` from `server.ts`.

### Running services

| Service | Command | Notes |
|---------|---------|-------|
| Dev (frontend + API) | `npm run dev` | Port 3000 |
| Production Node server | `npm run build && npm start` | Serves `dist/` + API on port 3000 |
| Lint | `npm run lint` | `tsc --noEmit` (may report pre-existing type errors) |

### PBS / productivity PDF import

- Requires **`OPENAI_API_KEY`** in environment (Netlify site env vars for production). Without it, the route returns a structured error rather than a 404.
- Test locally: `curl -X POST http://localhost:3000/api/parse-performance -H 'Content-Type: application/json' -d '{"reportText":"..."}'`
- A 404 with HTML body on production usually means the Netlify API redirect or function is missing — check `netlify.toml` and that `netlify/functions/api.ts` is deployed.

### Gotchas

- Do not revert `server.ts` to the old inline `/api/parse-performance` handler; use `registerParsePerformanceRoute`.
- `createApiApp()` is imported by the Netlify function — avoid top-level Vite imports in the API path (Vite is dynamically imported only in `startServer()`).
- Netlify function timeout is 120s (`netlify.toml`); PDF parsing with OCR can be slow.
