import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Customer } from '../types';
import { isPreviewMode } from '../lib/previewMode';
import { PREVIEW_CUSTOMERS } from '../lib/previewFixtures';

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

    // Every non-admin (and any admin viewing one specific dealership) must query
    // with an explicit dealershipId filter — Firestore's own security rules now
    // require it to prove the query can't return another tenant's customers.
    // True admins with no dealershipId set (viewing "all") are exempt because
    // isAdmin() alone satisfies the rule regardless of query shape.
    const q =
      !dealershipId && isAdmin
        ? query(collectionRef)
        : query(collectionRef, where('dealershipId', '==', dealershipId || 'hyundai'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Customer));

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
