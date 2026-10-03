import type { Customer } from '../types';

export const SERVICE_REMINDER_MONTHS = 6;

/**
 * A year under 100 is a two-digit year that lost its century somewhere upstream
 * — an import that read "6/30/26" as year 26. Nothing in a dealership database
 * predates the car, so the only sane reading is 2026. Left alone, a 2026 F-150
 * delivered in June showed up "730396 days overdue".
 */
export function normalizeCenturyYear(d: Date | null): Date | null {
  if (!d) return null;
  const year = d.getFullYear();
  if (year >= 100) return d;
  const fixed = new Date(d);
  fixed.setFullYear(year + 2000);
  return fixed;
}

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). */
export function formatLocalDateOnly(d: Date): string {
  // Zero-pad the year: a year-26 date used to serialise as "26-12-30", which is
  // not a date any parser here accepts.
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseAnchorDate(from: string | Date): Date | null {
  if (typeof from === 'string') {
    const trimmed = from.trim();
    if (!trimmed) return null;
    // Date-only strings go through the same reader as reminder dates, so a
    // two-digit year is salvaged here too instead of falling back to today.
    if (!trimmed.includes('T')) return parseReminderDate(trimmed);
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : normalizeCenturyYear(parsed);
  }
  const d = new Date(from);
  return Number.isNaN(d.getTime()) ? null : normalizeCenturyYear(d);
}

/** Parse a stored delivery or visit date the way every screen should. */
export function parseCustomerDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return parseAnchorDate(value);
}

export function getLastServiceDate(customer: Customer): Date | null {
  const visits = customer.recentVisits || [];
  if (visits.length === 0) {
    if (customer.soldDate) {
      return parseCustomerDate(customer.soldDate);
    }
    return null;
  }

  const sorted = [...visits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  return parseCustomerDate(sorted[0].date);
}

/** Next service reminder date (YYYY-MM-DD), six months after the anchor date. */
export function computeServiceReminderDueDate(from: string | Date): string {
  const anchor = parseAnchorDate(from);
  if (!anchor) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + SERVICE_REMINDER_MONTHS);
    return formatLocalDateOnly(fallback);
  }

  const due = new Date(anchor);
  due.setMonth(due.getMonth() + SERVICE_REMINDER_MONTHS);
  return formatLocalDateOnly(due);
}

export function parseReminderDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();
  const isoPrefix = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) {
    const d = new Date(`${isoPrefix}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : normalizeCenturyYear(d);
  }
  // "26-12-30" — a year that lost its century on the way out of an import.
  const short = trimmed.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (short) {
    const d = new Date(`20${short[1]}-${short[2]}-${short[3]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : normalizeCenturyYear(d);
}

export function formatReminderDate(dateStr: string): string {
  const d = parseReminderDate(dateStr);
  if (!d) return 'N/A';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function hasContactLogReset(customer: Customer): boolean {
  return Boolean(customer.lastServiceContact);
}

/** Due date from delivery / enrollment only — ignores PBS workplan reminder fields. */
export function getDeliveryBasedServiceReminderDueDate(customer: Customer): string | null {
  if (customer.soldDate?.trim()) return computeServiceReminderDueDate(customer.soldDate);
  if (customer.createdAt?.toDate) return computeServiceReminderDueDate(customer.createdAt.toDate());
  return null;
}

export function getCustomerServiceReminderDueDate(customer: Customer): string | null {
  return getStandardServiceReminderDueDate(customer);
}

/**
 * Standard mode: fixed 6-month cadence from delivery date.
 * PBS workplan `serviceReminderDueDate` is ignored unless an advisor logged contact
 * (which sets `lastServiceContact` and a new due date together).
 */
export function getStandardServiceReminderDueDate(customer: Customer): string | null {
  if (customer.serviceAlertOverrideDate?.trim()) {
    return customer.serviceAlertOverrideDate.trim();
  }

  if (hasContactLogReset(customer) && customer.serviceReminderDueDate?.trim()) {
    return customer.serviceReminderDueDate.trim();
  }

  return getDeliveryBasedServiceReminderDueDate(customer);
}

export function isReminderDue(customer: Customer, now: Date = new Date()): boolean {
  const dueStr = getCustomerServiceReminderDueDate(customer);
  if (!dueStr) return false;
  const due = parseReminderDate(dueStr);
  if (!due) return false;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return today.getTime() >= due.getTime();
}
