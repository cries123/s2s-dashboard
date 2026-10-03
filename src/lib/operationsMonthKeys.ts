/**
 * Month keys shared by the Operations screens and the PBS rebuild on the server.
 *
 * A month is identified everywhere by 'YYYY-MM' — in the Operations dropdown, in
 * the `_archive_YYYY-MM` document suffix, and in the date range handed to PBS.
 * One copy of the arithmetic, because a month key that disagrees by one between
 * the two sides silently reads or writes the wrong month.
 *
 * Deliberately free of imports so the server can use it without pulling any UI
 * code along with it.
 */

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** First and last day of a month, inclusive, in the form PBS expects. */
export function monthKeyRange(monthKey: string): { start: string; end: string } {
  if (!isMonthKey(monthKey)) throw new Error(`Not a month key: ${monthKey}`);
  const [year, month] = monthKey.split('-').map(Number);
  // Day 0 of the next month is the last day of this one, leap years included.
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * The completed months before the one `reference` falls in, newest first.
 *
 * The current month is excluded on purpose. It is still the live sheet, and
 * filing it as an archive would store a part-finished month as if it were done —
 * the mistake that would have put October's numbers under September.
 */
export function pastMonthKeys(reference: Date, count: number): string[] {
  const keys: string[] = [];
  const cursor = new Date(reference.getFullYear(), reference.getMonth(), 1);
  for (let i = 0; i < count; i++) {
    cursor.setMonth(cursor.getMonth() - 1);
    keys.push(monthKeyOf(cursor));
  }
  return keys;
}

/** 'September 2026' for a key, for anything a person reads. */
export function monthKeyLabel(monthKey: string): string {
  if (!isMonthKey(monthKey)) return monthKey;
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
