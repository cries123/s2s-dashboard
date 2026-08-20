import { auth } from '../firebase';
import type { ScheduledAppointmentSlot } from '../types';

export interface DayAppointmentScheduleResponse {
  date: string;
  dealershipId: string;
  appointments: ScheduledAppointmentSlot[];
  source: 'firestore' | 'pbs';
  hydrated: boolean;
  error?: string;
}

async function bearerHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to load the day schedule.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchDayAppointmentSchedule(
  date: string,
  options: { refresh?: boolean } = {}
): Promise<DayAppointmentScheduleResponse> {
  const headers = await bearerHeaders();
  const query = options.refresh ? '?refresh=1' : '';
  const res = await fetch(`/api/pbs/appointment-schedule/${encodeURIComponent(date)}${query}`, {
    headers,
  });
  const data = (await res.json()) as DayAppointmentScheduleResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load day schedule from PBS.');
  }
  return data;
}
