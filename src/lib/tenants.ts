/** Dealership group profiles — shared dashboards vs isolated Hyundai. */
export type TenantId = 'nissan-mazda' | 'ford-lincoln' | 'hyundai';

export type DmsProvider = 'pbs' | 'cdk' | 'reynolds' | 'dealertrack';

export interface TenantProfile {
  tenantId: TenantId;
  name: string;
  dmsProvider: DmsProvider;
  /** Legacy dealership id used in operational Firestore docs */
  dealershipId: string;
  /** Shared dashboard layout (Nissan/Mazda + Ford/Lincoln) vs Hyundai-only features */
  isolatedDashboard: boolean;
}

export const TENANT_PROFILES: TenantProfile[] = [
  {
    tenantId: 'nissan-mazda',
    name: 'Nissan / Mazda',
    dmsProvider: 'pbs',
    dealershipId: 'nissan',
    isolatedDashboard: false,
  },
  {
    tenantId: 'ford-lincoln',
    name: 'Ford / Lincoln',
    dmsProvider: 'cdk',
    dealershipId: 'ford',
    isolatedDashboard: false,
  },
  {
    tenantId: 'hyundai',
    name: 'Hyundai',
    dmsProvider: 'pbs',
    dealershipId: 'hyundai',
    isolatedDashboard: true,
  },
];

export function getTenantProfile(tenantId: string | undefined): TenantProfile | undefined {
  return TENANT_PROFILES.find((t) => t.tenantId === tenantId);
}

export function tenantIdFromDealershipId(dealershipId: string | undefined): TenantId {
  switch (dealershipId) {
    case 'nissan':
      return 'nissan-mazda';
    case 'ford':
      return 'ford-lincoln';
    case 'hyundai':
    default:
      return 'hyundai';
  }
}

export function dealershipIdFromTenantId(tenantId: string | undefined): string {
  return getTenantProfile(tenantId)?.dealershipId ?? tenantIdFromDealershipId(tenantId);
}

export const TENANTS_COLLECTION_PATH = [
  'artifacts',
  'hyundai-sales-to-service',
  'public',
  'data',
  'tenants',
] as const;

export const LOGS_COLLECTION_PATH = [
  'artifacts',
  'hyundai-sales-to-service',
  'public',
  'data',
  'logs',
] as const;
