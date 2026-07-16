import { Customer, ServiceAlertMode } from '../types';
import {
  computeServiceReminderDueDate,
  formatReminderDate,
  getStandardServiceReminderDueDate,
  getLastServiceDate,
  isReminderDue,
  parseReminderDate,
  SERVICE_REMINDER_MONTHS,
} from './serviceReminder';
import { analyzeOilChangeInterval } from './serviceIntervalAnalytics';
import {
  DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
  DEFAULT_SERVICE_ALERT_MODE,
  resolveServiceAlertMode,
} from './dealershipSettingsUtils';
import type { DealershipSettings } from '../types';

export { getLastServiceDate };

export interface ServiceAlertConfig {
  mode: ServiceAlertMode;
  intervalDays: number;
  bufferDays: number;
}

export function resolveServiceAlertConfig(
  settings?: Partial<DealershipSettings> | null
): ServiceAlertConfig {
  return {
    mode: resolveServiceAlertMode(settings),
    intervalDays: settings?.serviceAlertIntervalDays ?? DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
    bufferDays: settings?.serviceAlertBufferDays ?? DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  };
}

function isDueWithBuffer(dueStr: string, bufferDays: number, now: Date = new Date()): boolean {
  const due = parseReminderDate(dueStr);
  if (!due) return false;

  const threshold = new Date(due);
  threshold.setDate(threshold.getDate() + bufferDays);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  threshold.setHours(0, 0, 0, 0);
  return today.getTime() >= threshold.getTime();
}

export function getOptimizedServiceReminderDueDate(customer: Customer): string | null {
  if (customer.lastServiceContact && customer.serviceReminderDueDate?.trim()) {
    return customer.serviceReminderDueDate.trim();
  }

  if (customer.serviceAlertOverrideDate?.trim()) {
    return customer.serviceAlertOverrideDate.trim();
  }

  const analysis = analyzeOilChangeInterval(customer);
  if (analysis.hasData && analysis.nextDueDateIso) {
    return analysis.nextDueDateIso;
  }

  return getStandardServiceReminderDueDate(customer);
}

export function getCustomerAlertDueDate(
  customer: Customer,
  config: ServiceAlertConfig = resolveServiceAlertConfig()
): string | null {
  if (config.mode === 'optimized') {
    return getOptimizedServiceReminderDueDate(customer);
  }
  return getStandardServiceReminderDueDate(customer);
}

export function getAverageServiceIntervalDays(
  customer: Customer,
  config: ServiceAlertConfig = resolveServiceAlertConfig()
): number {
  if (config.mode === 'optimized') {
    const analysis = analyzeOilChangeInterval(customer);
    if (analysis.hasData) return analysis.avgDays;
  }
  return config.intervalDays;
}

export function getAverageServiceIntervalMonths(
  customer: Customer,
  config: ServiceAlertConfig = resolveServiceAlertConfig()
): number {
  if (config.mode === 'standard') return SERVICE_REMINDER_MONTHS;
  const days = getAverageServiceIntervalDays(customer, config);
  return Number((days / 30.4375).toFixed(1));
}

export function calculateServiceCycle(
  soldDateStr: string,
  intervalDays: number = DEFAULT_SERVICE_ALERT_INTERVAL_DAYS
): number {
  if (!soldDateStr) return 0;
  try {
    const soldDate = new Date(soldDateStr + 'T00:00:00');
    if (isNaN(soldDate.getTime())) return 0;

    const now = new Date();
    const diffTime = now.getTime() - soldDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return Math.floor(diffDays / intervalDays);
  } catch {
    return 0;
  }
}

export function getNextServiceMilestone(
  customerOrSoldDate: Customer | string,
  config: ServiceAlertConfig = resolveServiceAlertConfig()
): string {
  if (!customerOrSoldDate) return 'N/A';

  if (typeof customerOrSoldDate === 'string') {
    return formatReminderDate(computeServiceReminderDueDate(customerOrSoldDate));
  }

  const dueStr = getCustomerAlertDueDate(customerOrSoldDate, config);
  return dueStr ? formatReminderDate(dueStr) : 'N/A';
}

export function isServiceAlertActive(
  customer: Customer,
  config: ServiceAlertConfig = resolveServiceAlertConfig()
): boolean {
  if (!customer.enableServiceAlert) return false;
  if (customer.stopAlertInfo) return false;

  if (config.mode === 'standard') {
    const dueStr = getStandardServiceReminderDueDate(customer);
    if (!dueStr) return false;
    return isDueWithBuffer(dueStr, config.bufferDays);
  }

  const dueStr = getOptimizedServiceReminderDueDate(customer);
  if (!dueStr) return false;
  return isDueWithBuffer(dueStr, config.bufferDays);
}

/** Next reminder date after logging contact (YYYY-MM-DD). */
export function computeContactClearDueDate(
  customer: Customer,
  config: ServiceAlertConfig = resolveServiceAlertConfig(),
  from: Date = new Date()
): string {
  if (config.mode === 'standard') {
    return computeServiceReminderDueDate(from);
  }

  const analysis = analyzeOilChangeInterval(customer);
  const intervalDays = analysis.hasData ? analysis.avgDays : config.intervalDays;
  const next = new Date(from);
  next.setDate(next.getDate() + intervalDays);
  return next.toISOString().slice(0, 10);
}

export function getServiceAlertModeLabel(mode: ServiceAlertMode = DEFAULT_SERVICE_ALERT_MODE): string {
  return mode === 'optimized' ? 'Optimized' : 'Standard (6 mo)';
}

export function isStandardServiceAlertMode(
  config: ServiceAlertConfig = resolveServiceAlertConfig()
): boolean {
  return config.mode === 'standard';
}

/** @deprecated Use isServiceAlertActive with ServiceAlertConfig */
export function isReminderDueForCustomer(customer: Customer): boolean {
  return isReminderDue(customer);
}
