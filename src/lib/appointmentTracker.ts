import { doc, Firestore } from 'firebase/firestore';

const TRACKER_SEGMENTS = [
  'artifacts',
  'hyundai-sales-to-service',
  'public',
  'data',
  'appointmentTracker',
] as const;

/** Tenant-scoped doc id — avoids date-only collisions across dealerships. */
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
