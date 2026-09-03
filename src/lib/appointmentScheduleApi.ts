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
  if (!res.ok) {
    // The body may be an HTML error page rather than JSON, so never parse before
    // checking status — that is what surfaced "SyntaxError: Unexpected token '<'".
    const detail = await res.text().catch(() => '');
    let message = 'Could not load the day schedule.';
    try {
      const parsed = JSON.parse(detail) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      if (res.status === 401) message = 'Your session expired. Sign in again to load the schedule.';
      else if (res.status === 403) message = 'The day schedule is not available for your store.';
    }
    throw new Error(message);
  }
  return (await res.json()) as DayAppointmentScheduleResponse;
}
