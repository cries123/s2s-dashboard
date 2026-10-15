import {
  summarizeVisits,
  type StoredVisit,
  type VisitSummary,
  type VisitSummaryEntry,
  type VisitSummaryLast,
} from './visitStore';

/**
 * Reading a customer's visit history without caring where it is stored.
 *
 * A customer is in one of two states while visits move out of the customer
 * record: either they have a `visitSummary` (written by the sync or the
 * migration), or they still carry the old `recentVisits` array. Every screen
 * reads through these functions, so it gets the same answer either way and
 * nothing has to know which state a customer is in.
 *
 * The summary wins when both exist, because whatever wrote it built it from the
 * old array plus anything newer.
 */

export interface VisitCarrier {
  // Loose on purpose: every screen has its own idea of what a visit looks like,
  // and all of them only need what summarizeVisits reads.
  recentVisits?: readonly unknown[] | null;
  visitSummary?: VisitSummary | null;
}

// Deriving a summary from the old array means scanning every line of every
// visit. Lists call these for every customer on every render, so remember the
// answer per customer object; a fresh snapshot is a fresh object and recomputes.
const derived = new WeakMap<object, VisitSummary>();

function summaryOf(c: VisitCarrier): VisitSummary | null {
  if (c.visitSummary?.entries) return c.visitSummary;
  const embedded = c.recentVisits;
  if (!embedded || embedded.length === 0) return null;
  const cached = derived.get(c as object);
  if (cached) return cached;
  // Deterministic stamp: only the entries are read, never this date.
  const built = summarizeVisits(embedded as readonly StoredVisit[], '1970-01-01T00:00:00.000Z');
  derived.set(c as object, built);
  return built;
}

/** Every visit, newest first. */
export function visitEntries(c: VisitCarrier): VisitSummaryEntry[] {
  return summaryOf(c)?.entries ?? [];
}

export function visitCount(c: VisitCarrier): number {
  return visitEntries(c).length;
}

/** YYYY-MM-DD, newest first. Undated visits count but have no date to list. */
export function visitDates(c: VisitCarrier): string[] {
  return visitEntries(c)
    .map((e) => e.date)
    .filter(Boolean);
}

export function lastVisitDate(c: VisitCarrier): string | null {
  return visitDates(c)[0] ?? null;
}

export function lastVisit(c: VisitCarrier): VisitSummaryLast | null {
  return summaryOf(c)?.last ?? null;
}

export function hasVisitHistory(c: VisitCarrier): boolean {
  return visitCount(c) > 0;
}

/** Oil-change visits, oldest first, with the mileage the interval maths needs. */
export function oilChangeVisits(c: VisitCarrier): Array<{ date: string; mileage: number }> {
  return visitEntries(c)
    .filter((e) => e.oil && e.date)
    .map((e) => ({ date: e.date, mileage: e.miles ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
