import { Customer } from '../types';
import { WorkQueueItem, ServiceDriveReason, ServiceDrivePriority, QueuePriorityProfile } from '../types';
import { getCustomerAlertDueDate, isServiceAlertActive, resolveServiceAlertConfig, type ServiceAlertConfig } from './alerts';
import { parseReminderDate } from './serviceReminder';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DEFAULT_STALE_CONTACT_DAYS = 3;

export interface BuildQueueOptions {
  followUpDays?: number;
  queuePriority?: QueuePriorityProfile;
  serviceAlertConfig?: ServiceAlertConfig;
}

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

export function getServiceDaysOverdue(
  customer: Customer,
  config = resolveServiceAlertConfig()
): number {
  if (!isServiceAlertActive(customer, config)) return 0;
  const dueStr = getCustomerAlertDueDate(customer, config);
  if (!dueStr) return 0;
  const dueDate = parseReminderDate(dueStr);
  if (!dueDate) return 0;
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
  followUpDays: number = DEFAULT_STALE_CONTACT_DAYS,
  serviceAlertConfig: ServiceAlertConfig = resolveServiceAlertConfig()
): WorkQueueItem | null {
  const reasons: ServiceDriveReason[] = [];
  let score = 0;

  const serviceDue = isServiceAlertActive(customer, serviceAlertConfig);
  const daysOverdue = getServiceDaysOverdue(customer, serviceAlertConfig);
  const lastContact = timestampToDate(customer.lastServiceContact);
  const daysSinceContact = daysSince(lastContact);

  if (serviceDue) {
    reasons.push('service_due');
    score += 50 + Math.min(daysOverdue * 3, 45);
  }

  const needsFollowUp =
    serviceDue &&
    (daysSinceContact === null || daysSinceContact >= followUpDays);

  if (needsFollowUp) {
    reasons.push('stale_followup');
    score += 25 + Math.min((daysSinceContact ?? followUpDays) * 2, 20);
  }

  if (reasons.length === 0) return null;

  return {
    customer,
    score,
    reasons,
    daysOverdue,
    daysSinceContact,
    priority: scoreToPriority(score),
  };
}

function sortQueue(items: WorkQueueItem[], profile: QueuePriorityProfile): WorkQueueItem[] {
  const sorted = [...items];

  switch (profile) {
    case 'overdue_first':
      return sorted.sort((a, b) => {
        if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
        return b.score - a.score;
      });
    case 'never_contacted_first':
      return sorted.sort((a, b) => {
        const aNever = a.daysSinceContact === null ? 1 : 0;
        const bNever = b.daysSinceContact === null ? 1 : 0;
        if (bNever !== aNever) return bNever - aNever;
        if (a.daysSinceContact === null && b.daysSinceContact === null) {
          return b.score - a.score;
        }
        return (b.daysSinceContact ?? 0) - (a.daysSinceContact ?? 0) || b.score - a.score;
      });
    default:
      return sorted.sort((a, b) => b.score - a.score);
  }
}

export function buildWorkQueue(customers: Customer[], options?: BuildQueueOptions): WorkQueueItem[] {
  const followUpDays = options?.followUpDays ?? DEFAULT_STALE_CONTACT_DAYS;
  const queuePriority = options?.queuePriority ?? 'balanced';
  const serviceAlertConfig = options?.serviceAlertConfig ?? resolveServiceAlertConfig();
  const items: WorkQueueItem[] = [];

  for (const customer of customers) {
    const item = buildWorkQueueItem(customer, followUpDays, serviceAlertConfig);
    if (item) items.push(item);
  }

  return sortQueue(items, queuePriority);
}
