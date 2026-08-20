import type { Customer } from '../types';

export const SERVICE_REMINDER_MONTHS = 6;

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). */
export function formatLocalDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseAnchorDate(from: string | Date): Date | null {
  const d =
    typeof from === 'string'
      ? new Date(from.includes('T') ? from : `${from.trim()}T00:00:00`)
      : new Date(from);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getLastServiceDate(customer: Customer): Date | null {
  const visits = customer.recentVisits || [];
  if (visits.length === 0) {
    if (customer.soldDate) {
      const sd = new Date(customer.soldDate + 'T00:00:00');
      return isNaN(sd.getTime()) ? null : sd;
    }
    return null;
  }

  const sorted = [...visits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const d = new Date(sorted[0].date + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
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
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
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
