export const PROMISE_TIME_MIN = '07:30';
export const PROMISE_TIME_MAX = '17:00';
export const PROMISE_BUSINESS_HOURS_LABEL = '7:30 AM – 5:00 PM';

const PROMISE_OPEN_MINUTES = 7 * 60 + 30;
const PROMISE_CLOSE_MINUTES = 17 * 60;

export type PromiseUrgency = 'ok' | 'soon' | 'urgent' | 'overdue';

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function isPromiseTimeWithinBusinessHours(isoOrDate: string | Date): boolean {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return false;
  const minutes = minutesOfDay(date);
  return minutes >= PROMISE_OPEN_MINUTES && minutes <= PROMISE_CLOSE_MINUTES;
}

export function splitPromiseTimeLocal(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [date, time] = value.split('T');
  return { date: date || '', time: (time || '').slice(0, 5) };
}

export function splitPromiseTimeIso(iso: string | undefined): { date: string; time: string } {
  return splitPromiseTimeLocal(localInputFromPromiseTimeIso(iso));
}

export function combinePromiseDateAndTime(date: string, time: string): string | undefined {
  if (!date.trim() || !time.trim()) return undefined;
  const iso = promiseTimeIsoFromLocalInput(`${date}T${time}`);
  if (!iso || !isPromiseTimeWithinBusinessHours(iso)) return undefined;
  return iso;
}

export function validatePromiseDateAndTime(
  date: string,
  time: string
): { valid: boolean; error?: string } {
  if (!date.trim() && !time.trim()) return { valid: true };
  if (!date.trim() || !time.trim()) {
    return { valid: false, error: 'Enter both promise date and time.' };
  }
  if (!combinePromiseDateAndTime(date, time)) {
    return {
      valid: false,
      error: `Promise time must be between ${PROMISE_BUSINESS_HOURS_LABEL}.`,
    };
  }
  return { valid: true };
}

export interface PromiseTimeState {
  urgency: PromiseUrgency;
  countdownLabel: string;
  scheduledLabel: string;
  msRemaining: number;
}

function formatDuration(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function promiseTimeIsoFromLocalInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function localInputFromPromiseTimeIso(iso: string | undefined): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function getPromiseTimeState(
  iso: string | undefined,
  nowMs: number = Date.now()
): PromiseTimeState | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;

  const msRemaining = target.getTime() - nowMs;
  const scheduledLabel = target.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (msRemaining <= 0) {
    return {
      urgency: 'overdue',
      countdownLabel: `Overdue ${formatDuration(Math.abs(msRemaining))}`,
      scheduledLabel,
      msRemaining,
    };
  }

  const minutesRemaining = msRemaining / 60_000;
  let urgency: PromiseUrgency = 'ok';
  if (minutesRemaining <= 15) urgency = 'urgent';
  else if (minutesRemaining <= 60) urgency = 'soon';

  return {
    urgency,
    countdownLabel: `${formatDuration(msRemaining)} left`,
    scheduledLabel,
    msRemaining,
  };
}

export const PROMISE_URGENCY_STYLES: Record<
  PromiseUrgency,
  { bg: string; text: string; border: string }
> = {
  ok: { bg: 'bg-emerald-950/50', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  soon: { bg: 'bg-amber-950/50', text: 'text-amber-300', border: 'border-amber-500/35' },
  urgent: { bg: 'bg-orange-950/60', text: 'text-orange-300', border: 'border-orange-500/40' },
  overdue: { bg: 'bg-rose-950/60', text: 'text-rose-300', border: 'border-rose-500/45' },
};

export function promiseTimeMinutesFromNow(minutes: number): string {
  const target = new Date(Date.now() + minutes * 60_000);
  const dayMinutes = minutesOfDay(target);

  if (dayMinutes < PROMISE_OPEN_MINUTES) {
    target.setHours(7, 30, 0, 0);
  } else if (dayMinutes > PROMISE_CLOSE_MINUTES) {
    target.setHours(17, 0, 0, 0);
  }

  return target.toISOString();
}
