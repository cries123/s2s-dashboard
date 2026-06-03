import { defaultDmsProviderForDealership } from '../constants/dealerDefaults';
import { DmsProviderId, normalizeDmsProvider } from '../constants/dmsProviders';

export function resolveDmsProvider(
  settings?: { dmsProvider?: string; dealershipId?: string } | null
): DmsProviderId {
  if (settings?.dmsProvider) {
    return normalizeDmsProvider(settings.dmsProvider);
  }
  if (settings?.dealershipId) {
    return defaultDmsProviderForDealership(settings.dealershipId);
  }
  return normalizeDmsProvider(undefined);
}

export function withDmsProvider<T extends Record<string, unknown>>(
  settings: { dmsProvider?: string; dealershipId?: string } | null | undefined,
  payload: T
): T & { dmsProvider: DmsProviderId; dealershipId?: string } {
  const dealershipId = settings?.dealershipId;
  return {
    ...payload,
    dmsProvider: resolveDmsProvider(settings),
    ...(dealershipId ? { dealershipId } : {}),
  };
}
