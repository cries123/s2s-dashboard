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
import { SERVICE_REMINDER_MONTHS } from '../lib/serviceReminder';

export interface ServiceAlertHelpers {
  intervalDays: number;
  bufferDays: number;
  isServiceAlertActive: (customer: Customer) => boolean;
  calculateServiceCycle: (soldDate: string) => number;
  getAverageServiceIntervalDays: (customer: Customer) => number;
  getAverageServiceIntervalMonths: (customer: Customer) => number;
  getNextServiceMilestone: (customerOrSoldDate: Customer | string) => string;
}

export function useServiceAlertInterval(): ServiceAlertHelpers {
  return useMemo(
    () => ({
      intervalDays: DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
      bufferDays: 0,
      isServiceAlertActive: (customer: Customer) => isServiceAlertActive(customer),
      calculateServiceCycle: (soldDate: string) => calculateServiceCycle(soldDate),
      getAverageServiceIntervalDays: (customer: Customer) =>
        getAverageServiceIntervalDays(customer),
      getAverageServiceIntervalMonths: () => SERVICE_REMINDER_MONTHS,
      getNextServiceMilestone: (customerOrSoldDate: Customer | string) =>
        getNextServiceMilestone(customerOrSoldDate),
    }),
    []
  );
}
