import type { DmsProviderId } from './dmsProviders';

export interface PerformanceAdvisorSlot {
  id: string;
  label: string;
}

/** Santa Maria Ford/Lincoln — DealerBuilt Service Advisor Performance roster (May 2026 report). */
export const FORD_PERFORMANCE_ADVISOR_ROSTER: PerformanceAdvisorSlot[] = [
  { id: 'tom-healey', label: 'Tom Healey' },
  { id: 'patrick-peck', label: 'Patrick Peck' },
  { id: 'erick-barbachan', label: 'Erick Barbachan' },
  { id: 'rob-neri', label: 'Rob Neri' },
  { id: 'christopher-bergstrom', label: 'Christopher Bergstrom' },
];

export function defaultDmsProviderForDealership(dealershipId: string): DmsProviderId {
  if (dealershipId === 'ford') return 'dealerbuilt';
  return 'pbs';
}

export function defaultPerformanceAdvisorRoster(
  dealershipId: string
): PerformanceAdvisorSlot[] | undefined {
  if (dealershipId === 'ford') return FORD_PERFORMANCE_ADVISOR_ROSTER;
  return undefined;
}
