import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { ScheduledAppointmentSlot } from '../types';
import { isPreviewMode } from '../lib/previewMode';
import { buildPreviewDaySchedule, PREVIEW_CUSTOMERS } from '../lib/previewFixtures';

export interface RangeAppointment extends ScheduledAppointmentSlot {
  /** Local date the appointment was booked for, YYYY-MM-DD. */
  date: string;
}

interface State {
  appointments: RangeAppointment[];
  days: number;
  loading: boolean;
  error: string | null;
}

/**
 * Every appointment booked between two dates, for the show-rate calculation.
 *
 * The schedule is stored one document per day, so this reads a range rather
 * than subscribing — a month of days is a one-off read, and nobody needs the
 * previous month updating live while they look at it.
 */
export function useAppointmentRange(
  dealershipId: string,
  startDate: string,
  endDate: string
): State {
  const [state, setState] = useState<State>({
    appointments: [],
    days: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;

    if (isPreviewMode) {
      // Built from the preview customers so the show rate has something real to
      // compute: most booked on a day they have a repair order, one who did not
      // come in, and one name with no customer record at all.
      const base = buildPreviewDaySchedule();
      const slots: RangeAppointment[] = PREVIEW_CUSTOMERS.filter((c) => c.recentVisits?.length).map(
        (c, i) => ({
          ...base[i % base.length],
          id: `preview-appt-${i}`,
          date: i === 0 ? startDate : String(c.recentVisits![0].date),
          customerName: `${c.lastName}, ${c.firstName}`.trim(),
          advisor: i % 2 === 0 ? 'Frank' : 'Lemmy',
        })
      );
      slots.push({
        ...base[0],
        id: 'preview-appt-unknown',
        date: startDate,
        customerName: 'WALKER, DREW',
        advisor: 'Frank',
      });
      setState({ appointments: slots, days: slots.length, loading: false, error: null });
      return;
    }

    if (!dealershipId || !startDate || !endDate) {
      setState({ appointments: [], days: 0, loading: false, error: null });
      return;
    }

    setState({ appointments: [], days: 0, loading: true, error: null });

    (async () => {
      try {
        // The document id embeds the dealership, so the date filter has to be a
        // field query; the dealershipId check below keeps stores separate.
        const snap = await getDocs(
          query(
            collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentSchedule'),
            where('dealershipId', '==', dealershipId),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
          )
        );
        if (!active) return;

        const appointments: RangeAppointment[] = [];
        let days = 0;
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.dealershipId !== dealershipId) return;
          const date = String(data.date ?? '');
          if (!date) return;
          days += 1;
          for (const slot of Array.isArray(data.appointments) ? data.appointments : []) {
            appointments.push({ ...(slot as ScheduledAppointmentSlot), date });
          }
        });

        setState({ appointments, days, loading: false, error: null });
      } catch (e) {
        if (!active) return;
        setState({
          appointments: [],
          days: 0,
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load the appointment schedule.',
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [dealershipId, startDate, endDate]);

  return state;
}
