import type { Handler, HandlerContext } from '@netlify/functions';
import { getAdminFirestore } from '../../server/admin/initFirebaseAdmin.js';
import { isPbsPartnerHubConfigured } from '../../server/pbs/partnerHubConfig.js';
import { isPacificMorningSyncHour, runPbsSync } from '../../server/pbs/pbsSync.js';

/**
 * Netlify scheduled function — cron is configured in netlify.toml (@hourly).
 * Executes the PBS pull during the 6:00 AM Pacific window.
 *
 * Requires PBS PartnerHUB credentials + FIREBASE_SERVICE_ACCOUNT_JSON in Netlify env.
 */
export const handler: Handler = async (_event, context: HandlerContext) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (!isPbsPartnerHubConfigured()) {
    console.warn('[pbs-daily-sync] PBS PartnerHUB credentials are not configured — skipping.');
    return {
      statusCode: 503,
      body: JSON.stringify({ ok: false, error: 'PBS PartnerHUB credentials not configured' }),
    };
  }

  if (!getAdminFirestore()) {
    console.warn('[pbs-daily-sync] Firebase Admin / service account is not configured — skipping.');
    return {
      statusCode: 503,
      body: JSON.stringify({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' }),
    };
  }

  if (!isPacificMorningSyncHour()) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, skipped: true, reason: 'Not 6 AM Pacific' }),
    };
  }

  console.log('[pbs-daily-sync] Starting scheduled PBS pull (6 AM Pacific window).');
  const result = await runPbsSync({ triggeredBy: 'cron' });
  console.log(`[pbs-daily-sync] Finished: ok=${result.ok} — ${result.summary}`);
  return {
    statusCode: result.ok ? 200 : 500,
    body: JSON.stringify(result),
  };
};
