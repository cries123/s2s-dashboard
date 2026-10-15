/**
 * Service visits, stored one document per visit instead of inside the customer.
 *
 * Every visit used to live in an array on its customer's record, which meant
 * opening the app downloaded every customer's entire service history — every
 * labour line, every part, every price — before showing anything. It also
 * meant two ways to lose a visit: the sync trimmed each customer to the newest
 * 300, and a profile save wrote back whatever array it had loaded, wiping any
 * visit the sync had added in the meantime.
 *
 * Now each visit is a document at customers/{id}/serviceVisits/{docId}, and the
 * customer record carries only a compact summary: one small entry per visit
 * with its date, revenue and whether it was an oil change. That is everything
 * the lists, alerts and reports read. The full visit loads only when someone
 * opens that customer's history.
 *
 * Nothing in this file deletes. The one rule it exists to enforce is that every
 * visit that was there before is there after.
 *
 * Shared by the server (writes) and the client (reads), and free of Firestore
 * so the rules about it can be tested directly.
 */

/** A visit as stored. Loose on purpose: imported and synced rows differ in shape. */
export type StoredVisit = Record<string, unknown> & {
  id?: unknown;
  soNumber?: unknown;
  date?: unknown;
  openedDate?: unknown;
  mileage?: unknown;
  advisor?: unknown;
  requests?: unknown;
  lines?: unknown;
};

/** The subcollection every customer's visits live in. */
export const SERVICE_VISITS_COLLECTION = 'serviceVisits';

/** One visit, as much of it as the lists and reports need. */
export interface VisitSummaryEntry {
  /** The visit's document id in serviceVisits. */
  id: string;
  /** YYYY-MM-DD — the cashier date, the same meaning `date` has always had. */
  date: string;
  /** Present only when the visit was an oil change. */
  oil?: true;
  /** Mileage, kept on oil changes only — it is what the interval maths uses. */
  miles?: number;
  /** Labour plus parts priced on its lines. Absent when the visit had no prices. */
  rev?: number;
  /** Repair order number — how an imported copy is matched to the synced original. */
  so?: string;
}

/** The most recent visit, for a list row or a card. */
export interface VisitSummaryLast {
  id: string;
  date: string;
  soNumber: string;
  mileage: number;
  advisor: string;
  requests: string;
}

export interface VisitSummary {
  version: 1;
  /** Newest first. One per visit, after duplicates are folded together. */
  entries: VisitSummaryEntry[];
  last: VisitSummaryLast | null;
  updatedAt: string;
}

// --- classification ----------------------------------------------------------

export function isOilChangeServiceText(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('oil change') ||
    lower.includes('oil & filter') ||
    lower.includes('oil/filter') ||
    lower.includes(' lof') ||
    lower.startsWith('lof ') ||
    lower === 'lof' ||
    lower.includes('lube, oil') ||
    lower.includes('lube oil') ||
    lower.includes('synthetic oil') ||
    lower.includes('engine oil') ||
    lower.includes('0w-20') ||
    lower.includes('5w-20') ||
    lower.includes('5w-30')
  );
}

type Line = {
  concern?: unknown;
  correction?: unknown;
  labourLines?: Array<{ description?: unknown; opCode?: unknown; price?: unknown }> | null;
  partLines?: Array<{ price?: unknown }> | null;
};

const linesOf = (visit: StoredVisit): Line[] => (Array.isArray(visit.lines) ? (visit.lines as Line[]) : []);

/**
 * A visit is an oil change if its summary says so, or any of its job lines do.
 * Records synced from PBS often carry a generic summary with the real work
 * described on the lines.
 */
export function visitIsOilChange(visit: StoredVisit): boolean {
  if (isOilChangeServiceText(String(visit.requests ?? ''))) return true;
  for (const line of linesOf(visit)) {
    if (isOilChangeServiceText(String(line?.correction ?? ''))) return true;
    if (isOilChangeServiceText(String(line?.concern ?? ''))) return true;
    for (const labour of line?.labourLines ?? []) {
      if (isOilChangeServiceText(String(labour?.description ?? ''))) return true;
      if (isOilChangeServiceText(String(labour?.opCode ?? ''))) return true;
    }
  }
  return false;
}

/** Labour and parts priced on a visit's lines, and whether it had any prices at all. */
export function visitRevenue(visit: StoredVisit): { total: number; hasData: boolean } {
  let total = 0;
  let hasData = false;
  for (const line of linesOf(visit)) {
    for (const l of line?.labourLines ?? []) {
      if (typeof l?.price === 'number' && Number.isFinite(l.price)) {
        total += l.price;
        hasData = true;
      }
    }
    for (const p of line?.partLines ?? []) {
      if (typeof p?.price === 'number' && Number.isFinite(p.price)) {
        total += p.price;
        hasData = true;
      }
    }
  }
  return { total, hasData };
}

