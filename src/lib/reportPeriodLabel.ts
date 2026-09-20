/**
 * One short line describing which period a card is showing and when it last synced.
 *
 * The cards used to print this as two full sentences — "Active period: 2026-09-01 –
 * 2026-09-19 · PBS synced 9/19/2026, 6:00:34 AM" — which wraps to three lines on a
 * phone before you reach a single number. Same facts, one line.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parseDay = (value: string): Date | null => {
  const d = new Date(value + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Sep 1–19" within a month, "Aug 28 – Sep 3" across one. */
export function formatPeriodRange(startStr?: string | null, endStr?: string | null): string {
  if (!startStr || !endStr) return '';
  const start = parseDay(startStr);
  const end = parseDay(endStr);
  if (!start || !end) return `${startStr} – ${endStr}`;

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const left = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  return sameMonth ? `${left}–${end.getDate()}` : `${left} – ${MONTHS[end.getMonth()]} ${end.getDate()}`;
}

/** "synced 6:00 AM" today, "synced Sep 18" once it is older than today. */
export function formatSyncedAt(syncedAt?: string | number | Date | null): string {
  if (!syncedAt) return '';
  const when = new Date(syncedAt);
  if (Number.isNaN(when.getTime())) return '';

  const now = new Date();
  const sameDay =
    when.getDate() === now.getDate() &&
    when.getMonth() === now.getMonth() &&
    when.getFullYear() === now.getFullYear();

  return sameDay
    ? `synced ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : `synced ${MONTHS[when.getMonth()]} ${when.getDate()}`;
}

/** The two joined, skipping whichever half is missing. */
export function formatReportPeriod(
  startStr?: string | null,
  endStr?: string | null,
  syncedAt?: string | number | Date | null
): string {
  return [formatPeriodRange(startStr, endStr), formatSyncedAt(syncedAt)].filter(Boolean).join(' · ');
}
