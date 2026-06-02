# AGENTS.md

## Cursor Cloud specific instructions

### Stack
- React 19 + Vite frontend, Express API in `server.ts` (run together via `npm run dev`).
- Firebase Auth + Firestore (`artifacts/hyundai-sales-to-service/public/data/...`).

### Commands
- Install: `npm install`
- Lint: `npm run lint`
- Build: `npm run build`
- Dev: `npm run dev` (serves UI and API on port 3000)

### Multi-tenant RBAC
- Tenant profiles live in `src/lib/tenants.ts` (`nissan-mazda`, `ford-lincoln`, `hyundai`).
- User docs: `.../data/users/{uid}` with `tenantId`, `department`, `role`, `approved`.
- Audit logs: `.../data/logs` filtered by `tenantId`.
- Tenant DMS config: `.../data/tenants/{tenantId}`.
- Firestore rules in `firestore.rules` enforce manager tenant isolation.

### Nav visibility
- **Sales** department: Sales dropdown + Sales Performance report only.
- **Service** department: Sales + Service nav + Operations/Forecast reports.
- **Manager** role: Manager Control Panel (same tenant only).
- **admin** role: platform Admin panel + dealership switcher.

### Notes
- New enrollments default to `role: pending`, `approved: false` until a manager approves.
- Deploy updated `firestore.rules` to Firebase separately after merging RBAC changes.
