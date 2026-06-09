import { useMemo } from 'react';
import type { Customer } from '../types';
import { resolveCustomerAlertTiming } from '../lib/customerAlertTiming';
import {
  calculateServiceCycle,
  getAverageServiceIntervalDays,
  getAverageServiceIntervalMonths,
  getNextServiceMilestone,
  isServiceAlertActive,
} from '../lib/alerts';
import {
  DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
} from '../lib/dealershipSettingsUtils';

export interface ServiceAlertHelpers {
  intervalDays: number;
  bufferDays: number;
  isServiceAlertActive: (customer: Customer) => boolean;
  calculateServiceCycle: (soldDate: string) => number;
  getAverageServiceIntervalDays: (customer: Customer) => number;
  getAverageServiceIntervalMonths: (customer: Customer) => number;
  getNextServiceMilestone: (customerOrSoldDate: Customer | string) => string;
}

export function useServiceAlertInterval(
  intervalDays?: number,
  bufferDays?: number
): ServiceAlertHelpers {
  const days = intervalDays ?? DEFAULT_SERVICE_ALERT_INTERVAL_DAYS;
  const buffer = bufferDays ?? DEFAULT_SERVICE_ALERT_BUFFER_DAYS;

  return useMemo(
    () => ({
      intervalDays: days,
      bufferDays: buffer,
      isServiceAlertActive: (customer: Customer) =>
        isServiceAlertActive(customer, days, buffer),
      calculateServiceCycle: (soldDate: string) => calculateServiceCycle(soldDate, days),
      getAverageServiceIntervalDays: (customer: Customer) => {
        const timing = resolveCustomerAlertTiming(customer, days, buffer);
        return getAverageServiceIntervalDays(customer, timing.intervalDays);
      },
      getAverageServiceIntervalMonths: (customer: Customer) => {
        const timing = resolveCustomerAlertTiming(customer, days, buffer);
        return getAverageServiceIntervalMonths(customer, timing.intervalDays);
      },
      getNextServiceMilestone: (customerOrSoldDate: Customer | string) => {
        if (typeof customerOrSoldDate === 'string') {
          return getNextServiceMilestone(customerOrSoldDate, days, buffer);
        }
        const timing = resolveCustomerAlertTiming(customerOrSoldDate, days, buffer);
        return getNextServiceMilestone(
          customerOrSoldDate,
          timing.intervalDays,
          timing.bufferDays
        );
      },
    }),
    [days, buffer]
  );
}