// --- identity ----------------------------------------------------------------

/**
 * A visit's date as YYYY-MM-DD, or '' when there is no reading it.
 *
 * Synced visits are already ISO. The Nov–Dec 2025 spreadsheet import stored US
 * dates with a time — "09/09/2025 1:29:30 PM" — which nothing here could read,
 * so every imported customer showed no last-visit date and dropped out of any
 * report that filters by date.
 */
export function visitDay(value: unknown): string {
  const raw = String(value ?? '').trim();
  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (us) {
    const [, m, d, y] = us;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

const dayOf = visitDay;

/** Firestore ids cannot contain "/" and must not be "." or "..". */
function safeId(raw: string): string {
  const cleaned = raw.trim().replace(/\//g, '_').slice(0, 300);
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? '' : cleaned;
}

/**
 * The document id a visit is stored under, before collisions are resolved.
 *
 * Synced visits already carry `pbs-{soNumber}`, so a visit written by the sync
 * and the same visit copied out of the old array land on the same document —
 * the copy recognises it is already there rather than making a second one.
 */
export function baseVisitDocId(visit: StoredVisit): string {
  const fromId = safeId(String(visit.id ?? ''));
  if (fromId) return fromId;
  const so = safeId(String(visit.soNumber ?? ''));
  if (so) return `so-${so}`;
  const day = dayOf(visit.date);
  return day ? `d-${day}` : 'undated';
}

/**
 * Give every visit in a list its own document id.
 *
 * Two visits mapping to the same id would be written onto one document and one
 * of them would be lost, so a repeat gets "-2", "-3" in list order. That order
 * does not change before a visit is copied, so the same list always yields the
 * same ids and a copy that is run twice lands on the same documents both times.
 */
export function assignVisitDocIds<V extends StoredVisit>(visits: readonly V[]): Array<{ docId: string; visit: V }> {
  const seen = new Map<string, number>();
  return visits.map((visit) => {
    const base = baseVisitDocId(visit);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { docId: n === 1 ? base : `${base}-${n}`, visit };
  });
}

// --- the summary ----------------------------------------------------------------

/**
 * A visit with no usable date still gets an entry, with an empty date, so it
 * still counts. Leaving it out would make a customer's visit count quietly drop
 * when they moved, which reads as a lost visit even though it is stored.
 */
export function toSummaryEntry(docId: string, visit: StoredVisit): VisitSummaryEntry {
  const date = dayOf(visit.date);
  const entry: VisitSummaryEntry = { id: docId, date };
  if (visitIsOilChange(visit)) {
    entry.oil = true;
    const miles = Number(visit.mileage);
    if (Number.isFinite(miles) && miles > 0) entry.miles = miles;
  }
  const { total, hasData } = visitRevenue(visit);
  if (hasData) entry.rev = Math.round(total * 100) / 100;
  const so = soKey(visit.soNumber);
  if (so) entry.so = so;
  return entry;
}

/** RO numbers compared as digits: "113835", " 113835 " and 113835 are one RO. */
function soKey(value: unknown): string {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '');
}

/**
 * Two copies of one repair order — the thin row from the spreadsheet import and
 * the full one from PBS — shown once, as the PBS one.
 *
 * Matched on the RO number first, which is exact; failing that, an imported row
 * with no number on the same day as a synced visit. Display only: both copies
 * stay stored, and nothing here is ever written back.
 */
export function foldImportedDuplicates<V extends StoredVisit>(
  items: readonly V[],
  idOf: (v: V) => string
): V[] {
  const synced = items.filter((v) => isSynced(idOf(v)));
  const syncedRos = new Set(synced.map((v) => soKey(v.soNumber)).filter(Boolean));
  const syncedDays = new Set(synced.map((v) => dayOf(v.date)).filter(Boolean));
  return items.filter((v) => {
    if (isSynced(idOf(v))) return true;
    const so = soKey(v.soNumber);
    if (so) return !syncedRos.has(so);
    const day = dayOf(v.date);
    return !day || !syncedDays.has(day);
  });
}

export function toSummaryLast(docId: string, visit: StoredVisit): VisitSummaryLast | null {
  const date = dayOf(visit.date);
  if (!date) return null;
  return {
    id: docId,
    date,
    soNumber: String(visit.soNumber ?? ''),
    mileage: Number(visit.mileage) || 0,
    advisor: String(visit.advisor ?? ''),
    requests: String(visit.requests ?? ''),
  };
}

const isSynced = (id: string) => id.startsWith('pbs-');

/**
 * Fold entries into a summary: newest first, and an imported copy of a visit
 * the sync also has is counted once.
 *
 * The fold is for counting and display only. Both copies stay stored; this
 * just stops Sales-to-Service counting one visit twice and doubling its revenue.
 */
export function buildVisitSummary(
  entries: readonly VisitSummaryEntry[],
  last: VisitSummaryLast | null,
  now: string
): VisitSummary {
  const byId = new Map<string, VisitSummaryEntry>();
  for (const e of entries) if (e?.id) byId.set(e.id, e);

  // Same rule as foldImportedDuplicates, on summary entries.
  const all = [...byId.values()];
  const syncedRos = new Set(all.filter((e) => isSynced(e.id) && e.so).map((e) => e.so as string));
  const syncedDates = new Set(all.filter((e) => isSynced(e.id) && e.date).map((e) => e.date));
  const folded = all.filter((e) => {
    if (isSynced(e.id)) return true;
    if (e.so) return !syncedRos.has(e.so);
    return !e.date || !syncedDates.has(e.date);
  });

  // Newest first; undated visits sort to the end rather than to the top.
  folded.sort((a, b) => {
    if (a.date === b.date) return a.id.localeCompare(b.id);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
  return { version: 1, entries: folded, last, updatedAt: now };
}

/** The newer of two "last visit" records. */
export function newerLast(a: VisitSummaryLast | null, b: VisitSummaryLast | null): VisitSummaryLast | null {
  if (!a) return b;
  if (!b) return a;
  return b.date > a.date ? b : a;
}

/** Summarise a list of whole visits — the old array, or a freshly loaded subcollection. */
export function summarizeVisits(visits: readonly StoredVisit[], now: string): VisitSummary {
  const assigned = assignVisitDocIds(visits);
  const entries: VisitSummaryEntry[] = [];
  let last: VisitSummaryLast | null = null;
  for (const { docId, visit } of assigned) {
    entries.push(toSummaryEntry(docId, visit));
    last = newerLast(last, toSummaryLast(docId, visit));
  }
  return buildVisitSummary(entries, last, now);
}

/**
 * Add newly synced visits to an existing summary without rereading every visit.
 *
 * Entries are matched by document id, and a re-pulled repair order replaces its
 * own entry. Nothing in the existing summary is dropped.
 */
export function mergeIntoSummary(
  existing: VisitSummary | null | undefined,
  incoming: ReadonlyArray<{ docId: string; visit: StoredVisit }>,
  now: string
): VisitSummary {
  const entries = new Map<string, VisitSummaryEntry>();
  for (const e of existing?.entries ?? []) entries.set(e.id, e);
  let last = existing?.last ?? null;
  for (const { docId, visit } of incoming) {
    entries.set(docId, toSummaryEntry(docId, visit));
    last = newerLast(last, toSummaryLast(docId, visit));
  }
  return buildVisitSummary([...entries.values()], last, now);
}

// --- moving the old array out ------------------------------------------------------

export interface VisitMigrationPlan {
  /** Visits that are not in the subcollection yet and need copying there. */
  toCopy: Array<{ docId: string; visit: StoredVisit }>;
  /** Visits already stored — usually because the sync wrote them first. Left alone. */
  alreadyStored: string[];
  /** Every id that must exist in the subcollection before the old array may go. */
  mustExist: string[];
}

/**
 * Work out what copying one customer's old visit array involves.
 *
 * A visit that is already stored is never overwritten: the stored copy was
 * written by the sync and is at least as new as the one in the old array.
 */
export function planVisitMigration(
  embedded: readonly StoredVisit[],
  storedIds: ReadonlySet<string>
): VisitMigrationPlan {
  const toCopy: Array<{ docId: string; visit: StoredVisit }> = [];
  const alreadyStored: string[] = [];
  const mustExist: string[] = [];
  for (const { docId, visit } of assignVisitDocIds(embedded)) {
    mustExist.push(docId);
    if (storedIds.has(docId)) alreadyStored.push(docId);
    else toCopy.push({ docId, visit });
  }
  return { toCopy, alreadyStored, mustExist };
}

/**
 * The gate on removing the old array: every visit in it must now be stored.
 * Anything short of that and the array stays exactly where it is.
 */
export function verifyVisitMigration(
  mustExist: readonly string[],
  storedIds: ReadonlySet<string>
): { ok: boolean; missing: string[] } {
  const missing = mustExist.filter((id) => !storedIds.has(id));
  return { ok: missing.length === 0, missing };
}
