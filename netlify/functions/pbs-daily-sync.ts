import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getPbsSyncSecret } from '../../server/pbs/pbsSyncAuth.js';
import { isPacificMorningSyncHour, runPbsSync } from '../../server/pbs/pbsSync.js';

/**
 * Netlify scheduled function — runs hourly and executes the PBS pull at 6:00 AM
 * Pacific. Scheduled invocations are not behind the HTTP gateway, so the sync can
 * use the full function timeout (300s in netlify.toml).
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
      body: JSON.stringify({ ok: true, skipped: true, reason: 'Not 6 AM Pacific' }),
    };
  }

  const result = await runPbsSync({ triggeredBy: 'cron' });
  console.log(`[pbs-daily-sync] Finished: ok=${result.ok} — ${result.summary}`);
  return {
    statusCode: result.ok ? 200 : 500,
    body: JSON.stringify(result),
  };
};
