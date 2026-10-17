import type { Response } from 'express';

export const OPENAI_REQUIRED_MESSAGE =
  'AI parsing is not configured on the server. In Netlify: Site configuration → Environment variables → add OPENAI_API_KEY (Functions scope), redeploy, and retry. Keys are never stored in the app or browser — only on the hosting server.';

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

/**
 * The project behind the key is not allowed this model ("Project `proj_…`
 * does not have access to model `gpt-4o-mini`"), or the model doesn't exist.
 * Hyundai's project hit this on 2026-10-16.
 */
export function isOpenAiModelAccessError(err: unknown): boolean {
  const anyErr = err as { message?: string; code?: string; error?: { message?: string; code?: string } };
  const text = `${anyErr?.error?.message ?? ''} ${anyErr?.message ?? ''} ${anyErr?.code ?? ''} ${anyErr?.error?.code ?? ''}`.toLowerCase();
  return text.includes('does not have access to model') || text.includes('model_not_found') || text.includes('the model `') && text.includes('does not exist');
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
    return 'The server OpenAI API key was rejected. Update OPENAI_API_KEY in Netlify → Environment variables (Functions scope), redeploy, and try again.';
  }
  if (isOpenAiModelAccessError(err)) {
    return "The OpenAI project this app uses isn't allowed to use the AI model it asked for. In OpenAI's dashboard (platform.openai.com → Settings → Project → Limits), allow gpt-4o-mini, then try again.";
  }
  return raw
    .replace(/proj_[a-zA-Z0-9]+/g, 'proj_***')
    .replace(/sk-proj-[a-zA-Z0-9_*-]+/gi, 'sk-proj-***')
    .replace(/sk-[a-zA-Z0-9_*-]+/gi, 'sk-***')
    .replace(/OPENAI_API_KEY[=:\s]+[^\s]+/gi, 'OPENAI_API_KEY=[redacted]');
}
