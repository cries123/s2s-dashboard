import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
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

    if (!dealershipId && !isAdmin) {
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

    // Load full CRM once, then scope in memory per dealership (all stores — not Hyundai-only).
    const q = query(collectionRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Customer));

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
