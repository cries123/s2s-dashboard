import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { Customer, DailyStat, WorkQueueItem, ServiceDriveReason } from '../types';
import { buildWorkQueue } from '../lib/serviceDrivePriority';

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ServiceDriveStats {
  queueTotal: number;
  serviceDue: number;
  openRecalls: number;
  staleFollowUp: number;
  todayAppointments: number;
}

export function useServiceDriveQueue(customers: Customer[], dealershipId?: string) {
  const [recallCountByCustomerId, setRecallCountByCustomerId] = useState<Record<string, number>>({});
  const [todayAppointments, setTodayAppointments] = useState(0);
  const [recallsLoading, setRecallsLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'vehicleRecalls')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const counts: Record<string, number> = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const customerId = data.customerId as string | undefined;
          if (customerId) {
            counts[customerId] = (counts[customerId] || 0) + 1;
          }
        });
        setRecallCountByCustomerId(counts);
        setRecallsLoading(false);
      },
      () => setRecallsLoading(false)
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const today = todayISO();
    const statRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'appointmentTracker',
      today
    );

    const unsubscribe = onSnapshot(statRef, (snapshot) => {
      if (!snapshot.exists()) {
        setTodayAppointments(0);
        return;
      }
      const data = snapshot.data() as DailyStat;
      if (dealershipId && data.dealershipId && data.dealershipId !== dealershipId) {
        setTodayAppointments(0);
        return;
      }
      setTodayAppointments(data.count || 0);
    });

    return () => unsubscribe();
  }, [dealershipId]);

  const queue = useMemo(
    () => buildWorkQueue(customers, recallCountByCustomerId),
    [customers, recallCountByCustomerId]
  );

  const stats: ServiceDriveStats = useMemo(() => {
    const countReason = (reason: ServiceDriveReason) =>
      queue.filter((item) => item.reasons.includes(reason)).length;

    return {
      queueTotal: queue.length,
      serviceDue: countReason('service_due'),
      openRecalls: queue.filter((item) => item.recallCount > 0).length,
      staleFollowUp: countReason('stale_followup'),
      todayAppointments,
    };
  }, [queue, todayAppointments]);

  const filterQueue = (filter: 'all' | ServiceDriveReason): WorkQueueItem[] => {
    if (filter === 'all') return queue;
    return queue.filter((item) => item.reasons.includes(filter));
  };

  return { queue, stats, filterQueue, recallsLoading };
}
