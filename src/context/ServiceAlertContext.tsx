import React, { createContext, useContext } from 'react';
import {
  useServiceAlertInterval,
  type ServiceAlertHelpers,
} from '../hooks/useServiceAlertInterval';
import {
  calculateServiceCycle,
  computeContactClearDueDate,
  getAverageServiceIntervalDays,
  getAverageServiceIntervalMonths,
  getNextServiceMilestone,
  getServiceAlertModeLabel,
  isServiceAlertActive,
  isStandardServiceAlertMode,
  resolveServiceAlertConfig,
} from '../lib/alerts';
import { DEFAULT_SERVICE_ALERT_MODE, mergeDealershipSettings } from '../lib/dealershipSettingsUtils';
import type { DealershipSettings } from '../types';

const defaultConfig = resolveServiceAlertConfig(
  mergeDealershipSettings('hyundai', { serviceAlertMode: DEFAULT_SERVICE_ALERT_MODE })
);

const defaultServiceAlertHelpers: ServiceAlertHelpers = {
  config: defaultConfig,
  modeLabel: getServiceAlertModeLabel(defaultConfig.mode),
  intervalDays: defaultConfig.intervalDays,
  bufferDays: defaultConfig.bufferDays,
  isServiceAlertActive: (customer) => isServiceAlertActive(customer, defaultConfig),
  calculateServiceCycle: (soldDate) => calculateServiceCycle(soldDate, defaultConfig.intervalDays),
  getAverageServiceIntervalDays: (customer) => getAverageServiceIntervalDays(customer, defaultConfig),
  getAverageServiceIntervalMonths: (customer) => getAverageServiceIntervalMonths(customer, defaultConfig),
  getNextServiceMilestone: (customerOrSoldDate) => getNextServiceMilestone(customerOrSoldDate, defaultConfig),
  computeContactClearDueDate: (customer, from) => computeContactClearDueDate(customer, defaultConfig, from),
  isStandardMode: isStandardServiceAlertMode(defaultConfig),
};

const ServiceAlertContext = createContext<ServiceAlertHelpers>(defaultServiceAlertHelpers);

export function ServiceAlertProvider({
  children,
  dealershipId = 'hyundai',
  settings,
}: {
  children: React.ReactNode;
  dealershipId?: string;
  settings?: Partial<DealershipSettings> | null;
}) {
  const helpers = useServiceAlertInterval(dealershipId, settings);
  return (
    <ServiceAlertContext.Provider value={helpers}>{children}</ServiceAlertContext.Provider>
  );
}

export function useServiceAlertHelpers(): ServiceAlertHelpers {
  return useContext(ServiceAlertContext);
}
