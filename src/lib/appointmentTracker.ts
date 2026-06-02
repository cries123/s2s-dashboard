import { doc, Firestore } from 'firebase/firestore';
import type { DailyStat } from '../types';

const TRACKER_SEGMENTS = [
  'artifacts',
  'hyundai-sales-to-service',
  'public',
  'data',
  'appointmentTracker',
] as const;

/** Local calendar date YYYY-MM-DD (avoids UTC drift from toISOString). */
export function toLocalDateString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

/** Tenant-scoped doc id — one document per dealership per day. */
export function appointmentTrackerDocId(dealershipId: string, date: string): string {
  return `${dealershipId}_${date}`;
}

/** Pre–multi-tenant docs used the date alone (Hyundai data lived here). */
export function isLegacyAppointmentTrackerDocId(docId: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(docId);
}

export function appointmentTrackerDoc(db: Firestore, dealershipId: string, date: string) {
  return doc(db, ...TRACKER_SEGMENTS, appointmentTrackerDocId(dealershipId, date));
}

export function legacyAppointmentTrackerDoc(db: Firestore, date: string) {
  return doc(db, ...TRACKER_SEGMENTS, date);
}

export function resolveAppointmentCount(
  dealershipId: string,
  tenantData: { count?: number; dealershipId?: string } | undefined,
  legacyData: { count?: number; dealershipId?: string } | undefined
): number {
  if (tenantData && typeof tenantData.count === 'number') {
    return tenantData.count;
  }

  if (dealershipId === 'hyundai' && legacyData && typeof legacyData.count === 'number') {
    const owner = legacyData.dealershipId;
    if (!owner || owner === 'hyundai') {
      return legacyData.count;
    }
  }

  return 0;
}

/** Parse "For Jun 2, 2026" from PBS Appointment Details report header. */
export function extractReportDateFromAppointmentPdf(reportText: string): string | null {
  const match = reportText.match(/For\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!match) return null;

  const monthIndex = new Date(`${match[1]} 1, ${match[3]}`).getMonth();
  if (Number.isNaN(monthIndex)) return null;

  const year = match[3];
  const month = String(monthIndex + 1).padStart(2, '0');
  const day = String(parseInt(match[2], 10)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updatedAtMillis(stat: DailyStat): number {
  const ts = stat.updatedAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (ts?.toMillis) return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

/** Canonical doc id for reads/writes, preferring tenant-scoped ids. */
export function canonicalTrackerDocId(dealershipId: string, date: string): string {
  return appointmentTrackerDocId(dealershipId, date);
}

/**
 * Keep exactly one stat row per calendar date for MTD / forecast math.
 * Prefers tenant doc id, then legacy date-only id, then newest updatedAt.
 */
export function dedupeDailyStatsByDate(
  stats: DailyStat[],
  dealershipId: string
): DailyStat[] {
  const byDate = new Map<string, DailyStat>();

  for (const stat of stats) {
    if (!stat.date) continue;

    const tenantId = appointmentTrackerDocId(dealershipId, stat.date);
    const existing = byDate.get(stat.date);

    if (!existing) {
      byDate.set(stat.date, stat);
      continue;
    }

    const score = (row: DailyStat) => {
      if (row.id === tenantId) return 3;
      if (isLegacyAppointmentTrackerDocId(row.id) && dealershipId === 'hyundai') return 2;
      return 1;
    };

    const existingScore = score(existing);
    const currentScore = score(stat);

    if (currentScore > existingScore) {
      byDate.set(stat.date, stat);
      continue;
    }
    if (currentScore < existingScore) {
      continue;
    }

    if (updatedAtMillis(stat) >= updatedAtMillis(existing)) {
      byDate.set(stat.date, stat);
    }
  }

  return Array.from(byDate.values());
}

export function findDuplicateTrackerDocs(
  stats: DailyStat[],
  dealershipId: string,
  date: string
): DailyStat[] {
  const canonicalId = canonicalTrackerDocId(dealershipId, date);
  return stats.filter((s) => s.date === date && s.id !== canonicalId);
}

export function trackerDocRef(db: Firestore, dealershipId: string, date: string) {
  return appointmentTrackerDoc(db, dealershipId, date);
}
