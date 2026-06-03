import type { User } from '../types';
import type { AppTab } from './appRoutes';
import {
  canSeeAdminPanel,
  canSeeCompetitions,
  canSeeForecastReport,
  canSeeManagerPanel,
  canSeeOperationsReport,
  canSeeSalesNav,
  canSeeSalesPerformanceReport,
  canSeeServiceNav,
  isPlatformAdmin,
  isUserApproved,
  resolveUserTenantId,
} from './rbac';

export function isTabAllowedForUser(tab: AppTab, user: User | null | undefined): boolean {
  if (!user || !isUserApproved(user)) return false;
  if (tab === 'admin') return canSeeAdminPanel(user);
  if (tab === 'manager') return canSeeManagerPanel(user);
  if (isPlatformAdmin(user)) return true;

  const showService = canSeeServiceNav(user);
  const tenantId = resolveUserTenantId(user);

  switch (tab) {
    case 'add':
    case 'vin-search':
      return canSeeSalesNav(user);
    case 'search':
    case 'alerts':
    case 'dispatch':
    case 'appointments':
      return showService && canSeeOperationsReport(user);
    case 'forecast':
      return showService && canSeeForecastReport(user);
    case 'sales-performance':
      return canSeeSalesPerformanceReport(user);
    case 'pot-of-gold':
      return canSeeCompetitions(user, tenantId);
    default:
      return true;
  }
}

export function filterTabsForRole<T extends { id: string }>(tabs: T[], user: User | null | undefined): T[] {
  return tabs.filter((t) => isTabAllowedForUser(t.id as AppTab, user));
}
