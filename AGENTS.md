## Cursor Cloud specific instructions

### Running the app

Use `npm run dev` (Express + Vite on port **3000**). Do not run Vite alone — PDF import and parse APIs live on the Express server.

Open the app at `http://localhost:3000` in the Desktop pane. External `*.cursorvm.com` preview links can fail with routing errors if the tunnel drops; refresh from the Ports panel.

### Lint / build / test

| Command | Purpose |
|---------|---------|
| `npm run lint` | TypeScript check (`tsc --noEmit`) |
| `npm run build` | Vite client build + server bundle |
| `npm run dev` | Development server |

### Routing (product polish)

Tabs sync to paths via `src/lib/appRoutes.ts` (e.g. `/service/alerts`, `/reports/operations`, `/competitions/pot-of-gold`). Role-based default home is in `src/lib/roleHome.ts`; mobile nav filtering is in `src/lib/roleNav.ts`.

### Multi-store notes

- Firestore rules in `firestore.rules` scope customers, dispatch, appointments, and performance docs by `dealershipId`. Deploy rules to Firebase when changing access behavior.
- Pot of Gold competition advisor columns are configured per dealership in **Admin → Operations** (`competitionAdvisors` on `dealershipSettings`).

### Known dev noise

Vite WebSocket / HMR messages in the browser console during PDF import are normal and not import failures.
