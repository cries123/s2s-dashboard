import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
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

    // Hyundai includes legacy CRM rows without dealershipId — same as directory behavior.
    const useBroadHyundaiQuery = dealershipId === 'hyundai';
    const q =
      isAdmin || useBroadHyundaiQuery
        ? query(collectionRef)
        : query(collectionRef, where('dealershipId', '==', dealershipId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));

      if (dealershipId) {
        list = list.filter((c) => {
          if (dealershipId === 'hyundai') {
            return !c.dealershipId || c.dealershipId === 'hyundai';
          }
          return c.dealershipId === dealershipId;
        });
      }

      // Sort in memory to avoid needing a composite index in Firestore
      list.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setCustomers(list);
      setLoading(false);
    }, (err) => {
      console.error("useCustomers Error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dealershipId, isAdmin]);

  return { customers, loading };
}
