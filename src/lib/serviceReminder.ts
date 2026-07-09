import type { Customer } from '../types';

export const SERVICE_REMINDER_MONTHS = 6;

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
  const d =
    typeof from === 'string'
      ? new Date(from.includes('T') ? from : `${from.trim()}T00:00:00`)
      : new Date(from);

  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + SERVICE_REMINDER_MONTHS);
    return fallback.toISOString().slice(0, 10);
  }

  d.setMonth(d.getMonth() + SERVICE_REMINDER_MONTHS);
  return d.toISOString().slice(0, 10);
}

export function parseReminderDate(dateStr: string): Date | null {
  const d = new Date(`${dateStr.trim()}T00:00:00`);
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

export function getCustomerServiceReminderDueDate(customer: Customer): string | null {
  if (customer.serviceReminderDueDate?.trim()) {
    return customer.serviceReminderDueDate.trim();
  }

  // Legacy manual override field
  if (customer.serviceAlertOverrideDate?.trim()) {
    return customer.serviceAlertOverrideDate.trim();
  }

  const lastService = getLastServiceDate(customer);
  if (lastService) return computeServiceReminderDueDate(lastService);
  if (customer.soldDate?.trim()) return computeServiceReminderDueDate(customer.soldDate);
  if (customer.createdAt?.toDate) return computeServiceReminderDueDate(customer.createdAt.toDate());
  return null;
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
