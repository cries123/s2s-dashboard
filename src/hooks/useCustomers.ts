import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Customer } from '../types';
import { isPreviewMode } from '../lib/previewMode';
import { PREVIEW_CUSTOMERS } from '../lib/previewFixtures';

function customersForDealership(customers: Customer[], dealershipId: string): Customer[] {
  return customers.filter((customer) => {
    if (dealershipId === 'hyundai') {
      return !customer.dealershipId || customer.dealershipId === 'hyundai';
    }
    return customer.dealershipId === dealershipId;
  });
}

export function useCustomers(dealershipId?: string, isAdmin?: boolean) {
  const [customers, setCustomers] = useState<Customer[]>(isPreviewMode ? PREVIEW_CUSTOMERS : []);
  const [loading, setLoading] = useState(!isPreviewMode);

  useEffect(() => {
    if (isPreviewMode) {
      setCustomers(PREVIEW_CUSTOMERS);
      setLoading(false);
      return;
    }

    if (!dealershipId) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    const collectionRef = collection(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'customers'
    );

    // Always scope at the database. The rules evaluate list requests against the
    // query, not the results, so an unfiltered read is denied outright for
    // non-admins — and it would otherwise pull every store's customers.
    const q = query(collectionRef, where('dealershipId', '==', dealershipId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // With the on-device cache, the first answer comes from the device. An
        // empty one on a first visit just means nothing is cached yet, not that
        // the store has no customers — wait for the server rather than flash
        // an empty list and every "0" that follows from it.
        if (snapshot.empty && snapshot.metadata.fromCache) return;

        // A profile folded into another one for the same car (mergedInto) is
        // kept for the record but is not a customer to list, alert or count.
        let list = snapshot.docs
          .filter((docSnap) => !docSnap.get('mergedInto'))
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Customer));

        if (dealershipId) {
          list = customersForDealership(list, dealershipId);
        }

        list.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        setCustomers(list);
        setLoading(false);
      },
      (err) => {
        console.error('useCustomers Error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [dealershipId, isAdmin]);

  return { customers, loading };
}
