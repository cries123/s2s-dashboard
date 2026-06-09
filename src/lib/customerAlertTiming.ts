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
  holdUntil?: string;
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
    holdUntil: customer.serviceAlertHoldUntil?.trim() || undefined,
  };
}

export function isServiceAlertOnHold(customer: Customer, now: Date = new Date()): boolean {
  const holdUntil = customer.serviceAlertHoldUntil?.trim();
  if (!holdUntil) return false;
  const holdEnd = new Date(`${holdUntil}T23:59:59`);
  if (Number.isNaN(holdEnd.getTime())) return false;
  return now.getTime() < holdEnd.getTime();
}

export function normalizeCustomerAlertPatch(patch: {
  serviceAlertIntervalDays?: number | '' | null;
  serviceAlertBufferDays?: number | '' | null;
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

  const hold = patch.serviceAlertHoldUntil?.trim();
  next.serviceAlertHoldUntil = hold || undefined;

  return next;
}
