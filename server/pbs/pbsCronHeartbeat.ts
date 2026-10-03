import type { Firestore } from 'firebase-admin/firestore';
import { dealershipSettingsDoc } from './pbsFirestore.js';
import { PBS_AUTOMATED_SYNC_DEALERSHIP_ID } from './pbsDealershipScope.js';

/**
 * Proof that Netlify actually called the scheduled function.
 *
 * The sync only wrote a record when it pulled data, so an hour where the
 * scheduler never fired looked exactly like an hour it skipped on purpose —
 * which is why "last synced 9/25" sat on screen for a week with nothing to say
 * why. This writes one small record per invocation, pulled or not.
 */
export type PbsCronOutcome =
  | 'pulled'
  | 'skipped-outside-window'
  | 'skipped-not-configured'
  | 'skipped-already-running'
  | 'failed';

export interface PbsCronHeartbeat {
  lastInvokedAt: string;
  lastOutcome: PbsCronOutcome;
  /** Pacific hour at the moment of the call — shows the window check working. */
  pacificHour: number;
  lastPulledAt?: string;
  note?: string;
}

export function pacificHourOf(reference = new Date()): number {
  return Number(
    reference.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    })
  );
}

export async function recordPbsCronHeartbeat(
  db: Firestore,
  outcome: PbsCronOutcome,
  note?: string
): Promise<void> {
  const now = new Date();
  const heartbeat: PbsCronHeartbeat = {
    lastInvokedAt: now.toISOString(),
    lastOutcome: outcome,
    pacificHour: pacificHourOf(now),
    ...(outcome === 'pulled' ? { lastPulledAt: now.toISOString() } : {}),
    ...(note ? { note } : {}),
  };
  try {
    await dealershipSettingsDoc(db, PBS_AUTOMATED_SYNC_DEALERSHIP_ID).set(
      { pbsCronHeartbeat: heartbeat },
      { merge: true }
    );
  } catch (err) {
    // A heartbeat must never be the reason a sync fails.
    console.error('[pbs-daily-sync] Could not record heartbeat:', err);
  }
}

/** Hours since the last successful pull, or null when there has never been one. */
export function hoursSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return (now.getTime() - then) / 3_600_000;
}

/**
 * The morning window is the normal trigger. A catch-up covers the case that
 * actually bit: the 6 AM hour passed without the function being called, and
 * without this the data would sit stale until someone noticed by eye.
 */
export const CATCH_UP_AFTER_HOURS = 25;

export function shouldRunCatchUp(
  lastSuccessfulSyncAt: string | null | undefined,
  now = new Date()
): boolean {
  const age = hoursSince(lastSuccessfulSyncAt, now);
  if (age === null) return true; // never synced: pull on the next call
  return age >= CATCH_UP_AFTER_HOURS;
}
