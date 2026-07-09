import { DEALERSHIPS } from '../constants';
import type { DealershipSettings } from '../types';
import { resolveEnrollmentJoinCode } from './dealershipSettingsUtils';

export function getDealershipEnrollmentCode(
  dealershipId: string,
  settings?: Partial<DealershipSettings> | null
): string {
  return resolveEnrollmentJoinCode(dealershipId, settings);
}

export function getDealershipStaticEnrollmentCode(dealershipId: string): string {
  return (DEALERSHIPS.find((d) => d.id === dealershipId)?.code ?? '').toUpperCase();
}
