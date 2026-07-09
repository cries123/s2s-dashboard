# Agent instructions

## Git workflow — commit directly to `main`

Do **not** create feature branches or pull requests unless the user explicitly asks.

1. Check out `main` and pull latest: `git checkout main && git pull origin main`
2. Make changes, test, commit on `main`
3. Push: `git push origin main`

No `cursor/*` branches. No draft PRs. Same flow as Google AI Studio: changes land on the default branch.

## Secrets

- Never commit API keys. Production keys live in **Netlify → Environment variables → Functions** (`OPENAI_API_KEY`).
- All AI calls use server `/api/*` routes only.

## Run locally

```bash
npm install
npm run dev
```

## Netlify

After env var changes, redeploy. Verify AI: `GET /api/ai-config` on the live site.
