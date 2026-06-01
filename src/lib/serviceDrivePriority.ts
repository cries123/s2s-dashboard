import { Customer } from '../types';
import { WorkQueueItem, ServiceDriveReason, ServiceDrivePriority } from '../types';
import { isServiceAlertActive, getLastServiceDate, getAverageServiceIntervalDays } from './alerts';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const STALE_CONTACT_DAYS = 3;

export function timestampToDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    if (value instanceof Date) return value;
    const d = new Date(value as string | number);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
}

export function getServiceDaysOverdue(customer: Customer): number {
  if (!isServiceAlertActive(customer)) return 0;
  const lastDate = getLastServiceDate(customer);
  if (!lastDate) return 0;
  const avgDays = getAverageServiceIntervalDays(customer);
  const dueDate = new Date(lastDate.getTime() + avgDays * MS_PER_DAY);
  const overdue = Math.floor((Date.now() - dueDate.getTime()) / MS_PER_DAY);
  return Math.max(0, overdue);
}

function scoreToPriority(score: number): ServiceDrivePriority {
  if (score >= 100) return 'urgent';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'normal';
}

export function buildWorkQueueItem(
  customer: Customer,
  recallCount: number
): WorkQueueItem | null {
  const reasons: ServiceDriveReason[] = [];
  let score = 0;

  const serviceDue = isServiceAlertActive(customer);
  const daysOverdue = getServiceDaysOverdue(customer);
  const lastContact = timestampToDate(customer.lastServiceContact);
  const daysSinceContact = daysSince(lastContact);

  if (serviceDue) {
    reasons.push('service_due');
    score += 50 + Math.min(daysOverdue * 3, 45);
  }

  if (recallCount > 0) {
    reasons.push('open_recall');
    score += 35 + Math.min(recallCount * 12, 36);
  }

  const needsFollowUp =
    serviceDue &&
    (daysSinceContact === null || daysSinceContact >= STALE_CONTACT_DAYS);

  if (needsFollowUp) {
    reasons.push('stale_followup');
    score += 25 + Math.min((daysSinceContact ?? STALE_CONTACT_DAYS) * 2, 20);
  }

  if (reasons.length === 0) return null;

  return {
    customer,
    score,
    reasons,
    recallCount,
    daysOverdue,
    daysSinceContact,
    priority: scoreToPriority(score),
  };
}

export function buildWorkQueue(
  customers: Customer[],
  recallCountByCustomerId: Record<string, number>
): WorkQueueItem[] {
  const items: WorkQueueItem[] = [];

  for (const customer of customers) {
    const recallCount = recallCountByCustomerId[customer.id] || 0;
    const item = buildWorkQueueItem(customer, recallCount);
    if (item) items.push(item);
  }

  return items.sort((a, b) => b.score - a.score);
}
