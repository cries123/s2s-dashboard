import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Customer } from '../types';
import { isPreviewMode } from '../lib/previewMode';

export function useCustomers(dealershipId?: string, isAdmin?: boolean) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(!isPreviewMode);

  useEffect(() => {
    if (isPreviewMode) return;

    if (!dealershipId && !isAdmin) {
      setLoading(false);
      return;
    }

    // Admins fetch everything to handle legacy data without dealershipId
    // Managers use where clause for strict security rule compliance
    const q = isAdmin 
      ? query(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'))
      : query(
          collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'),
          where('dealershipId', '==', dealershipId)
        );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      
      // If admin, we filter in memory so we can show "Legacy" data in the Hyundai view
      if (isAdmin && dealershipId) {
        list = list.filter(c => {
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
