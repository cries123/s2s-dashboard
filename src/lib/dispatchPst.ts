/** Shop dispatch calendar runs on Pacific Time. */
export const DISPATCH_TIMEZONE = 'America/Los_Angeles';

/** Minutes after midnight PST when the overnight sweep window closes. */
export const DISPATCH_OVERNIGHT_SWEEP_WINDOW_MINUTES = 30;

export function getDispatchDatePst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPATCH_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function getDispatchClockPst(now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPATCH_TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

/** True only during the first 30 minutes after midnight PST. */
export function isDispatchOvernightSweepWindow(now = new Date()): boolean {
  const { hour, minute } = getDispatchClockPst(now);
  return hour === 0 && minute < DISPATCH_OVERNIGHT_SWEEP_WINDOW_MINUTES;
}
