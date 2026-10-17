import {
  assignVisitDocIds,
  mergeIntoSummary,
  refreshSummaryFromEmbedded,
  visitDay,
  type StoredVisit,
  type VisitSummary,
} from '../../src/lib/visitStore.js';

/**
 * One car on two (or more) customer profiles, folded into one profile.
 *
 * Jaryn's rule (2026-10-16): the profile that came in most recently owns the
 * car; the car's records stay with the VIN, and the VIN stays with that
 * profile. What the data added to it:
 *
 *  - Nearly every pair is an old spreadsheet import (last 8 of the VIN only, no
 *    PBS link) and a profile the PBS sync made because it couldn't see the
 *    import. The PBS one is kept as the record — the sync finds a car by its
 *    PBS vehicle id, so any other choice would have the next sync make a third
 *    profile — and the owner's details are put on it.
 *  - The same repair order is usually on both, a day apart. One visit, not a
 *    newer one: a visit both profiles share is a tie.
 *  - PBS has no name for many of these cars ("Customer"). A placeholder never
 *    wins over a real name for the same car.
 *  - Nothing is deleted. Every visit is copied to the kept profile (the summary
 *    already counts an imported copy of a PBS repair order once), the merged
 *    profile is hidden with `mergedInto`, and the executor backs it up first.
 *
 * Pure: no Firestore. vinDuplicateMerge.ts reads, writes and verifies.
 */

export interface ProfileForMerge {
  id: string;
  data: Record<string, unknown>;
  /** The profile's serviceVisits documents. */
  visitDocs: Array<{ id: string; data: StoredVisit }>;
}

// --- grouping ----------------------------------------------------------------

const clean = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The last 8 of the VIN, from the full VIN when there is one. */
export function vinTail(data: Record<string, unknown>): string {
  const vin = clean(data.vin);
  if (vin.length >= 8) return vin.slice(-8);
  const last8 = clean(data.vinLast8);
  return last8.length === 8 ? last8 : '';
}

const fullVin = (data: Record<string, unknown>) => {
  const vin = clean(data.vin);
  return vin.length === 17 ? vin : '';
};

/** The model without spaces: "SANTA FE" and "SANTAFE" are one model. */
const modelKey = (data: Record<string, unknown>) => clean(data.model);

/**
 * Two spellings of one model start the same way — "TUCSON HEV" / "TUCSON
 * HYBRID", "KONA EV" / "KONA ELECTRIC", "TACOMA 4WD" / "TACOMA" — for at least
 * four letters, or all of the shorter one. "GV70" / "GV80" and "ELANTRA" /
 * "SONATA" do not. The VIN is the real match; this only catches a wrong one.
 */
function modelsAgree(models: readonly string[]): boolean {
  const agree = (a: string, b: string) => {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n >= Math.min(4, a.length, b.length) && (n >= 4 || n === Math.min(a.length, b.length));
  };
  return models.every((a) => models.every((b) => agree(a, b)));
}

export interface DuplicateGroup {
  tail: string;
  ids: string[];
}

export interface SkippedGroup extends DuplicateGroup {
  reason: string;
}

/**
 * Profiles that share the last 8 of a VIN, in one store. A group is held back
 * when the records disagree about which car it is — two different full VINs,
 * two model years, two models — because a shared tail alone could be two cars.
 */
export function groupCarsOnSeveralProfiles(
  profiles: ReadonlyArray<{ id: string; data: Record<string, unknown> }>
): { groups: DuplicateGroup[]; skipped: SkippedGroup[] } {
  const byTail = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
  for (const p of profiles) {
    if (p.data.mergedInto) continue;
    const tail = vinTail(p.data);
    if (!tail) continue;
    if (!byTail.has(tail)) byTail.set(tail, []);
    byTail.get(tail)!.push(p);
  }
  const groups: DuplicateGroup[] = [];
  const skipped: SkippedGroup[] = [];
  for (const [tail, list] of byTail) {
    if (list.length < 2) continue;
    const ids = list.map((p) => p.id).sort();
    const vins = new Set(list.map((p) => fullVin(p.data)).filter(Boolean));
    const years = new Set(list.map((p) => String(p.data.year ?? '').trim()).filter(Boolean));
    const models = [...new Set(list.map((p) => modelKey(p.data)).filter((m) => m && m !== 'UNKNOWN'))];
    if (vins.size > 1) skipped.push({ tail, ids, reason: 'Different full VINs share the last 8' });
    else if (years.size > 1) skipped.push({ tail, ids, reason: `Model years differ (${[...years].join(' / ')})` });
    else if (!modelsAgree(models)) skipped.push({ tail, ids, reason: `Models differ (${models.join(' / ')})` });
    else groups.push({ tail, ids });
  }
  groups.sort((a, b) => a.tail.localeCompare(b.tail));
  skipped.sort((a, b) => a.tail.localeCompare(b.tail));
  return { groups, skipped };
}

