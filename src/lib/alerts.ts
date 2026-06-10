import { Customer } from "../types";
import {
  computeServiceReminderDueDate,
  formatReminderDate,
  getCustomerServiceReminderDueDate,
  getLastServiceDate,
  isReminderDue,
  SERVICE_REMINDER_MONTHS,
} from "./serviceReminder";

export { getLastServiceDate };
import { DEFAULT_SERVICE_ALERT_INTERVAL_DAYS } from "./dealershipSettingsUtils";

const REMINDER_INTERVAL_DAYS = DEFAULT_SERVICE_ALERT_INTERVAL_DAYS;

export function getAverageServiceIntervalDays(
  _customer: Customer,
  _fallbackIntervalDays: number = REMINDER_INTERVAL_DAYS
): number {
  return REMINDER_INTERVAL_DAYS;
}

export function getAverageServiceIntervalMonths(
  _customer: Customer,
  _fallbackIntervalDays: number = REMINDER_INTERVAL_DAYS
): number {
  return SERVICE_REMINDER_MONTHS;
}

export function calculateServiceCycle(
  soldDateStr: string,
  intervalDays: number = REMINDER_INTERVAL_DAYS
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
  _intervalDays: number = REMINDER_INTERVAL_DAYS,
  _bufferDays: number = 0
): string {
  if (!customerOrSoldDate) return 'N/A';

  if (typeof customerOrSoldDate === 'string') {
    return formatReminderDate(computeServiceReminderDueDate(customerOrSoldDate));
  }

  const dueStr = getCustomerServiceReminderDueDate(customerOrSoldDate);
  return dueStr ? formatReminderDate(dueStr) : 'N/A';
}

export function isServiceAlertActive(
  customer: Customer,
  _intervalDays: number = REMINDER_INTERVAL_DAYS,
  _bufferDays: number = 0
): boolean {
  if (!customer.enableServiceAlert) return false;
  if (customer.stopAlertInfo) return false;
  return isReminderDue(customer);
}
