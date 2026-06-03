<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4e6bb5c0-3499-41a1-983e-16467a405e78

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set:
   - `OPENAI_API_KEY` — PDF parsing (productivity, appointments, DMS reports)
   - `GEMINI_API_KEY` — optional Gemini fallbacks
3. Run the app:
   `npm run dev`

## Deploy (Netlify)

The API runs as a Netlify Function (`/.netlify/functions/api`). **Environment variables in `.env.local` are not used in production.**

1. Netlify → **Site configuration** → **Environment variables**
2. Add `OPENAI_API_KEY` with your full OpenAI key (no asterisks; copy it when created)
3. Scope: **Functions** (or All scopes)
4. **Deploy** → trigger a new deploy so functions pick up the new value

If localhost works but the live site shows an invalid API key error, Netlify still has an old or wrong `OPENAI_API_KEY` — update it there, not in the repo.