// --- people --------------------------------------------------------------------

const nameWords = (s: unknown) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Same placeholders the app hides (customerName.ts): "Customer", "Unknown". */
const PLACEHOLDER_WORD = /^(UNKNOWN|CUSTOMER)$/;

export function personName(data: Record<string, unknown>): string {
  return [...nameWords(data.firstName), ...nameWords(data.lastName)].filter((w) => !PLACEHOLDER_WORD.test(w)).join(' ');
}

export function isPlaceholderName(data: Record<string, unknown>): boolean {
  return personName(data) === '';
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);
const emailOf = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Two real names for one person: the same, a typo apart ("RUBACALBA" /
 * "RUBALCABA"), one inside the other ("DAVID RIOS" / "DAVID GARCIA RIOS"), or
 * the same phone or email.
 */
export function samePerson(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const na = personName(a);
  const nb = personName(b);
  if (!na || !nb) return false;
  if (na === nb || levenshtein(na, nb) <= 2) return true;
  const wa = na.split(' ');
  const wb = nb.split(' ');
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short.length >= 2 && short.every((w) => long.includes(w))) return true;
  const pa = digits(a.phone);
  if (pa.length === 10 && pa === digits(b.phone)) return true;
  const ea = emailOf(a.email);
  return Boolean(ea) && ea === emailOf(b.email);
}

// --- visits --------------------------------------------------------------------

const soKey = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '');

function embeddedVisits(data: Record<string, unknown>): StoredVisit[] {
  return Array.isArray(data.recentVisits) ? (data.recentVisits as StoredVisit[]) : [];
}

function summaryOf(data: Record<string, unknown>): VisitSummary | null {
  const s = data.visitSummary as VisitSummary | undefined;
  return s && Array.isArray(s.entries) ? s : null;
}

/** Every visit a profile knows of, as {date, so}: summary, old array and stored docs. */
export function visitMarks(p: ProfileForMerge): Array<{ date: string; so: string }> {
  const out: Array<{ date: string; so: string }> = [];
  for (const e of summaryOf(p.data)?.entries ?? []) out.push({ date: e.date || '', so: soKey(e.so) });
  for (const v of embeddedVisits(p.data)) out.push({ date: visitDay(v.date), so: soKey(v.soNumber) });
  for (const d of p.visitDocs) out.push({ date: visitDay(d.data.date), so: soKey(d.data.soNumber) });
  const last = visitDay(p.data.lastServiceDate);
  if (last) out.push({ date: last, so: '' });
  return out;
}

const latestOf = (marks: Array<{ date: string }>) => marks.map((m) => m.date).filter(Boolean).sort().pop() ?? '';

const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5;

const isPbsLinked = (p: ProfileForMerge) =>
  Boolean(p.data.pbsVehicleId) || (Array.isArray(p.data.pbsVehicleRefs) && p.data.pbsVehicleRefs.length > 0);

// --- the plan --------------------------------------------------------------------

const PERSON_FIELDS = ['firstName', 'lastName', 'phone', 'email', 'address', 'city', 'state', 'zip', 'language'] as const;
const CONTACT_FIELDS = ['lastContactOutcome', 'lastContactUserId', 'lastContactUsername', 'lastServiceContact'] as const;

export interface VisitCopy {
  /** The document id on the kept profile. */
  docId: string;
  visit: StoredVisit;
  fromCustomerId: string;
  /** Its id on the merged profile (array id or document id). */
  fromVisitId: string;
}

