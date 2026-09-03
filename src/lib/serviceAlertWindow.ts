import type { Customer, ServiceVisit } from '../types';
import { analyzeOilChangeInterval, visitIsOilChange } from './serviceIntervalAnalytics';

export { visitIsOilChange };

/**
 * "Smart" service alerts.
 *
 * The original rule fired once a customer was PAST due and then kept firing forever,
 * so a customer whose last visit was in 2022 sat in the queue indefinitely while
 * someone due next week did not appear at all.
 *
 * This module answers a narrower, more useful question: *who is coming up for
 * service soon, and is still a real customer?*
 *
 *   1. They must be ACTIVE — seen within `activeWithinDays` (default 12 months).
 *   2. Their next-due date is predicted from their OWN visit cadence.
 *   3. They surface in a window around that date: from `leadTimeDays` before it
 *      until `staleAfterDays` after it. Outside that window they drop off.
 */

export const DEFAULT_ACTIVE_WITHIN_DAYS = 365;
export const DEFAULT_LEAD_TIME_DAYS = 21;
export const DEFAULT_STALE_AFTER_DAYS = 60;

export interface SmartAlertConfig {
  /** Customer must have visited within this many days to be considered active. */
  activeWithinDays: number;
  /** Start showing the alert this many days before the predicted due date. */
  leadTimeDays: number;
  /** Stop showing it once it is this many days past due (they did not come in). */
  staleAfterDays: number;
}

export const DEFAULT_SMART_ALERT_CONFIG: SmartAlertConfig = {
  activeWithinDays: DEFAULT_ACTIVE_WITHIN_DAYS,
  leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
  staleAfterDays: DEFAULT_STALE_AFTER_DAYS,
};

export type SmartAlertStatus =
  | 'due-soon'
  | 'due-now'
  | 'overdue'
  | 'not-due'
  | 'inactive'
  | 'missed'
  | 'insufficient-history'
  | 'suppressed';

export interface SmartAlertResult {
  status: SmartAlertStatus;
  /** True only for the statuses that belong in the advisor's call queue. */
  shouldAlert: boolean;
  /** Predicted next service date, YYYY-MM-DD. */
  dueDateIso?: string;
  /** Negative = still upcoming, positive = past due. */
  daysPastDue?: number;
  daysSinceLastVisit?: number;
  /** The customer's own cadence in days, when we could measure it. */
  cadenceDays?: number;
  /** Plain-English explanation, safe to show in the UI. */
  reason: string;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** Most recent visit date of any kind, used for the "is this a live customer" test. */
export function getLastVisitDate(customer: Customer): Date | null {
  let latest: Date | null = null;
  for (const visit of customer.recentVisits || []) {
    const d = parseIsoDate(visit.date);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

export function evaluateSmartAlert(
  customer: Customer,
  config: SmartAlertConfig = DEFAULT_SMART_ALERT_CONFIG,
  now: Date = new Date()
): SmartAlertResult {
  const today = startOfDay(now);

  if (!customer.enableServiceAlert || customer.stopAlertInfo) {
    return { status: 'suppressed', shouldAlert: false, reason: 'Alerts are turned off for this customer.' };
  }

  const lastVisit = getLastVisitDate(customer);
  if (!lastVisit) {
    return {
      status: 'insufficient-history',
      shouldAlert: false,
      reason: 'No service history on file yet.',
    };
  }

  const daysSinceLastVisit = daysBetween(lastVisit, today);

  // Rule 1 — they have to still be a customer. This is what keeps 2022/2023
  // one-time visitors out of the queue.
  if (daysSinceLastVisit > config.activeWithinDays) {
    const years = (daysSinceLastVisit / 365).toFixed(1);
    return {
      status: 'inactive',
      shouldAlert: false,
      daysSinceLastVisit,
      reason: `Last visit was ${years} years ago — outside the ${Math.round(config.activeWithinDays / 30.4375)}-month active window.`,
    };
  }

  // Rule 2 — predict from their own cadence where we can. A manual override always wins.
  const override = parseIsoDate(customer.serviceAlertOverrideDate);
  const analysis = analyzeOilChangeInterval(customer);

  let dueDate: Date | null = override;
  let cadenceDays: number | undefined;

  if (!dueDate) {
    if (analysis.hasData && analysis.nextDueDateIso) {
      dueDate = parseIsoDate(analysis.nextDueDateIso);
      cadenceDays = analysis.avgDays;
    } else if (customer.serviceAlertIntervalDays && customer.serviceAlertIntervalDays > 0) {
      // Only one visit on file: fall back to the per-customer interval.
      dueDate = new Date(lastVisit.getTime());
      dueDate.setDate(dueDate.getDate() + customer.serviceAlertIntervalDays);
      cadenceDays = customer.serviceAlertIntervalDays;
    }
  }

  if (!dueDate) {
    return {
      status: 'insufficient-history',
      shouldAlert: false,
      daysSinceLastVisit,
      reason:
        analysis.count === 1
          ? 'Only one oil change on file — need two to learn their pattern.'
          : 'Not enough oil-change history to predict a due date.',
    };
  }

  const daysPastDue = daysBetween(dueDate, today);

  // Rule 3 — the window. Before it, they are not due yet. After it, they did not
  // come in and are no longer a timely call.
  if (daysPastDue < -config.leadTimeDays) {
    return {
      status: 'not-due',
      shouldAlert: false,
      dueDateIso: toIso(dueDate),
      daysPastDue,
      daysSinceLastVisit,
      cadenceDays,
      reason: `Not due for another ${Math.abs(daysPastDue)} days.`,
    };
  }

  if (daysPastDue > config.staleAfterDays) {
    return {
      status: 'missed',
      shouldAlert: false,
      dueDateIso: toIso(dueDate),
      daysPastDue,
      daysSinceLastVisit,
      cadenceDays,
      reason: `Was due ${daysPastDue} days ago and did not come in — past the ${config.staleAfterDays}-day follow-up window.`,
    };
  }

  const cadenceLabel = cadenceDays
    ? ` They come in about every ${(cadenceDays / 30.4375).toFixed(1)} months.`
    : '';

  if (daysPastDue < 0) {
    return {
      status: 'due-soon',
      shouldAlert: true,
      dueDateIso: toIso(dueDate),
      daysPastDue,
      daysSinceLastVisit,
      cadenceDays,
      reason: `Due in ${Math.abs(daysPastDue)} days.${cadenceLabel}`,
    };
  }

  if (daysPastDue === 0) {
    return {
      status: 'due-now',
      shouldAlert: true,
      dueDateIso: toIso(dueDate),
      daysPastDue,
      daysSinceLastVisit,
      cadenceDays,
      reason: `Due today.${cadenceLabel}`,
    };
  }

  return {
    status: 'overdue',
    shouldAlert: true,
    dueDateIso: toIso(dueDate),
    daysPastDue,
    daysSinceLastVisit,
    cadenceDays,
    reason: `${daysPastDue} days past due.${cadenceLabel}`,
  };
}

/** Sort helper: soonest-due first, so the call list is in the order to work it. */
export function compareSmartAlertUrgency(a: SmartAlertResult, b: SmartAlertResult): number {
  const av = a.daysPastDue ?? Number.NEGATIVE_INFINITY;
  const bv = b.daysPastDue ?? Number.NEGATIVE_INFINITY;
  return bv - av;
}
