<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4e6bb5c0-3499-41a1-983e-16467a405e78

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy env template and add secrets locally (never commit):
   ```bash
   cp .env.example .env.local
   ```
   Set `OPENAI_API_KEY` in **`.env.local`** only.
3. Run the app: `npm run dev`

## Production (Netlify)

1. Open your site → **Site configuration** → **Environment variables**
2. Add `OPENAI_API_KEY` with scope **Functions** (and redeploy)
3. Do **not** add OpenAI keys as `VITE_*` variables — they must stay server-side

## API key security

- `.env`, `.env.local`, and real keys are **gitignored** and must never be pushed to GitHub
- OpenAI calls run through `/api/*` server routes, not the browser
- If a key was ever exposed, revoke it at [OpenAI API keys](https://platform.openai.com/api-keys) and create a new one
