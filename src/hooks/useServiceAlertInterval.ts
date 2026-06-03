import { useMemo } from 'react';
import type { Customer } from '../types';
import {
  calculateServiceCycle,
  getAverageServiceIntervalDays,
  getAverageServiceIntervalMonths,
  getNextServiceMilestone,
  isServiceAlertActive,
} from '../lib/alerts';
import { DEFAULT_SERVICE_ALERT_INTERVAL_DAYS } from '../lib/dealershipSettingsUtils';

export function useServiceAlertInterval(intervalDays?: number) {
  const days = intervalDays ?? DEFAULT_SERVICE_ALERT_INTERVAL_DAYS;

  return useMemo(
    () => ({
      intervalDays: days,
      isServiceAlertActive: (customer: Customer) => isServiceAlertActive(customer, days),
      calculateServiceCycle: (soldDate: string) => calculateServiceCycle(soldDate, days),
      getAverageServiceIntervalDays: (customer: Customer) => getAverageServiceIntervalDays(customer, days),
      getAverageServiceIntervalMonths: (customer: Customer) =>
        getAverageServiceIntervalMonths(customer, days),
      getNextServiceMilestone: (customerOrSoldDate: Customer | string) =>
        getNextServiceMilestone(customerOrSoldDate, days),
    }),
    [days]
  );
}
