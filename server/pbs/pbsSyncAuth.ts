import type { Request } from 'express';

export function getPbsSyncSecret(): string | null {
  const secret =
    process.env.PBS_SYNC_SECRET?.trim() ||
    process.env.SYSTEM_WORKERS_PASSWORD?.trim() ||
    null;
  return secret || null;
}

export function isPbsSyncAuthorized(req: Request): boolean {
  const secret = getPbsSyncSecret();
  if (!secret) return false;

  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;

  const headerSecret = req.headers['x-pbs-sync-secret'];
  if (typeof headerSecret === 'string' && headerSecret === secret) return true;

  const bodySecret = (req.body as { secret?: string } | undefined)?.secret;
  if (bodySecret === secret) return true;

  return false;
}
