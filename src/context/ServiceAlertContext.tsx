import React, { createContext, useContext } from 'react';
import {
  useServiceAlertInterval,
  type ServiceAlertHelpers,
} from '../hooks/useServiceAlertInterval';
import {
  calculateServiceCycle,
  getAverageServiceIntervalDays,
  getAverageServiceIntervalMonths,
  getNextServiceMilestone,
  isServiceAlertActive,
} from '../lib/alerts';
import { DEFAULT_SERVICE_ALERT_INTERVAL_DAYS } from '../lib/dealershipSettingsUtils';
import { SERVICE_REMINDER_MONTHS } from '../lib/serviceReminder';

const defaultServiceAlertHelpers: ServiceAlertHelpers = {
  intervalDays: DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
  bufferDays: 0,
  isServiceAlertActive: (customer) => isServiceAlertActive(customer),
  calculateServiceCycle: (soldDate) => calculateServiceCycle(soldDate),
  getAverageServiceIntervalDays: (customer) => getAverageServiceIntervalDays(customer),
  getAverageServiceIntervalMonths: () => SERVICE_REMINDER_MONTHS,
  getNextServiceMilestone: (customerOrSoldDate) => getNextServiceMilestone(customerOrSoldDate),
};

const ServiceAlertContext = createContext<ServiceAlertHelpers>(defaultServiceAlertHelpers);

export function ServiceAlertProvider({ children }: { children: React.ReactNode }) {
  const helpers = useServiceAlertInterval();
  return (
    <ServiceAlertContext.Provider value={helpers}>{children}</ServiceAlertContext.Provider>
  );
}

export function useServiceAlertHelpers(): ServiceAlertHelpers {
  return useContext(ServiceAlertContext);
}
