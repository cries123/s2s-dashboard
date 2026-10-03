import type { Firestore } from 'firebase-admin/firestore';
import { syncPbsAdvisorPerformance } from './pbsPerformanceSync.js';
import { syncPbsTechnicianPerformance } from './pbsTechnicianSync.js';
import { advisorPerformanceDoc, technicianPerformanceDoc } from './pbsFirestore.js';
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
 * document.
 */

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
  advisors?: number;
  technicians?: number;
  repairOrders?: number;
  advisorError?: string;
  technicianError?: string;
}

/**
 * Recompute one past month from PBS into that month's archive documents.
 *
 * The advisor and technician halves are reported separately: time clock data in
 * particular can be unavailable for an old month, and a missing technician half
 * is no reason to throw away a good advisor half.
 */
export async function rebuildPbsMonth(
  db: Firestore,
  dealershipId: string,
  monthKey: string,
  syncedAt: string
): Promise<MonthRebuildResult> {
  if (!isMonthKey(monthKey)) throw new Error(`Not a month key: ${monthKey}`);
  if (monthKey === monthKeyOf(new Date())) {
    throw new Error('The current month is the live sheet; it is not rebuilt as an archive.');
  }

  const { start, end } = monthKeyRange(monthKey);
  const result: MonthRebuildResult = { month: monthKey, ok: false };

  try {
    const advisor = await syncPbsAdvisorPerformance(db, dealershipId, start, end, syncedAt, monthKey);
    result.advisors = advisor.advisors;
    result.repairOrders = advisor.repairOrdersProcessed;
    result.ok = true;
  } catch (err) {
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

  console.log(
    `[PBS Month] ${monthKey} rebuilt (${start}..${end}): ${result.advisors ?? 0} advisors, ${result.technicians ?? 0} technicians`
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
 * to an API we are a guest on. The pull runs hourly, so a year of gaps still
 * fills itself within a day, newest month first.
 */
export async function backfillOnePastMonth(
  db: Firestore,
  dealershipId: string,
  syncedAt: string,
  options: { reference?: Date; lookBackMonths?: number } = {}
): Promise<MonthRebuildResult | null> {
  const reference = options.reference ?? new Date();
  const lookBackMonths = options.lookBackMonths ?? 12;
  const empty = await findEmptyPastMonths(db, dealershipId, reference, lookBackMonths);
  if (empty.length === 0) return null;

  const month = empty[0];
  console.log(
    `[PBS Month] ${empty.length} past month(s) with no figures; rebuilding ${month} this run.`
  );
  return rebuildPbsMonth(db, dealershipId, month, syncedAt);
}
