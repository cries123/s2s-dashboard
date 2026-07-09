import type { DealershipSettings } from '../types';
import type { DmsProviderId } from '../constants/dmsProviders';
import {
  defaultPerformanceAdvisorRoster,
  FORD_PERFORMANCE_ADVISOR_ROSTER,
} from '../constants/dealerDefaults';

/** Patch written when a store changes DMS — parsers read dealershipSettings.dmsProvider. */
export function buildDmsProviderSettingsPatch(
  dealershipId: string,
  next: DmsProviderId,
  existing?: Pick<DealershipSettings, 'performanceAdvisorRoster'> | null
): Partial<DealershipSettings> {
  const patch: Partial<DealershipSettings> = { dmsProvider: next };

  if (next === 'dealerbuilt' && !existing?.performanceAdvisorRoster?.length) {
    patch.performanceAdvisorRoster =
      defaultPerformanceAdvisorRoster(dealershipId) ?? FORD_PERFORMANCE_ADVISOR_ROSTER;
  }

  return patch;
}
