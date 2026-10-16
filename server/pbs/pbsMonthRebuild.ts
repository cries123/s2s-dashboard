import type { Firestore } from 'firebase-admin/firestore';
import { syncPbsAdvisorPerformance } from './pbsPerformanceSync.js';
import { syncPbsTechnicianPerformance } from './pbsTechnicianSync.js';
import { syncAppointmentMonth } from './pbsSync.js';
import {
  advisorPerformanceDoc,
  appointmentTrackerCollection,
  appointmentTrackerDocId,
  monthRebuildBackupsCollection,
  stripUndefinedDeep,
  technicianPerformanceDoc,
} from './pbsFirestore.js';
import {
  isMonthKey,
  monthKeyOf,
  monthKeyRange,
  pastMonthKeys,
} from '../../src/lib/operationsMonthKeys.js';

export { isMonthKey, monthKeyOf, monthKeyRange, pastMonthKeys };

/**
 * Filling in a month nobody closed by hand.
 *
 * Operations keeps one live document per report and overwrites it as the month
 * runs. A past month only exists if somebody pressed "Archive & restart" on the
 * last day — and if they forgot, the month was simply gone: picking it in the
 * dropdown showed blank financials for ever.
 *
 * PBS can answer for any date range, so a past month is not gone, only
 * uncomputed. Everything here rebuilds a month's documents straight from
 * cashiered repair orders, which means:
 *
 *   - a month nobody closed can be filled in afterwards, and
 *   - the overnight pull can close months on its own from now on, so this
 *     stops being something a human has to remember.
 *
 * It never touches the live sheet: every write goes to that month's archive
 * document. And it never throws away what a month held: before anything is
 * replaced, the old copy goes to monthRebuildBackups. June 2026 is why — it was
 * archived by hand on June 4 with three days in it, and a rebuild is the fix,
 * but whatever someone saved deserves to survive being fixed.
 */

/** Which half of a month to rebuild. Each fits in one request on its own. */
export type MonthRebuildPart = 'performance' | 'appointments';
export const MONTH_REBUILD_PARTS: readonly MonthRebuildPart[] = ['performance', 'appointments'];

/** Noon today on the dealership's calendar. The server runs in UTC. */
export function pacificToday(now = new Date()): Date {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return new Date(`${ymd}T12:00:00`);
}

/** A document counts as present only if it holds real figures. */
function hasFinancials(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const advisors = data.advisors;
  if (Array.isArray(advisors) && advisors.length > 0) return true;
  const totals = data.totals as Record<string, unknown> | undefined;
  if (totals && Number(totals.totalSales) > 0) return true;
  const technicians = data.technicians;
  return Array.isArray(technicians) && technicians.length > 0;
}

export interface MonthRebuildResult {
  month: string;
  ok: boolean;
  parts: MonthRebuildPart[];
  advisors?: number;
  technicians?: number;
  repairOrders?: number;
  laborGross?: number;
  appointments?: number;
  advisorError?: string;
  technicianError?: string;
  appointmentError?: string;
  /** Id of the copy kept of what the month held before, if it held anything. */
  backupId?: string;
}

