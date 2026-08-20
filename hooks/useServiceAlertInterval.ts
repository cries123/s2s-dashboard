import { useMemo } from 'react';
import type { Customer, DealershipSettings } from '../types';
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
  type ServiceAlertConfig,
} from '../lib/alerts';
import { mergeDealershipSettings } from '../lib/dealershipSettingsUtils';

export interface ServiceAlertHelpers {
  config: ServiceAlertConfig;
  modeLabel: string;
  intervalDays: number;
  bufferDays: number;
  isServiceAlertActive: (customer: Customer) => boolean;
  calculateServiceCycle: (soldDate: string) => number;
  getAverageServiceIntervalDays: (customer: Customer) => number;
  getAverageServiceIntervalMonths: (customer: Customer) => number;
  getNextServiceMilestone: (customerOrSoldDate: Customer | string) => string;
  computeContactClearDueDate: (customer: Customer, from?: Date) => string;
  isStandardMode: boolean;
}

export function useServiceAlertInterval(
  dealershipId: string = 'hyundai',
  rawSettings?: Partial<DealershipSettings> | null
): ServiceAlertHelpers {
  const config = useMemo(
    () => resolveServiceAlertConfig(mergeDealershipSettings(dealershipId, rawSettings)),
    [
      dealershipId,
      rawSettings?.serviceAlertMode,
      rawSettings?.serviceAlertIntervalDays,
      rawSettings?.serviceAlertBufferDays,
    ]
  );

  return useMemo(
    () => ({
      config,
      modeLabel: getServiceAlertModeLabel(config.mode),
      intervalDays: config.intervalDays,
      bufferDays: config.bufferDays,
      isServiceAlertActive: (customer: Customer) => isServiceAlertActive(customer, config),
      calculateServiceCycle: (soldDate: string) =>
        calculateServiceCycle(soldDate, config.intervalDays),
      getAverageServiceIntervalDays: (customer: Customer) =>
        getAverageServiceIntervalDays(customer, config),
      getAverageServiceIntervalMonths: (customer: Customer) =>
        getAverageServiceIntervalMonths(customer, config),
      getNextServiceMilestone: (customerOrSoldDate: Customer | string) =>
        getNextServiceMilestone(customerOrSoldDate, config),
      computeContactClearDueDate: (customer: Customer, from?: Date) =>
        computeContactClearDueDate(customer, config, from),
      isStandardMode: isStandardServiceAlertMode(config),
    }),
    [config.mode, config.intervalDays, config.bufferDays]
  );
}
