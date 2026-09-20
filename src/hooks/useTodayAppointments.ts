import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { ScheduledAppointmentSlot } from '../types';
import { appointmentTrackerDoc, toLocalDateString } from '../lib/appointmentTracker';
import { appointmentScheduleDocId } from '../lib/appointmentSchedule';
import { isPreviewMode } from '../lib/previewMode';
import { buildPreviewDaySchedule } from '../lib/previewFixtures';

// Keep the date current when a workstation stays open overnight. A scoped state
// key prevents yesterday's or another dealership's customers flashing on screen.
export function useTodayAppointments(dealershipId: string) {
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const key = `${dealershipId}:${date}`;
  const [state, setState] = useState<{
    key: string; count: number | null; scheduleCount: number | null; slots: ScheduledAppointmentSlot[];
    loading: boolean; error: boolean;
  }>({ key: '', count: null, scheduleCount: null, slots: [], loading: true, error: false });

  useEffect(() => {
    const timer = setInterval(() => setDate(toLocalDateString(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    if (isPreviewMode) {
      const slots = buildPreviewDaySchedule().sort((a, b) => a.startMinutes - b.startMinutes);
      setState({ key, count: slots.length, scheduleCount: slots.length, slots, loading: false, error: false });
      return;
    }
    setState({ key, count: null, scheduleCount: null, slots: [], loading: true, error: false });
    if (!dealershipId) return;
    const fail = () => {
      if (active) setState(s => ({ ...s, loading: false, error: true }));
    };
    const stopCount = onSnapshot(appointmentTrackerDoc(db, dealershipId, date), snap => {
      if (!active) return;
      const count = snap.exists() ? Number(snap.data().count) : null;
      setState(s => ({ ...s, count: count !== null && Number.isFinite(count) ? count : null }));
    }, fail);
    const stopSchedule = onSnapshot(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data',
      'appointmentSchedule', appointmentScheduleDocId(dealershipId, date)), snap => {
      if (!active) return;
      const data = snap.exists() ? snap.data() : null;
      const slots = data?.dealershipId === dealershipId && Array.isArray(data.appointments)
        ? [...data.appointments].sort((a, b) => a.startMinutes - b.startMinutes) : [];
      setState(s => ({ ...s, slots, loading: false,
        scheduleCount: data?.dealershipId === dealershipId ? slots.length : null }));
    }, fail);
    return () => { active = false; stopCount(); stopSchedule(); };
  }, [dealershipId, date, key]);

  return { date, ...(state.key === key ? { ...state, count: state.count ?? state.scheduleCount } : {
    count: null, scheduleCount: null, slots: [], loading: true, error: false,
  }) };
}
