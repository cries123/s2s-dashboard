import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getPbsSyncSecret } from '../../server/pbs/pbsSyncAuth.js';
import { isPacificMorningSyncHour } from '../../server/pbs/pbsSync.js';

/**
 * Netlify scheduled function — runs hourly and triggers the PBS background sync
 * at 6:00 AM Pacific. The sync itself runs in pbs-sync-background (15-minute cap).
 * Configure PBS_SYNC_SECRET (or SYSTEM_WORKERS_PASSWORD) and FIREBASE_SERVICE_ACCOUNT_JSON in Netlify env.
 */
export const handler: Handler = async (_event: HandlerEvent, context: HandlerContext) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const secret = getPbsSyncSecret();
  if (!secret) {
    console.warn('[pbs-daily-sync] PBS_SYNC_SECRET is not set — skipping.');
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'PBS_SYNC_SECRET not configured' }) };
  }

  if (!isPacificMorningSyncHour()) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, skipped: true, reason: 'Not 6 AM Pacific' }),
    };
  }

  const siteUrl = (process.env.URL || process.env.DEPLOY_PRIME_URL || '').trim();
  if (!siteUrl) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'Site URL unavailable' }) };
  }

  const trigger = await fetch(`${siteUrl}/.netlify/functions/pbs-sync-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ cron: true }),
  });

  const accepted = trigger.status === 202 || trigger.ok;
  console.log(`[pbs-daily-sync] Background sync triggered: ${trigger.status}`);
  return {
    statusCode: accepted ? 200 : 500,
    body: JSON.stringify({ ok: accepted, triggeredStatus: trigger.status }),
  };
};