/** Copy what a month holds now, before it is replaced. Returns the backup id, or nothing if it was empty. */
async function backUpMonth(
  db: Firestore,
  dealershipId: string,
  monthKey: string,
  parts: readonly MonthRebuildPart[],
  takenAt: string
): Promise<string | undefined> {
  const backup: Record<string, unknown> = { dealershipId, month: monthKey, parts, takenAt };
  let anything = false;

  if (parts.includes('performance')) {
    const [advisor, technician] = await Promise.all([
      advisorPerformanceDoc(db, dealershipId, monthKey).get(),
      technicianPerformanceDoc(db, dealershipId, monthKey).get(),
    ]);
    if (advisor.exists) {
      backup.advisorReport = advisor.data();
      anything = true;
    }
    if (technician.exists) {
      backup.technicianReport = technician.data();
      anything = true;
    }
  }

  if (parts.includes('appointments')) {
    const { start, end } = monthKeyRange(monthKey);
    const lastDay = Number(end.slice(-2));
    const refs = Array.from({ length: lastDay }, (_, i) =>
      appointmentTrackerCollection(db).doc(
        appointmentTrackerDocId(dealershipId, `${start.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
      )
    );
    const snaps = await db.getAll(...refs);
    const counts: Record<string, unknown> = {};
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = s.data() || {};
      counts[String(d.date ?? s.id)] = {
        count: d.count ?? null,
        breakdown: d.breakdown ?? null,
        source: d.source ?? null,
        updatedBy: d.updatedBy ?? null,
      };
    }
    if (Object.keys(counts).length > 0) {
      backup.appointmentCounts = counts;
      anything = true;
    }
  }

  if (!anything) return undefined;
  const id = `${dealershipId}_${monthKey}_${takenAt.replace(/[:.]/g, '-')}`;
  await monthRebuildBackupsCollection(db).doc(id).set(stripUndefinedDeep(backup));
  return id;
}

/**
 * Recompute one past month from PBS into that month's archive documents.
 *
 * `performance` is labor, parts and technicians; `appointments` is the daily
 * counts and the schedule the show-up rate reads. They are separate so the
 * screen can ask for each in its own request and stay under the gateway limit.
 * The advisor and technician halves are reported separately too: time clock
 * data can be unavailable for an old month, and a missing technician half is no
 * reason to throw away a good advisor half.
 */
export async function rebuildPbsMonth(
  db: Firestore,
  dealershipId: string,
  monthKey: string,
  syncedAt: string,
  parts: readonly MonthRebuildPart[] = MONTH_REBUILD_PARTS
): Promise<MonthRebuildResult> {
  if (!isMonthKey(monthKey)) throw new Error(`Not a month key: ${monthKey}`);
  if (monthKey >= monthKeyOf(pacificToday())) {
    throw new Error('The current month is the live sheet; it is not rebuilt as an archive.');
  }

  const { start, end } = monthKeyRange(monthKey);
  const result: MonthRebuildResult = { month: monthKey, ok: true, parts: [...parts] };
  result.backupId = await backUpMonth(db, dealershipId, monthKey, parts, syncedAt);

  if (parts.includes('performance')) {
    try {
      const advisor = await syncPbsAdvisorPerformance(db, dealershipId, start, end, syncedAt, monthKey);
      result.advisors = advisor.advisors;
      result.repairOrders = advisor.repairOrdersProcessed;
      result.laborGross = advisor.totalGross;
    } catch (err) {
      result.ok = false;
      result.advisorError = err instanceof Error ? err.message : String(err);
      console.error(`[PBS Month] Advisor rebuild failed for ${monthKey}:`, err);
    }

    try {
      const tech = await syncPbsTechnicianPerformance(db, dealershipId, start, end, syncedAt, monthKey);
      result.technicians = tech.technicians;
    } catch (err) {
      result.technicianError = err instanceof Error ? err.message : String(err);
      console.error(`[PBS Month] Technician rebuild failed for ${monthKey}:`, err);
    }
  }

  if (parts.includes('appointments')) {
    try {
      const appts = await syncAppointmentMonth(db, dealershipId, start, end, syncedAt);
      result.appointments = appts.appointments;
      if (appts.scheduleError) result.appointmentError = appts.scheduleError;
    } catch (err) {
      result.ok = false;
      result.appointmentError = err instanceof Error ? err.message : String(err);
      console.error(`[PBS Month] Appointment rebuild failed for ${monthKey}:`, err);
    }
  }

  console.log(
    `[PBS Month] ${monthKey} rebuilt (${start}..${end}) [${parts.join(', ')}]: ` +
      `${result.advisors ?? 0} advisors, ${result.technicians ?? 0} technicians, ` +
      `${result.appointments ?? 0} appointments${result.backupId ? `; previous copy kept as ${result.backupId}` : ''}`
  );
  return result;
}

/** Past months, newest first, whose archive documents hold nothing yet. */
export async function findEmptyPastMonths(
  db: Firestore,
  dealershipId: string,
  reference: Date,
  lookBackMonths: number
): Promise<string[]> {
  const empty: string[] = [];
  for (const month of pastMonthKeys(reference, lookBackMonths)) {
    const [advisorSnap, techSnap] = await Promise.all([
      advisorPerformanceDoc(db, dealershipId, month).get(),
      technicianPerformanceDoc(db, dealershipId, month).get(),
    ]);
    if (!hasFinancials(advisorSnap.data()) && !hasFinancials(techSnap.data())) empty.push(month);
  }
  return empty;
}

/**
 * Close at most one missing month per call.
 *
 * Deliberately one: rebuilding a month is a full month of repair orders out of
 * PartnerHUB, and twelve of those in one invocation would be both slow and rude
 * to an API we are a guest on. It runs after the morning pull, so a year of
 * gaps fills in over a couple of weeks, newest month first — the Operations
 * screen's "Refresh from PBS" does any one month on demand.
 *
 * Labor and technicians only: the appointment half is left to that button, so
 * the morning job's time stays on the pull it exists for.
 */
export async function backfillOnePastMonth(
  db: Firestore,
  dealershipId: string,
  syncedAt: string,
  options: { reference?: Date; lookBackMonths?: number } = {}
): Promise<MonthRebuildResult | null> {
  const reference = options.reference ?? pacificToday();
  const lookBackMonths = options.lookBackMonths ?? 12;
  const empty = await findEmptyPastMonths(db, dealershipId, reference, lookBackMonths);
  if (empty.length === 0) return null;

  const month = empty[0];
  console.log(
    `[PBS Month] ${empty.length} past month(s) with no figures; rebuilding ${month} this run.`
  );
  return rebuildPbsMonth(db, dealershipId, month, syncedAt, ['performance']);
}
