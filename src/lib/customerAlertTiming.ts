import type { Customer } from '../types';
import {
  clampServiceAlertBufferDays,
  clampServiceAlertIntervalDays,
  DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
} from './dealershipSettingsUtils';

export interface ResolvedCustomerAlertTiming {
  intervalDays: number;
  bufferDays: number;
  usesCustomInterval: boolean;
  usesCustomBuffer: boolean;
  overrideDate?: string;
}

/** Reads manual override date (supports legacy holdUntil field). */
export function getCustomerServiceAlertOverrideDate(customer: Customer): string | undefined {
  const raw = customer.serviceAlertOverrideDate?.trim() || customer.serviceAlertHoldUntil?.trim();
  return raw || undefined;
}

export function parseServiceAlertOverrideDate(dateStr: string): Date | null {
  const d = new Date(`${dateStr.trim()}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveCustomerAlertTiming(
  customer: Customer,
  dealershipIntervalDays: number = DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
  dealershipBufferDays: number = DEFAULT_SERVICE_ALERT_BUFFER_DAYS
): ResolvedCustomerAlertTiming {
  const usesCustomInterval =
    typeof customer.serviceAlertIntervalDays === 'number' &&
    !Number.isNaN(customer.serviceAlertIntervalDays);
  const usesCustomBuffer =
    typeof customer.serviceAlertBufferDays === 'number' &&
    !Number.isNaN(customer.serviceAlertBufferDays);

  return {
    intervalDays: usesCustomInterval
      ? clampServiceAlertIntervalDays(customer.serviceAlertIntervalDays!)
      : dealershipIntervalDays,
    bufferDays: usesCustomBuffer
      ? clampServiceAlertBufferDays(customer.serviceAlertBufferDays!)
      : dealershipBufferDays,
    usesCustomInterval,
    usesCustomBuffer,
    overrideDate: getCustomerServiceAlertOverrideDate(customer),
  };
}

/** True when a manual override date is set and today is still before that date. */
export function isServiceAlertOverridePending(
  customer: Customer,
  now: Date = new Date()
): boolean {
  const overrideDateStr = getCustomerServiceAlertOverrideDate(customer);
  if (!overrideDateStr) return false;
  const overrideStart = parseServiceAlertOverrideDate(overrideDateStr);
  if (!overrideStart) return false;
  return now.getTime() < overrideStart.getTime();
}

export function formatServiceAlertOverrideDate(dateStr: string): string {
  const d = parseServiceAlertOverrideDate(dateStr);
  if (!d) return 'N/A';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function normalizeCustomerAlertPatch(patch: {
  serviceAlertIntervalDays?: number | '' | null;
  serviceAlertBufferDays?: number | '' | null;
  serviceAlertOverrideDate?: string | null;
  serviceAlertHoldUntil?: string | null;
}): Partial<Customer> {
  const next: Partial<Customer> = {};

  if (patch.serviceAlertIntervalDays === '' || patch.serviceAlertIntervalDays == null) {
    next.serviceAlertIntervalDays = undefined;
  } else if (typeof patch.serviceAlertIntervalDays === 'number') {
    next.serviceAlertIntervalDays = clampServiceAlertIntervalDays(patch.serviceAlertIntervalDays);
  }

  if (patch.serviceAlertBufferDays === '' || patch.serviceAlertBufferDays == null) {
    next.serviceAlertBufferDays = undefined;
  } else if (typeof patch.serviceAlertBufferDays === 'number') {
    next.serviceAlertBufferDays = clampServiceAlertBufferDays(patch.serviceAlertBufferDays);
  }

  const override =
    patch.serviceAlertOverrideDate?.trim() || patch.serviceAlertHoldUntil?.trim() || '';
  next.serviceAlertOverrideDate = override || undefined;
  next.serviceAlertHoldUntil = undefined;

  return next;
}
