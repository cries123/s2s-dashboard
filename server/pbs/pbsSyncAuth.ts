import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';

export function getPbsSyncSecret(): string | null {
  const secret =
    process.env.PBS_SYNC_SECRET?.trim() ||
    process.env.SYSTEM_WORKERS_PASSWORD?.trim() ||
    null;
  return secret || null;
}

/**
 * Constant-time string compare. Plain `===` short-circuits on the first
 * mismatched character, which leaks how many leading characters of a guess
 * were correct via response timing. Hash both sides to a fixed-length digest
 * first so timingSafeEqual always compares equal-length buffers regardless
 * of the original secret's length.
 */
function secureCompare(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function isPbsSyncAuthorized(req: Request): boolean {
  const secret = getPbsSyncSecret();
  if (!secret) return false;

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && secureCompare(authHeader, `Bearer ${secret}`)) return true;

  const headerSecret = req.headers['x-pbs-sync-secret'];
  if (typeof headerSecret === 'string' && secureCompare(headerSecret, secret)) return true;

  const bodySecret = (req.body as { secret?: string } | undefined)?.secret;
  if (typeof bodySecret === 'string' && secureCompare(bodySecret, secret)) return true;

  return false;
}
