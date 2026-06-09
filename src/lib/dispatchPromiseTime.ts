export type PromiseUrgency = 'ok' | 'soon' | 'urgent' | 'overdue';

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
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
