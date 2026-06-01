import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Customer, DailyStat, WorkQueueItem, ServiceDriveReason, QueuePriorityProfile } from '../types';
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
  staleFollowUp: number;
  todayAppointments: number;
}

export interface ServiceDriveQueueOptions {
  followUpDays?: number;
  queuePriority?: QueuePriorityProfile;
}

export function useServiceDriveQueue(
  customers: Customer[],
  dealershipId?: string,
  options?: ServiceDriveQueueOptions
) {
  const [todayAppointments, setTodayAppointments] = useState(0);

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
    () =>
      buildWorkQueue(customers, {
        followUpDays: options?.followUpDays,
        queuePriority: options?.queuePriority,
      }),
    [customers, options?.followUpDays, options?.queuePriority]
  );

  const stats: ServiceDriveStats = useMemo(() => {
    const countReason = (reason: ServiceDriveReason) =>
      queue.filter((item) => item.reasons.includes(reason)).length;

    return {
      queueTotal: queue.length,
      serviceDue: countReason('service_due'),
      staleFollowUp: countReason('stale_followup'),
      todayAppointments,
    };
  }, [queue, todayAppointments]);

  const filterQueue = (filter: 'all' | ServiceDriveReason): WorkQueueItem[] => {
    if (filter === 'all') return queue;
    return queue.filter((item) => item.reasons.includes(filter));
  };

  return { queue, stats, filterQueue };
}
