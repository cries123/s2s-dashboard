import type { Express } from 'express';
import { hasUsableOpenAIKey } from '../dms/requireOpenAi.js';

function hasUsableGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return !!(key && key.trim() && !key.includes('YOUR_') && !key.includes('*'));
}

/** Public status only — never returns key material. */
export function registerAiConfigRoute(app: Express) {
  app.get('/api/ai-config', (_req, res) => {
    res.json({
      /** Keys live on the server (Netlify Functions env), not in the browser or git. */
      storage: 'server',
      openai: hasUsableOpenAIKey(),
      gemini: hasUsableGeminiKey(),
      productivityParse: hasUsableOpenAIKey(),
      salesNoteScan: hasUsableOpenAIKey(),
    });
  });
}
