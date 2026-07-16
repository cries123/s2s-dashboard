import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { pbsWorkplanReminderGet } from './partnerHubClient.js';
import {
  commitBatches,
  customersCollection,
  serverTimestamp,
  stripUndefinedDeep,
} from './pbsFirestore.js';
import type { PbsCustomerIndexMaps, PbsWorkplanReminder } from './pbsExtendedTypes.js';
import { isActivePbsWorkplanReminder, mapPbsReminderDueDate } from './pbsTechnicianAggregator.js';
import { normalizePbsRef } from './pbsAppointmentSchedule.js';

function reminderFetchCriteria(): Record<string, unknown> {
  return { FilterByActive: true };
}

export async function syncPbsWorkplanReminders(
  db: Firestore,
  dealershipId: string,
  index: PbsCustomerIndexMaps,
  syncedAt: string
): Promise<{ remindersFetched: number; customersUpdated: number }> {
  const response = await pbsWorkplanReminderGet(reminderFetchCriteria());
  const reminders = (response.Reminders || []) as PbsWorkplanReminder[];

  const dueByContact = new Map<string, string>();

  for (const reminder of reminders) {
    if (!isActivePbsWorkplanReminder(reminder)) continue;
    const contactRef = normalizePbsRef(reminder.ContactRef);
    if (!contactRef) continue;

    const dueDate = mapPbsReminderDueDate(reminder.DueDate);
    if (!dueDate) continue;

    const existing = dueByContact.get(contactRef);
    if (!existing || dueDate < existing) {
      dueByContact.set(contactRef, dueDate);
    }
  }

  const writes: Array<(batch: WriteBatch) => void> = [];
  let customersUpdated = 0;

  for (const [contactRef, dueDate] of dueByContact) {
    const customerId = index.byContactRef.get(contactRef);
    if (!customerId) continue;

    const existing = index.dataById.get(customerId) || {};
    if (String(existing.dealershipId || dealershipId) !== dealershipId) continue;

    const ref = customersCollection(db).doc(customerId);
    writes.push((batch) =>
      batch.set(
        ref,
        stripUndefinedDeep({
          serviceReminderDueDate: dueDate,
          enableServiceAlert: existing.enableServiceAlert ?? true,
          pbsSyncedAt: syncedAt,
          pbsReminderSyncedAt: syncedAt,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      )
    );

    index.dataById.set(customerId, {
      ...existing,
      serviceReminderDueDate: dueDate,
    });
    customersUpdated += 1;
  }

  await commitBatches(db, writes);

  console.log(
    `[PBS Sync] Workplan reminders: ${reminders.length} fetched, ${customersUpdated} customers updated with serviceReminderDueDate`
  );

  return {
    remindersFetched: reminders.length,
    customersUpdated,
  };
}
