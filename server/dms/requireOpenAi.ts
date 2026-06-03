import type { Response } from 'express';

export const OPENAI_REQUIRED_MESSAGE =
  'OpenAI is required to parse DMS reports. Locally: add OPENAI_API_KEY to .env (or .env.local) and run npm run dev. Production (Netlify): Site settings → Environment variables → set OPENAI_API_KEY (Functions scope), then redeploy.';

export function hasUsableOpenAIKey(): boolean {
  const openaiKey = process.env.OPENAI_API_KEY;
  const isMaskedKey = !!(openaiKey && openaiKey.includes('*'));
  return !!(
    openaiKey &&
    openaiKey.trim() !== '' &&
    !openaiKey.includes('YOUR_') &&
    !isMaskedKey
  );
}

export function openAiKeyRejectionReason(): string | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || openaiKey.trim() === '' || openaiKey.includes('YOUR_')) {
    return OPENAI_REQUIRED_MESSAGE;
  }
  if (openaiKey.includes('*')) {
    return 'OPENAI_API_KEY looks masked (contains *). Paste the full key from the OpenAI dashboard.';
  }
  return null;
}

/** Sends 422 and returns true when the request should abort (no OpenAI key). */
export function rejectIfOpenAiUnavailable(res: Response): boolean {
  const reason = openAiKeyRejectionReason();
  if (!reason) return false;
  res.status(422).json({ error: reason, requiresOpenAi: true });
  return true;
}

export function openAiFailureStatus(err: unknown): number {
  const anyErr = err as { status?: number; statusCode?: number; message?: string };
  const msg = (anyErr?.message || String(err)).toLowerCase();
  const status = anyErr?.status || anyErr?.statusCode;
  if (status === 401 || msg.includes('incorrect api key') || msg.includes('invalid_api_key')) {
    return 401;
  }
  if (status === 429 || msg.includes('quota') || msg.includes('rate limit')) {
    return 429;
  }
  return 502;
}

export function openAiFailureMessage(err: unknown): string {
  const anyErr = err as { message?: string; error?: { message?: string } };
  const raw = anyErr?.error?.message || anyErr?.message || String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('incorrect api key') ||
    lower.includes('invalid_api_key') ||
    lower.includes('authentication')
  ) {
    return 'The server OpenAI API key was rejected. Update OPENAI_API_KEY in Netlify environment variables (Site settings → Environment variables, Functions scope) or in .env locally, redeploy, and try again.';
  }
  return raw
    .replace(/sk-proj-[a-zA-Z0-9_*-]+/gi, 'sk-proj-***')
    .replace(/sk-[a-zA-Z0-9_*-]+/gi, 'sk-***')
    .replace(/OPENAI_API_KEY[=:\s]+[^\s]+/gi, 'OPENAI_API_KEY=[redacted]');
}
