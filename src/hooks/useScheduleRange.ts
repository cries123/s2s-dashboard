import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { ScheduledAppointmentSlot } from '../types';
import type { ShowUpDay } from '../lib/appointmentShowUp';
import { isPreviewMode } from '../lib/previewMode';
import { buildPreviewDaySchedule } from '../lib/previewFixtures';

interface State {
  days: ShowUpDay[];
  loading: boolean;
  error: string | null;
}

/**
 * The stored appointment schedule for every day between two dates.
 *
 * The schedule is one document per day, so this is a single range read rather
 * than a live subscription: the show-up card needs a month and the one before
 * it, and a past month does not change while someone looks at it.
 */
export function useScheduleRange(
  dealershipId: string,
  startDate: string,
  endDate: string,
  /** Change it to read again — after a month is rebuilt from PBS, say. */
  reloadKey = 0
): State {
  const [state, setState] = useState<State>({ days: [], loading: true, error: null });

  useEffect(() => {
    let active = true;

    if (isPreviewMode) {
      // Two weeks shaped like the live schedule: mostly Transfer, some Open, a Void.
      const base = buildPreviewDaySchedule();
      const days: ShowUpDay[] = [];
      const cursor = new Date(`${startDate}T12:00:00`);
      const end = new Date(`${endDate}T12:00:00`);
      let n = 0;
      while (cursor <= end && days.length < 62) {
        const date = cursor.toLocaleDateString('en-CA');
        days.push({
          date,
          appointments: base.map((slot, i) => ({
            ...slot,
            status: (n + i) % 7 === 0 ? 'Open' : (n + i) % 11 === 0 ? 'Void' : 'Transfer',
          })),
        });
        cursor.setDate(cursor.getDate() + 1);
        n += 1;
      }
      setState({ days, loading: false, error: null });
      return;
    }

    if (!dealershipId || !startDate || !endDate) {
      setState({ days: [], loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        // The document id embeds the dealership, so the date has to be a field
        // query; the dealershipId check keeps stores apart.
        const snap = await getDocs(
          query(
            collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentSchedule'),
            where('dealershipId', '==', dealershipId),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
          )
        );
        if (!active) return;
        const days: ShowUpDay[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.dealershipId !== dealershipId) return;
          const date = String(data.date ?? '');
          if (!date) return;
          days.push({
            date,
            appointments: (Array.isArray(data.appointments) ? data.appointments : []) as ScheduledAppointmentSlot[],
          });
        });
        setState({ days, loading: false, error: null });
      } catch (e) {
        if (!active) return;
        setState({
          days: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load the appointment schedule.',
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [dealershipId, startDate, endDate, reloadKey]);

  return state;
}
