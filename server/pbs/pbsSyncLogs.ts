import type { Firestore } from 'firebase-admin/firestore';
import { dealershipSettingsDoc, serverTimestamp } from './pbsFirestore.js';
import type { PbsSyncLogEntry } from './pbsTypes.js';

const MAX_LOG_ENTRIES = 40;

export async function appendPbsSyncLog(
  db: Firestore,
  dealershipId: string,
  entry: PbsSyncLogEntry
): Promise<void> {
  const ref = dealershipSettingsDoc(db, dealershipId);
  const snap = await ref.get();
  const existing = (snap.data()?.pbsSyncLogs as PbsSyncLogEntry[] | undefined) ?? [];
  const pbsSyncLogs = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);

  await ref.set(
    {
      id: dealershipId,
      pbsSyncLogs,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function buildPbsSyncSummary(
  ok: boolean,
  fetched: PbsSyncLogEntry['fetched'],
  counts: PbsSyncLogEntry['counts'],
  error?: string
): string {
  if (!ok) {
    return error ? `Sync failed: ${error}` : 'Sync failed.';
  }

  return [
    `Pulled ${fetched.contactVehicles} customer/vehicle records, ${fetched.repairOrders} repair orders, and ${fetched.appointments} appointments (${fetched.appointmentMonthStart} through ${fetched.appointmentMonthEnd}).`,
    `Directory: ${counts.customersCreated} new, ${counts.customersUpdated} updated${counts.ownerChanges ? `, ${counts.ownerChanges} owner changes` : ''}.`,
    `Service history: ${counts.visitsMerged} visits merged.`,
    `Operations: ${counts.appointmentDaysUpdated} days refreshed (${counts.appointmentsProcessed} appointments in month).`,
  ].join(' ');
}
