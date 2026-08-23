import { pbsContactGet } from './partnerHubClient.js';
import { normalizePbsRef } from './pbsAppointmentSchedule.js';

export interface PbsContactName {
  firstName?: string;
  lastName?: string;
}

interface PbsContactRecord {
  ContactId?: string;
  FirstName?: string;
  LastName?: string;
  ContactName?: string;
}

const CONTACT_BATCH_SIZE = 100;

/**
 * Batch-fetch contact names by ContactRef for appointments that could not be
 * matched to the customer directory. Tolerant of API errors — returns what it can.
 */
export async function fetchContactNamesByRefs(
  contactRefs: string[]
): Promise<Map<string, PbsContactName>> {
  const names = new Map<string, PbsContactName>();
  const unique = [...new Set(contactRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (unique.length === 0) return names;

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += CONTACT_BATCH_SIZE) {
    batches.push(unique.slice(i, i + CONTACT_BATCH_SIZE));
  }

  // Batches are independent requests over disjoint ref slices — run concurrently.
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const response = await pbsContactGet({ ContactIdList: batch, IncludeInactive: true });
        const contacts = (response.Contacts || []) as PbsContactRecord[];
        for (const contact of contacts) {
          const key = normalizePbsRef(String(contact.ContactId || ''));
          if (!key) continue;
          const firstName = (contact.FirstName || '').trim();
          const lastName = (contact.LastName || '').trim();
          if (!firstName && !lastName && contact.ContactName) {
            names.set(key, { lastName: contact.ContactName.trim() });
            continue;
          }
          names.set(key, { firstName, lastName });
        }
      } catch (err) {
        console.warn(
          '[PBS Sync] ContactGet name fallback batch failed:',
          err instanceof Error ? err.message : err
        );
      }
    })
  );

  return names;
}
