import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Customer, ServiceVisit } from '../types';
import { isPreviewMode } from '../lib/previewMode';
import {
  assignVisitDocIds,
  foldImportedDuplicates,
  SERVICE_VISITS_COLLECTION,
  visitDay,
  type StoredVisit,
} from '../lib/visitStore';
import type { OwnedVisit } from '../lib/topMovingParts';

/**
 * Full service visits, loaded only when a screen actually needs the detail.
 *
 * Lists read the compact summary on each customer. These two hooks are for the
 * places that need every line and part: one customer's history, and a month of
 * visits across the store for the parts report.
 *
 * Both combine the moved visits with any still in a customer's old array, so a
 * customer looks the same before, during and after the move. Where a visit is
 * in both, the moved copy wins — it is the one the sync keeps current.
 */

const customersPath = ['artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'] as const;

const dealershipOf = (customer: Pick<Customer, 'dealershipId'> | null | undefined): string =>
  (customer as { dealershipId?: string } | null | undefined)?.dealershipId || 'hyundai';

/**
 * Union two lists of visits by document id; the stored one wins a tie. Then an
 * imported copy of a repair order PBS also has is hidden in favour of the PBS
 * one — the detailed version — though both stay stored.
 */
function combine(stored: Map<string, ServiceVisit>, embedded: readonly ServiceVisit[]): ServiceVisit[] {
  const out = new Map(stored);
  for (const { docId, visit } of assignVisitDocIds(embedded as unknown as StoredVisit[])) {
    if (!out.has(docId)) {
      out.set(docId, { ...(visit as unknown as ServiceVisit), id: String(visit.id || docId) });
    }
  }
  const shown = foldImportedDuplicates(
    [...out.values()] as unknown as StoredVisit[],
    (v) => String(v.id ?? '')
  ) as unknown as ServiceVisit[];
  return shown.sort((a, b) => visitDay(b.date).localeCompare(visitDay(a.date)));
}

/** Every visit for one customer, newest first. */
export function useCustomerVisits(customer: Customer | null | undefined): {
  visits: ServiceVisit[];
  loading: boolean;
  error: string | null;
} {
  const [stored, setStored] = useState<Map<string, ServiceVisit>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const customerId = customer?.id;
  const dealershipId = dealershipOf(customer);

  useEffect(() => {
    if (!customerId || isPreviewMode) {
      setStored(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // The dealership filter is what the security rules check a list against.
    getDocs(
      query(
        collection(db, ...customersPath, customerId, SERVICE_VISITS_COLLECTION),
        where('dealershipId', '==', dealershipId)
      )
    )
      .then((snap) => {
        if (cancelled) return;
        setStored(new Map(snap.docs.map((d) => [d.id, { ...(d.data() as ServiceVisit), id: d.id }])));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[Visits] Could not load service history:', err);
        // Fall back to whatever the old array has, and say so.
        setError('Showing the service history saved on this record; the full history could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, dealershipId]);

  const visits = useMemo(
    () => combine(stored, customer?.recentVisits ?? []),
    [stored, customer?.recentVisits]
  );
  return { visits, loading, error };
}

/** Every visit in a date range across the store, for reports. */
export function useVisitsInRange(
  dealershipId: string,
  start: string,
  end: string,
  customers: readonly Customer[]
): { visits: OwnedVisit[]; loading: boolean } {
  const [stored, setStored] = useState<OwnedVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPreviewMode) {
      setStored([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDocs(
      query(
        collectionGroup(db, SERVICE_VISITS_COLLECTION),
        where('dealershipId', '==', dealershipId),
        where('date', '>=', start),
        where('date', '<=', end)
      )
    )
      .then((snap) => {
        if (cancelled) return;
        setStored(
          snap.docs.map((d) => ({
            customerId: String(d.data().customerId || d.ref.parent.parent?.id || ''),
            visit: { ...(d.data() as ServiceVisit), id: d.id },
          }))
        );
      })
      .catch((err: unknown) => {
        // A missing index or a rules gap should not blank the card: the old
        // arrays below still produce a result for customers not yet moved.
        if (!cancelled) console.error('[Visits] Could not load visits for the period:', err);
        if (!cancelled) setStored([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealershipId, start, end]);

  const visits = useMemo(() => {
    const seen = new Set(stored.map((v) => `${v.customerId}/${v.visit.id}`));
    const out = [...stored];
    for (const customer of customers) {
      for (const { docId, visit } of assignVisitDocIds((customer.recentVisits ?? []) as unknown as StoredVisit[])) {
        const key = `${customer.id}/${docId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ customerId: customer.id, visit: visit as unknown as ServiceVisit });
      }
    }
    return out;
  }, [stored, customers]);

  return { visits, loading };
}
