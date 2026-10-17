/**
 * When the scheduled PBS pull runs: 6:00 AM and 4:45 PM Pacific, every day.
 *
 * The scheduler wakes every five minutes and asks one question: has a pull
 * finished since the most recent of those two times? If not, it pulls. That is
 * the whole rule, and it replaces two older ones that failed quietly:
 *
 *   - "pull during the 6 AM hour" — a run cut off by the function time limit
 *     left no trace and was never retried, and from Sept 25 every 6 AM run was
 *     cut off; and
 *   - "catch up after 25 hours" — which is what kept data arriving at all, at
 *     11 PM, 1 AM, 4 AM, 7 AM... drifting later every day.
 *
 * A pull that does not finish is simply still due five minutes later.
 *
 * Deliberately free of imports so the tests can bundle it on its own.
 */

export const PBS_SYNC_TIME_ZONE = 'America/Los_Angeles';

/** Pacific wall-clock times, in order through the day. */
export const PBS_SYNC_SLOTS: ReadonlyArray<{ hour: number; minute: number }> = [
  { hour: 6, minute: 0 },
  { hour: 16, minute: 45 },
];

/** For anything a person reads. */
export const PBS_SYNC_SCHEDULE_LABEL = 'Daily at 6:00 AM and 4:45 PM Pacific';

/** The overnight past-month backfill runs once, in the first five minutes of this Pacific hour. */
export const PBS_BACKFILL_HOUR = 2;

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

/** The Pacific wall clock at an instant. */
export function pacificWallClock(at: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PBS_SYNC_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** The instant a Pacific wall-clock time happens, daylight saving included. */
export function pacificWallToInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  // Start from standard time and correct by however far the wall clock is off;
  // twice is enough to settle across a daylight-saving change.
  let guess = target + 8 * 3_600_000;
  for (let i = 0; i < 2; i++) {
    const w = pacificWallClock(new Date(guess));
    guess += target - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  }
  return new Date(guess);
}

/** The most recent pull time at or before `now`. */
export function latestSyncSlot(now: Date): Date {
  const w = pacificWallClock(now);
  const nowMinutes = w.hour * 60 + w.minute;
  const todays = [...PBS_SYNC_SLOTS].reverse().find((s) => s.hour * 60 + s.minute <= nowMinutes);
  if (todays) return pacificWallToInstant(w.year, w.month, w.day, todays.hour, todays.minute);

  // Before the first pull of the day: the last one was yesterday.
  const yesterday = new Date(Date.UTC(w.year, w.month - 1, w.day) - 86_400_000);
  const last = PBS_SYNC_SLOTS[PBS_SYNC_SLOTS.length - 1];
  return pacificWallToInstant(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth() + 1,
    yesterday.getUTCDate(),
    last.hour,
    last.minute
  );
}

/** The next pull time after `now`. */
export function nextSyncSlot(now: Date): Date {
  const w = pacificWallClock(now);
  const nowMinutes = w.hour * 60 + w.minute;
  const todays = PBS_SYNC_SLOTS.find((s) => s.hour * 60 + s.minute > nowMinutes);
  if (todays) return pacificWallToInstant(w.year, w.month, w.day, todays.hour, todays.minute);
  const tomorrow = new Date(Date.UTC(w.year, w.month - 1, w.day) + 86_400_000);
  const first = PBS_SYNC_SLOTS[0];
  return pacificWallToInstant(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    first.hour,
    first.minute
  );
}

/** Due when no pull has finished since the most recent pull time. */
export function isPbsSyncDue(lastSuccessfulSyncAt: string | null | undefined, now: Date): boolean {
  if (!lastSuccessfulSyncAt) return true;
  const last = new Date(lastSuccessfulSyncAt).getTime();
  if (Number.isNaN(last)) return true;
  return last < latestSyncSlot(now).getTime();
}

/** Within `minutes` after a pull time — for callers that only ask "is it pull time?". */
export function isWithinSyncSlot(now: Date, minutes = 15): boolean {
  return now.getTime() - latestSyncSlot(now).getTime() < minutes * 60_000;
}

/** The one wake-up a night that runs the past-month backfill. */
export function isBackfillWindow(now: Date): boolean {
  const w = pacificWallClock(now);
  return w.hour === PBS_BACKFILL_HOUR && w.minute < 5;
}
