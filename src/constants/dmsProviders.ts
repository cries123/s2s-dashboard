export type DmsProviderId = 'pbs' | 'dealerbuilt';

export interface DmsProviderOption {
  id: DmsProviderId;
  label: string;
  description: string;
}

export const DMS_PROVIDERS: DmsProviderOption[] = [
  {
    id: 'pbs',
    label: 'PBS Systems',
    description: 'Confirmation-key appointment reports and Advisor / Total (Tech) performance layouts.',
  },
  {
    id: 'dealerbuilt',
    label: 'DealerBuilt',
    description: 'RO- and service-writer-based report layouts with DealerBuilt section headers.',
  },
];

export const DEFAULT_DMS_PROVIDER: DmsProviderId = 'pbs';

export function normalizeDmsProvider(value?: string | null): DmsProviderId {
  if (value === 'dealerbuilt') return 'dealerbuilt';
  if (value === 'pbs') return 'pbs';
  // Legacy stored values (CDK, Reynolds, etc.) map to PBS layouts until dedicated parsers exist.
  return DEFAULT_DMS_PROVIDER;
}
