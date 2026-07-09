import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getPbsSyncSecret } from '../../server/pbs/pbsSyncAuth.js';
import { isPacificMorningSyncHour, runPbsSync } from '../../server/pbs/pbsSync.js';

/**
 * Netlify scheduled function — runs hourly and executes PBS sync at 8:00 AM Pacific.
 * Configure PBS_SYNC_SECRET (or SYSTEM_WORKERS_PASSWORD) and FIREBASE_SERVICE_ACCOUNT_JSON in Netlify env.
 */
export const handler: Handler = async (_event: HandlerEvent, context: HandlerContext) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (!getPbsSyncSecret()) {
    console.warn('[pbs-daily-sync] PBS_SYNC_SECRET is not set — skipping.');
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'PBS_SYNC_SECRET not configured' }) };
  }

  if (!isPacificMorningSyncHour()) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, skipped: true, reason: 'Not 8 AM Pacific' }),
    };
  }

  const result = await runPbsSync({ triggeredBy: 'cron' });
  return {
    statusCode: result.ok ? 200 : 500,
    body: JSON.stringify(result),
  };
};
