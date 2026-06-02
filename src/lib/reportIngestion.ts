import { DmsProviderId, normalizeDmsProvider } from '../constants/dmsProviders';

export function resolveDmsProvider(
  settings?: { dmsProvider?: string } | null
): DmsProviderId {
  return normalizeDmsProvider(settings?.dmsProvider);
}

export function withDmsProvider<T extends Record<string, unknown>>(
  settings: { dmsProvider?: string } | null | undefined,
  payload: T
): T & { dmsProvider: DmsProviderId } {
  return {
    ...payload,
    dmsProvider: resolveDmsProvider(settings),
  };
}
