import type { Handler, HandlerContext } from '@netlify/functions';
import { getAdminFirestore } from '../../server/admin/initFirebaseAdmin.js';
import { isPbsPartnerHubConfigured } from '../../server/pbs/partnerHubConfig.js';
import {
  executePbsSyncStage,
  failStagedPbsSync,
  PBS_SYNC_STAGES,
  readPbsSyncStateFor,
  startStagedPbsSync,
} from '../../server/pbs/pbsSync.js';
import { PBS_AUTOMATED_SYNC_DEALERSHIP_ID } from '../../server/pbs/pbsDealershipScope.js';
import { recordPbsCronHeartbeat } from '../../server/pbs/pbsCronHeartbeat.js';
import { backfillOnePastMonth } from '../../server/pbs/pbsMonthRebuild.js';
import { isBackfillWindow, isPbsSyncDue } from '../../server/pbs/pbsSyncSchedule.js';

/**
 * Netlify scheduled function — runs every five minutes (netlify.toml).
 *
 * Pulls PBS at 6:00 AM and 4:45 PM Pacific (pbsSyncSchedule has the rule).
 *
 * The pull is done in stages, a few per wake-up, the same stages the "Pull
 * changes" button runs one request at a time. Netlify stops a scheduled
 * function after about a minute; the one-shot pull this replaced ran 45–59
 * seconds in September and from Sept 25 was cut off at 6 AM every day, with
 * nothing written to say so. Now each wake-up stops starting stages well
 * before the limit, the next wake-up carries on, and a stage that is cut off
 * is simply run again.
 *
 * Requires PBS PartnerHUB credentials + FIREBASE_SERVICE_ACCOUNT_JSON in Netlify env.
 */

/** Start no new stage after this long; leaves a stage ~25 s before Netlify's cut-off. */
const STAGE_BUDGET_MS = 35_000;
/** A lock touched more recently than this means another wake-up is mid-stage right now. */
const ACTIVE_LOCK_MS = 90_000;
/** A scheduled pull still unfinished after this long is failed, logged, and started over. */
const GIVE_UP_AFTER_MS = 90 * 60_000;

function json(statusCode: number, body: Record<string, unknown>) {
  return { statusCode, body: JSON.stringify(body) };
}

export const handler: Handler = async (_event, context: HandlerContext) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const began = Date.now();

  if (!isPbsPartnerHubConfigured()) {
    console.warn('[pbs-daily-sync] PBS PartnerHUB credentials are not configured — skipping.');
    const db = getAdminFirestore();
    if (db) await recordPbsCronHeartbeat(db, 'skipped-not-configured');
    return json(503, { ok: false, error: 'PBS PartnerHUB credentials not configured' });
  }

  const db = getAdminFirestore();
  if (!db) {
    console.warn('[pbs-daily-sync] Firebase Admin / service account is not configured — skipping.');
    return json(503, { ok: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' });
  }

  const state = await readPbsSyncStateFor(PBS_AUTOMATED_SYNC_DEALERSHIP_ID);
  const run = state?.stagedRun;
  const lockAge = state?.syncStartedAt ? began - new Date(state.syncStartedAt).getTime() : Infinity;

  let runId: string;
  let next: (typeof PBS_SYNC_STAGES)[number] | undefined;

  if (run && state?.syncInProgress && run.triggeredBy === 'cron') {
    // A scheduled pull is part done. Carry on — unless another wake-up is on it
    // this minute, or it has been failing for so long it needs a clean start.
    if (lockAge < ACTIVE_LOCK_MS) {
      await recordPbsCronHeartbeat(db, 'skipped-already-running');
      return json(200, { ok: true, skipped: true, reason: 'Another wake-up is running a stage.' });
    }
    if (began - new Date(run.runId).getTime() > GIVE_UP_AFTER_MS) {
      const stuck = PBS_SYNC_STAGES.find((s) => !run.completedStages.includes(s));
      const reason = `Scheduled pull did not finish within 90 minutes (stuck on ${stuck ?? 'the last stage'}); starting over at the next wake-up.`;
      console.error(`[pbs-daily-sync] ${reason}`);
      await failStagedPbsSync(reason);
      await recordPbsCronHeartbeat(db, 'failed', reason);
      return json(500, { ok: false, error: reason });
    }
    runId = run.runId;
    next = PBS_SYNC_STAGES.find((s) => !run.completedStages.includes(s));
    console.log(`[pbs-daily-sync] Continuing scheduled pull ${runId} at ${next}.`);
  } else {
    if (state?.syncInProgress && lockAge < ACTIVE_LOCK_MS) {
      // Someone pressed "Pull changes"; theirs counts, ours would only collide.
      await recordPbsCronHeartbeat(db, 'skipped-already-running');
      return json(200, { ok: true, skipped: true, reason: 'A pull is already running.' });
    }

    if (!isPbsSyncDue(state?.lastSuccessfulSyncAt, new Date(began))) {
      // Off-hours: close one past month nobody closed, on its own wake-up so it
      // never eats into a pull's time.
      if (isBackfillWindow(new Date(began))) {
        try {
          const rebuilt = await backfillOnePastMonth(
            db,
            PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
            new Date().toISOString()
          );
          await recordPbsCronHeartbeat(db, 'backfilled', rebuilt ? `rebuilt ${rebuilt.month}` : 'no empty months');
          return json(200, { ok: true, monthBackfill: rebuilt ?? null });
        } catch (err) {
          console.error('[pbs-daily-sync] Past-month backfill failed:', err);
        }
      }
      await recordPbsCronHeartbeat(db, 'skipped-not-due');
      return json(200, { ok: true, skipped: true, reason: 'No pull due.' });
    }

    const start = await startStagedPbsSync({ triggeredBy: 'cron', force: true });
    if (!start.ok || !start.startedAt) {
      await recordPbsCronHeartbeat(db, 'failed', start.error);
      return json(500, { ok: false, error: start.error });
    }
    runId = start.startedAt;
    next = start.nextStage;
    console.log(`[pbs-daily-sync] Starting scheduled pull ${runId}.`);
  }

  // As many stages as fit. A chunked stage hands back itself as `nextStage`.
  while (next && Date.now() - began < STAGE_BUDGET_MS) {
    const stage = await executePbsSyncStage(runId, next);
    if (!stage.ok) {
      // executePbsSyncStage has already logged the failure and cleared the lock.
      await recordPbsCronHeartbeat(db, 'failed', stage.error);
      return json(500, { ok: false, error: stage.error });
    }
    if (stage.done) {
      console.log(`[pbs-daily-sync] Finished: ${stage.result?.summary ?? 'done'}`);
      await recordPbsCronHeartbeat(db, 'pulled');
      return json(200, { ok: true, result: stage.result });
    }
    next = stage.nextStage;
  }

  const note = `stopped before ${next}; the next wake-up continues`;
  console.log(`[pbs-daily-sync] Out of time this wake-up — ${note}.`);
  await recordPbsCronHeartbeat(db, 'in-progress', note);
  return json(200, { ok: true, inProgress: true, nextStage: next });
};