export type OwnerReason =
  | 'newest visit'
  | 'same visit on both — kept the record with the real name'
  | 'same visit on both'
  | 'newest visit has no name on file — used the real name on the other record';

export interface CarMergePlan {
  tail: string;
  vin: string;
  keepId: string;
  mergeIds: string[];
  /** Whose details end up on the kept profile, and why. */
  ownerId: string;
  ownerReason: OwnerReason;
  ownerName: string;
  /** The kept record's name before, and each merged record's: for the preview. */
  keptNameBefore: string;
  mergedNames: string[];
  /** Real names on both sides that are not one person: the car changed hands. */
  ownerChanged: boolean;
  /** Field changes for the kept profile. `null` means delete the field. */
  keepPatch: Record<string, unknown>;
  /** Field changes for each merged profile. `null` means delete the field. */
  mergePatches: Record<string, Record<string, unknown>>;
  visitCopies: VisitCopy[];
  /** Visits already copied by an earlier run, counted into the summary again. */
  visitsAlreadyCopied: number;
  /** PBS repair orders the kept profile already stores under the same id. */
  visitsSameRepairOrder: number;
  /** Merged profiles whose call notes (contactLog) move too: same person. */
  copyContactLogFrom: string[];
  visitsBefore: { keep: number; merged: number };
}

/**
 * Plan one car's merge. `profiles` are every profile in the group, freshly read;
 * `now` is an ISO timestamp.
 */
