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
import {
  DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
} from '../lib/dealershipSettingsUtils';

const defaultServiceAlertHelpers: ServiceAlertHelpers = {
  intervalDays: DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
  bufferDays: DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  isServiceAlertActive: (customer) =>
    isServiceAlertActive(
      customer,
      DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
      DEFAULT_SERVICE_ALERT_BUFFER_DAYS
    ),
  calculateServiceCycle: (soldDate) =>
    calculateServiceCycle(soldDate, DEFAULT_SERVICE_ALERT_INTERVAL_DAYS),
  getAverageServiceIntervalDays: (customer) =>
    getAverageServiceIntervalDays(customer, DEFAULT_SERVICE_ALERT_INTERVAL_DAYS),
  getAverageServiceIntervalMonths: (customer) =>
    getAverageServiceIntervalMonths(customer, DEFAULT_SERVICE_ALERT_INTERVAL_DAYS),
  getNextServiceMilestone: (customerOrSoldDate) =>
    getNextServiceMilestone(
      customerOrSoldDate,
      DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
      DEFAULT_SERVICE_ALERT_BUFFER_DAYS
    ),
};

const ServiceAlertContext = createContext<ServiceAlertHelpers>(defaultServiceAlertHelpers);

export function ServiceAlertProvider({
  intervalDays,
  bufferDays,
  children,
}: {
  intervalDays?: number;
  bufferDays?: number;
  children: React.ReactNode;
}) {
  const helpers = useServiceAlertInterval(intervalDays, bufferDays);
  return (
    <ServiceAlertContext.Provider value={helpers}>{children}</ServiceAlertContext.Provider>
  );
}

export function useServiceAlertHelpers(): ServiceAlertHelpers {
  return useContext(ServiceAlertContext);
}
