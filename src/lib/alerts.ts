import { Customer } from "../types";
import {
  DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
} from "./dealershipSettingsUtils";

export function getAverageServiceIntervalDays(
  customer: Customer,
  fallbackIntervalDays: number = DEFAULT_SERVICE_ALERT_INTERVAL_DAYS
): number {
  const visits = customer.recentVisits || [];
  if (visits.length < 2) {
    return fallbackIntervalDays;
  }

  const sorted = [...visits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let totalDays = 0;
  let calculationCount = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].date).getTime();
    const currTime = new Date(sorted[i].date).getTime();
    if (!isNaN(prevTime) && !isNaN(currTime)) {
      const diff = (currTime - prevTime) / (1000 * 60 * 60 * 24);
      if (diff > 0) {
        totalDays += diff;
        calculationCount++;
      }
    }
  }

  const calculated =
    calculationCount > 0 ? totalDays / calculationCount : fallbackIntervalDays;

  // Never alert sooner than the dealership minimum service interval.
  return Math.max(calculated, fallbackIntervalDays);
}

export function getAverageServiceIntervalMonths(
  customer: Customer,
  fallbackIntervalDays: number = DEFAULT_SERVICE_ALERT_INTERVAL_DAYS
): number {
  const days = getAverageServiceIntervalDays(customer, fallbackIntervalDays);
  return Number((days / 30.4375).toFixed(1));
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

  const sorted = [...visits].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const d = new Date(sorted[0].date + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
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
  intervalDays: number = DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
  bufferDays: number = DEFAULT_SERVICE_ALERT_BUFFER_DAYS
): string {
  if (!customerOrSoldDate) return 'N/A';

  if (typeof customerOrSoldDate === 'string') {
    try {
      const soldDate = new Date(customerOrSoldDate + 'T00:00:00');
      if (isNaN(soldDate.getTime())) return 'N/A';

      const currentCycle = calculateServiceCycle(customerOrSoldDate, intervalDays);
      const nextMilestoneDate = new Date(soldDate.getTime());
      nextMilestoneDate.setDate(
        nextMilestoneDate.getDate() + (currentCycle + 1) * intervalDays + bufferDays
      );

      return nextMilestoneDate.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  }

  const customer = customerOrSoldDate;
  const avgDays = getAverageServiceIntervalDays(customer, intervalDays);
  const lastDate = getLastServiceDate(customer);
  if (!lastDate) return 'N/A';

  const nextDue = new Date(lastDate.getTime() + (avgDays + bufferDays) * 24 * 60 * 60 * 1000);
  return nextDue.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function isServiceAlertActive(
  customer: Customer,
  intervalDays: number = DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
  bufferDays: number = DEFAULT_SERVICE_ALERT_BUFFER_DAYS
): boolean {
  if (!customer.enableServiceAlert) return false;
  if (customer.stopAlertInfo) return false;

  const avgDays = getAverageServiceIntervalDays(customer, intervalDays);
  const lastDate = getLastServiceDate(customer);
  if (!lastDate) return false;

  const alertAfter = new Date(
    lastDate.getTime() + (avgDays + bufferDays) * 24 * 60 * 60 * 1000
  );
  const now = new Date();

  if (customer.lastServiceContact) {
    const lastContactTime = new Date(customer.lastServiceContact.seconds * 1000).getTime();
    if (lastContactTime > lastDate.getTime() && lastContactTime > alertAfter.getTime()) {
      return false;
    }
  }

  return now.getTime() >= alertAfter.getTime();
}
