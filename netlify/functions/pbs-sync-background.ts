import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import type { Request } from 'express';
import { runPbsSync } from '../../server/pbs/pbsSync.js';
import { resolvePbsSyncCaller } from '../../server/admin/requirePbsSyncCaller.js';

/**
 * Netlify BACKGROUND function (name ends with -background) — invocations return
 * 202 immediately to the caller and the function may run up to 15 minutes.
 * This is where the actual PBS pull executes; the UI polls Firestore sync state.
 * Auth: Firebase ID token (admin/manager) or PBS_SYNC_SECRET bearer.
 */
export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  let body: Record<string, unknown> = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  const shimReq = {
    headers: {
      authorization: event.headers.authorization || event.headers.Authorization,
      'x-pbs-sync-secret': event.headers['x-pbs-sync-secret'],
    },
    body,
  } as unknown as Request;

  const caller = await resolvePbsSyncCaller(shimReq);
  if (!caller) {
    console.warn('[pbs-sync-background] Unauthorized invocation — skipping.');
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Unauthorized' }) };
  }

  console.log(
    `[pbs-sync-background] Starting PBS sync (fullRefresh=${body.fullRefresh === true}, cron=${body.cron === true}) triggered by ${caller.email}`
  );

  const result = await runPbsSync({
    triggeredBy: body.cron === true ? 'cron' : 'manual',
    triggeredByEmail: caller.email,
    triggeredByUsername: caller.username,
    fullRefresh: body.fullRefresh === true,
    force: body.force === true,
  });

  console.log(`[pbs-sync-background] Finished: ok=${result.ok} — ${result.summary}`);
  return { statusCode: result.ok ? 200 : 500, body: JSON.stringify(result) };
};
