<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# S2S Dashboard

## AI integration (no local key storage)

All AI features (productivity PDF import, sales note scan, DMS parsing, etc.) call **`/api/*` routes on the server**. The browser never sees or stores OpenAI/Gemini keys.

**For dealership staff using the live site:** nothing to install or configure on your computer — AI works when the site admin has set keys on the host.

### Production — Netlify (recommended)

1. Netlify → your site → **Site configuration** → **Environment variables**
2. Add **`OPENAI_API_KEY`** (full key from [OpenAI](https://platform.openai.com/api-keys))
3. Scope: **Functions** (required). Do **not** use a `VITE_` prefix.
4. Optional: **`GEMINI_API_KEY`** for Gemini-based forecast parsing
5. **Deploy** (or trigger redeploy after saving variables)

Verify: open `https://your-site.netlify.app/api/ai-config` — should show `"openai": true` (no key value is ever returned).

### Local development (optional)

Only needed if you run the app on your own machine:

```bash
npm install
cp .env.example .env.local   # optional
npm run dev
```

Or use **`npx netlify dev`** linked to your site — Netlify injects cloud env vars with no `.env.local` file.

## Run locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

Firebase client config uses `VITE_FIREBASE_*` in `.env.local` for local builds (these are public Firebase web keys, not OpenAI secrets).

## Security

- Never commit `.env`, `.env.local`, or API keys to GitHub
- Revoke any exposed keys at OpenAI and create new ones
- Keys belong only in **Netlify environment variables** (production) or local `.env.local` (dev)
