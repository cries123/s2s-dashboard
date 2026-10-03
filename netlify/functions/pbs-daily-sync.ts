import type { Handler, HandlerContext } from '@netlify/functions';
import { getAdminFirestore } from '../../server/admin/initFirebaseAdmin.js';
import { isPbsPartnerHubConfigured } from '../../server/pbs/partnerHubConfig.js';
import { isPacificMorningSyncHour, runPbsSync } from '../../server/pbs/pbsSync.js';
import { dealershipSettingsDoc } from '../../server/pbs/pbsFirestore.js';
import { PBS_AUTOMATED_SYNC_DEALERSHIP_ID } from '../../server/pbs/pbsDealershipScope.js';
import { recordPbsCronHeartbeat, shouldRunCatchUp } from '../../server/pbs/pbsCronHeartbeat.js';

/**
 * Netlify scheduled function — cron is configured in netlify.toml (@hourly).
 * Pulls during the 6:00 AM Pacific window, and catches up if a day was missed.
 *
 * Requires PBS PartnerHUB credentials + FIREBASE_SERVICE_ACCOUNT_JSON in Netlify env.
 */
export const handler: Handler = async (_event, context: HandlerContext) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (!isPbsPartnerHubConfigured()) {
    console.warn('[pbs-daily-sync] PBS PartnerHUB credentials are not configured — skipping.');
    const db = getAdminFirestore();
    if (db) await recordPbsCronHeartbeat(db, 'skipped-not-configured');
    return {
      statusCode: 503,
      body: JSON.stringify({ ok: false, error: 'PBS PartnerHUB credentials not configured' }),
    };
  }

  const db = getAdminFirestore();
  if (!db) {
    console.warn('[pbs-daily-sync] Firebase Admin / service account is not configured — skipping.');
    return {
      statusCode: 503,
      body: JSON.stringify({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' }),
    };
  }

  // Outside the morning window the function still checks in, so a scheduler
  // that stops firing is visible instead of looking like a quiet night.
  const inWindow = isPacificMorningSyncHour();
  let lastSuccessfulSyncAt: string | undefined;
  try {
    const snap = await dealershipSettingsDoc(db, PBS_AUTOMATED_SYNC_DEALERSHIP_ID).get();
    lastSuccessfulSyncAt = snap.data()?.pbsSyncState?.lastSuccessfulSyncAt;
  } catch (err) {
    console.error('[pbs-daily-sync] Could not read last sync time:', err);
  }
  const catchUp = !inWindow && shouldRunCatchUp(lastSuccessfulSyncAt);

  if (!inWindow && !catchUp) {
    await recordPbsCronHeartbeat(db, 'skipped-outside-window');
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, skipped: true, reason: 'Not 6 AM Pacific' }),
    };
  }

  console.log(
    catchUp
      ? `[pbs-daily-sync] Catching up — last successful pull was ${lastSuccessfulSyncAt ?? 'never'}.`
      : '[pbs-daily-sync] Starting scheduled PBS pull (6 AM Pacific window).'
  );
  const result = await runPbsSync({ triggeredBy: 'cron' });
  console.log(`[pbs-daily-sync] Finished: ok=${result.ok} — ${result.summary}`);
  await recordPbsCronHeartbeat(
    db,
    result.ok ? 'pulled' : 'failed',
    catchUp ? 'catch-up run after a missed window' : undefined
  );
  return {
    statusCode: result.ok ? 200 : 500,
    body: JSON.stringify(result),
  };
};
