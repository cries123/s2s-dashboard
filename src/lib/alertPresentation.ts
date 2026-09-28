import type { Customer } from '../types';
import { getCustomerAlertDueDate, type ServiceAlertConfig } from './alerts';
import { evaluateSmartAlert, type SmartAlertStatus } from './serviceAlertWindow';
import { parseReminderDate } from './serviceReminder';

export type AlertTone = 'info' | 'warning' | 'danger' | 'muted';

export interface AlertPresentation {
  /** Short, human label for the badge — "Due in 6 days", "12 days overdue". */
  label: string;
  tone: AlertTone;
  /** YYYY-MM-DD when known. */
  dueIso?: string;
  /** Negative = upcoming, 0 = today, positive = past due. */
  daysPastDue?: number;
  /** Longer sentence for tooltips / detail rows. */
  reason: string;
  status: SmartAlertStatus | 'due';
}

function startOfDay(d: Date): Date {
  const c = new Date(d.getTime());
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Overdue by more than this many days shows red; up to it, amber. */
export const OVERDUE_DANGER_DAYS = 30;

function labelFor(daysPastDue: number): { label: string; tone: AlertTone } {
  if (daysPastDue < 0) {
    const n = Math.abs(daysPastDue);
    return { label: n === 1 ? 'Due tomorrow' : `Due in ${n} days`, tone: 'info' };
  }
  if (daysPastDue === 0) return { label: 'Due today', tone: 'warning' };
  // Graded, so red means something: every overdue row used to be red, which made a
  // customer 3 days late look the same as one 4 months late.
  const label = daysPastDue === 1 ? '1 day overdue' : `${daysPastDue} days overdue`;
  return { label, tone: daysPastDue > OVERDUE_DANGER_DAYS ? 'danger' : 'warning' };
}

/**
 * One description of a customer's alert state that works in every alert mode, so
 * the call list can show a real reason instead of the same badge on every row.
 */
export function describeCustomerAlert(
  customer: Customer,
  config: ServiceAlertConfig,
  now: Date = new Date()
): AlertPresentation {
  if (config.mode === 'smart') {
    const r = evaluateSmartAlert(customer, config.smart, now);
    if (r.daysPastDue !== undefined && r.shouldAlert) {
      const { label, tone } = labelFor(r.daysPastDue);
      return { label, tone, dueIso: r.dueDateIso, daysPastDue: r.daysPastDue, reason: r.reason, status: r.status };
    }
    return {
      label:
        r.status === 'inactive' ? 'Inactive'
        : r.status === 'missed' ? 'Missed window'
        : r.status === 'not-due' ? 'Not due yet'
        : r.status === 'suppressed' ? 'Alerts off'
        : 'Needs history',
      tone: 'muted',
      dueIso: r.dueDateIso,
      daysPastDue: r.daysPastDue,
      reason: r.reason,
      status: r.status,
    };
  }

  const dueIso = getCustomerAlertDueDate(customer, config);
  const due = dueIso ? parseReminderDate(dueIso) : null;
  if (!due) {
    return { label: 'No due date', tone: 'muted', reason: 'No reminder date could be computed.', status: 'insufficient-history' };
  }
  const daysPastDue = Math.round((startOfDay(now).getTime() - startOfDay(due).getTime()) / 86_400_000);
  const { label, tone } = labelFor(daysPastDue);
  return {
    label,
    tone,
    dueIso: dueIso || undefined,
    daysPastDue,
    reason: config.mode === 'standard'
      ? 'Six months after delivery or last outreach.'
      : 'Based on this customer\'s oil-change interval.',
    status: 'due',
  };
}

export function formatDueDate(iso?: string): string {
  if (!iso) return '—';
  const d = parseReminderDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