export function planCarMerge(tail: string, profiles: ReadonlyArray<ProfileForMerge>, now: string): CarMergePlan {
  if (profiles.length < 2) throw new Error(`planCarMerge needs two profiles, got ${profiles.length}`);
  const marks = new Map(profiles.map((p) => [p.id, visitMarks(p)]));
  const latest = new Map(profiles.map((p) => [p.id, latestOf(marks.get(p.id)!)]));

  // Most recent visit first; a real name, then a PBS link, then more visits break ties.
  const ranked = [...profiles].sort(
    (a, b) =>
      (latest.get(b.id)! || '').localeCompare(latest.get(a.id)! || '') ||
      Number(!isPlaceholderName(b.data)) - Number(!isPlaceholderName(a.data)) ||
      Number(isPbsLinked(b)) - Number(isPbsLinked(a)) ||
      marks.get(b.id)!.length - marks.get(a.id)!.length ||
      a.id.localeCompare(b.id)
  );
  const top = ranked[0];
  const topLatest = latest.get(top.id)!;
  const topSos = new Set(marks.get(top.id)!.filter((m) => m.so && m.date === topLatest).map((m) => m.so));
  // Profiles whose newest visit is the top profile's newest visit.
  const tied = ranked.filter((p) => {
    const l = latest.get(p.id)!;
    if (p === top) return true;
    if (!l || !topLatest || daysApart(l, topLatest) > 2) return false;
    const sos = marks.get(p.id)!.filter((m) => m.so && m.date === l).map((m) => m.so);
    return sos.length === 0 || topSos.size === 0 || sos.some((s) => topSos.has(s));
  });

  let owner = tied.find((p) => !isPlaceholderName(p.data)) ?? top;
  let ownerReason: OwnerReason =
    tied.length > 1 ? (owner === top ? 'same visit on both' : 'same visit on both — kept the record with the real name') : 'newest visit';
  if (isPlaceholderName(owner.data)) {
    const named = ranked.find((p) => !isPlaceholderName(p.data));
    if (named) {
      owner = named;
      ownerReason = 'newest visit has no name on file — used the real name on the other record';
    }
  }

  // The record kept is the one the sync can find: PBS-linked, the owner's if it is.
  const linked = ranked.filter(isPbsLinked);
  const keep = linked.includes(owner) ? owner : linked[0] ?? owner;
  const merged = profiles.filter((p) => p !== keep);
  const keepData = keep.data;
  const keepPatch: Record<string, unknown> = {};
  const set = (field: string, value: unknown) => {
    keepPatch[field] = value;
  };
  const current = (field: string) => (field in keepPatch ? keepPatch[field] : keepData[field]);
  const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

  // Who the kept profile describes.
  let ownerChanged = false;
  if (owner !== keep) {
    if (isPlaceholderName(keepData) || samePerson(keepData, owner.data)) {
      // The same person, or a record PBS has no name for: fill in what it lacks.
      if (isPlaceholderName(keepData)) {
        set('firstName', owner.data.firstName ?? '');
        set('lastName', owner.data.lastName ?? '');
      }
      for (const f of PERSON_FIELDS) if (f !== 'firstName' && f !== 'lastName' && blank(keepData[f]) && !blank(owner.data[f])) set(f, owner.data[f]);
    } else {
      // A different person came in more recently: the kept record becomes theirs.
      ownerChanged = true;
      for (const f of PERSON_FIELDS) set(f, blank(owner.data[f]) ? null : owner.data[f]);
    }
  }
  for (const m of merged) {
    if (!isPlaceholderName(m.data) && !isPlaceholderName(owner.data) && !samePerson(m.data, owner.data)) ownerChanged = true;
  }
  const finalPerson = { ...keepData, ...Object.fromEntries(PERSON_FIELDS.map((f) => [f, current(f)])) };

  // The car: one full VIN, every PBS record for it, facts the kept record lacks.
  const vin = profiles.map((p) => fullVin(p.data)).find(Boolean) ?? '';
  if (vin && fullVin(keepData) !== vin) set('vin', vin);
  if (clean(keepData.vinLast8) !== tail) set('vinLast8', tail);
  const refs = new Set<string>();
  for (const p of [keep, ...merged]) {
    if (p.data.pbsVehicleId) refs.add(String(p.data.pbsVehicleId));
    for (const r of Array.isArray(p.data.pbsVehicleRefs) ? p.data.pbsVehicleRefs : []) if (r) refs.add(String(r));
  }
  const existingRefs = Array.isArray(keepData.pbsVehicleRefs) ? keepData.pbsVehicleRefs.map(String) : [];
  if (refs.size > 0 && [...refs].some((r) => !existingRefs.includes(r))) set('pbsVehicleRefs', [...refs]);
  if (!keepData.pbsVehicleId && refs.size > 0) set('pbsVehicleId', [...refs][0]);
  for (const m of merged) {
    if (blank(current('pbsContactId')) && !blank(m.data.pbsContactId) && !ownerChanged) set('pbsContactId', m.data.pbsContactId);
    if (blank(current('soldDate')) && !blank(m.data.soldDate)) set('soldDate', m.data.soldDate);
    if (blank(current('year')) && !blank(m.data.year)) set('year', m.data.year);
    const model = String(current('model') ?? '').trim();
    if ((!model || model.toLowerCase() === 'unknown') && !blank(m.data.model)) set('model', m.data.model);
  }

  // What advisors recorded about the person: carried only when it is the same person.
  const copyContactLogFrom: string[] = [];
  for (const m of merged) {
    const same = samePerson(finalPerson, m.data) || (isPlaceholderName(keepData) && m === owner);
    if (!same) continue;
    copyContactLogFrom.push(m.id);
    // The same person: a phone, email or address only the other record has.
    for (const f of PERSON_FIELDS) {
      if (f === 'firstName' || f === 'lastName') continue;
      if (blank(current(f)) && !blank(m.data[f])) set(f, m.data[f]);
    }
    // A customer who asked not to be contacted stays that way.
    if (m.data.stopAlertInfo && !current('stopAlertInfo')) set('stopAlertInfo', m.data.stopAlertInfo);
    if (m.data.enableServiceAlert === false && current('enableServiceAlert') !== false) set('enableServiceAlert', false);
    if (m.data.isHouseAccount === true && current('isHouseAccount') !== true) set('isHouseAccount', true);
    const notes = String(current('notes') ?? '').trim();
    const theirs = String(m.data.notes ?? '').trim();
    if (theirs && !notes.includes(theirs)) set('notes', notes ? `${notes}\n\n${theirs}` : theirs);
    if (String(m.data.lastServiceContact ?? '') > String(current('lastServiceContact') ?? '')) {
      for (const f of CONTACT_FIELDS) if (!blank(m.data[f])) set(f, m.data[f]);
    }
    if (blank(current('serviceReminderDueDate')) && !blank(m.data.serviceReminderDueDate)) set('serviceReminderDueDate', m.data.serviceReminderDueDate);
    for (const f of ['salesman', 'soldByUserId', 'soldByUsername'] as const) if (blank(current(f)) && !blank(m.data[f])) set(f, m.data[f]);
  }

  // Visits: every one from the merged profiles, under an id the kept profile doesn't use.
  const taken = new Set(keep.visitDocs.map((d) => d.id));
  const alreadyCopied = keep.visitDocs.filter((d) => merged.some((m) => d.data.movedFromCustomerId === m.id));
  const alreadyKey = new Set(alreadyCopied.map((d) => `${d.data.movedFromCustomerId}/${d.data.movedFromVisitId}`));
  const visitCopies: VisitCopy[] = [];
  let visitsSameRepairOrder = 0;
  for (const m of merged) {
    const fromArray = assignVisitDocIds(embeddedVisits(m.data)).map(({ docId, visit }) => ({ fromVisitId: docId, visit }));
    const fromDocs = m.visitDocs.map((d) => ({ fromVisitId: d.id, visit: d.data }));
    for (const { fromVisitId, visit } of [...fromDocs, ...fromArray]) {
      if (alreadyKey.has(`${m.id}/${fromVisitId}`)) continue;
      // The same PBS repair order, already stored on the kept profile.
      if (fromVisitId.startsWith('pbs-') && taken.has(fromVisitId)) {
        visitsSameRepairOrder++;
        continue;
      }
      let docId = fromVisitId;
      for (let n = 1; taken.has(docId); n++) docId = `${fromVisitId}~${m.id.slice(0, 6)}${n > 1 ? `-${n}` : ''}`;
      taken.add(docId);
      visitCopies.push({ docId, visit, fromCustomerId: m.id, fromVisitId });
    }
  }

  const incoming = [
    ...alreadyCopied.map((d) => ({ docId: d.id, visit: d.data })),
    ...visitCopies.map((c) => ({ docId: c.docId, visit: c.visit })),
  ];
  const summary = mergeIntoSummary(refreshSummaryFromEmbedded(summaryOf(keepData), embeddedVisits(keepData), now), incoming, now);
  set('visitSummary', summary);
  const lastDate = [summary.entries.find((e) => e.date)?.date ?? '', visitDay(keepData.lastServiceDate)].filter(Boolean).sort().pop();
  if (lastDate && lastDate !== String(keepData.lastServiceDate ?? '')) set('lastServiceDate', lastDate);
  const mergedFrom = new Set([...(Array.isArray(keepData.mergedFrom) ? keepData.mergedFrom.map(String) : []), ...merged.map((m) => m.id)]);
  set('mergedFrom', [...mergedFrom]);
  set('mergedAt', now);

  const mergePatches: Record<string, Record<string, unknown>> = {};
  for (const m of merged) {
    mergePatches[m.id] = {
      mergedInto: keep.id,
      mergedAt: now,
      mergedVin: vin || tail,
      // The car, its PBS link and its history now live on the kept profile.
      vin: null,
      vinLast8: null,
      pbsVehicleId: null,
      pbsVehicleRefs: null,
      pbsContactId: null,
      recentVisits: null,
      visitSummary: null,
      lastServiceDate: null,
      enableServiceAlert: false,
    };
  }

  return {
    tail,
    vin,
    keepId: keep.id,
    mergeIds: merged.map((m) => m.id),
    ownerId: owner.id,
    ownerReason,
    ownerName: personName(finalPerson),
    keptNameBefore: personName(keepData),
    mergedNames: merged.map((m) => personName(m.data)),
    ownerChanged,
    keepPatch,
    mergePatches,
    visitCopies,
    visitsAlreadyCopied: alreadyCopied.length,
    visitsSameRepairOrder,
    copyContactLogFrom,
    visitsBefore: {
      keep: keep.visitDocs.length + embeddedVisits(keepData).length,
      merged: merged.reduce((n, m) => n + m.visitDocs.length + embeddedVisits(m.data).length, 0),
    },
  };
}
