import { FieldValue, type Firestore } from 'firebase-admin/firestore';
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
  | 'in-progress'
  | 'skipped-not-due'
  | 'skipped-not-configured'
  | 'skipped-already-running'
  | 'backfilled'
  | 'failed';

export interface PbsCronHeartbeat {
  lastInvokedAt: string;
  lastOutcome: PbsCronOutcome;
  /** Pacific hour at the moment of the call — shows the schedule check working. */
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
  try {
    await dealershipSettingsDoc(db, PBS_AUTOMATED_SYNC_DEALERSHIP_ID).set(
      {
        pbsCronHeartbeat: {
          lastInvokedAt: now.toISOString(),
          lastOutcome: outcome,
          pacificHour: pacificHourOf(now),
          ...(outcome === 'pulled' ? { lastPulledAt: now.toISOString() } : {}),
          // A merge keeps nested fields it is not told about, so an old note
          // ("catch-up run after a missed window") rode along on every later
          // check-in. Clear it unless this one has its own.
          note: note ?? FieldValue.delete(),
        },
      },
      { merge: true }
    );
  } catch (err) {
    // A heartbeat must never be the reason a sync fails.
    console.error('[pbs-daily-sync] Could not record heartbeat:', err);
  }
}
