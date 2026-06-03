export const DEALERSHIPS = [
  { id: 'hyundai', name: 'Hyundai of Santa Maria', code: 'HY934', tenantId: 'hyundai' as const },
  { id: 'ford', name: 'Santa Maria Ford/Lincoln', code: 'FO281', tenantId: 'ford-lincoln' as const },
  { id: 'nissan', name: 'Santa Maria Nissan/Mazda', code: 'NM506', tenantId: 'nissan-mazda' as const },
];

export type DealershipId = 'hyundai' | 'ford' | 'nissan';

export { TENANT_PROFILES } from './lib/tenants';
