import type { Role } from '../types';
import type { AppTab } from './appRoutes';

const SALES_TABS: AppTab[] = ['add', 'vin-search', 'search', 'sales-performance'];
const SERVICE_TABS: AppTab[] = ['search', 'alerts', 'dispatch', 'appointments', 'forecast'];
const MANAGER_TABS: AppTab[] = [
  'add',
  'vin-search',
  'search',
  'alerts',
  'dispatch',
  'appointments',
  'forecast',
  'sales-performance',
  'pot-of-gold',
];

export function isTabAllowedForRole(tab: AppTab, role: Role): boolean {
  if (role === 'admin') return true;
  if (tab === 'admin') return false;
  switch (role) {
    case 'Salesperson':
      return SALES_TABS.includes(tab);
    case 'Service Advisor':
      return SERVICE_TABS.includes(tab);
    case 'Manager':
      return MANAGER_TABS.includes(tab);
    case 'Staff':
      return ['search', 'alerts', 'appointments'].includes(tab);
    default:
      return true;
  }
}

export function filterTabsForRole<T extends { id: string }>(tabs: T[], role: Role): T[] {
  return tabs.filter((t) => isTabAllowedForRole(t.id as AppTab, role));
}
