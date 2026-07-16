export type AppTab =
  | 'add'
  | 'search'
  | 'alerts'
  | 'appointments'
  | 'schedule'
  | 'admin'
  | 'manager'
  | 'vin-search'
  | 'pot-of-gold'
  | 'forecast'
  | 'dispatch'
  | 'sales-performance';

export type AdminSubTab =
  | 'users'
  | 'logs'
  | 'master-users'
  | 'ai-usage'
  | 'suggestions'
  | 'enrollments'
  | 'import-health'
  | 'pbs-sync';
export type ManagerSubTab = 'operations' | 'preferences' | 'team' | 'logs';

export interface AppRouteState {
  activeTab: AppTab;
  adminSubTab?: AdminSubTab;
  managerSubTab?: ManagerSubTab;
}

const PATH_TO_ROUTE: Record<string, AppRouteState> = {
  '/sales/onboard': { activeTab: 'add' },
  '/sales/vin-search': { activeTab: 'vin-search' },
  '/service/directory': { activeTab: 'search' },
  '/service/alerts': { activeTab: 'alerts' },
  '/service/dispatch': { activeTab: 'dispatch' },
  '/service/recalls': { activeTab: 'search' },
  '/service/bundle-menus': { activeTab: 'search' },
  '/competitions/pot-of-gold': { activeTab: 'pot-of-gold' },
  '/reports/operations': { activeTab: 'appointments' },
  '/reports/schedule': { activeTab: 'schedule' },
  '/reports/sales-performance': { activeTab: 'sales-performance' },
  '/reports/forecast': { activeTab: 'forecast' },
  '/manager/operations': { activeTab: 'manager', managerSubTab: 'operations' },
  '/manager/preferences': { activeTab: 'manager', managerSubTab: 'preferences' },
  '/manager/team': { activeTab: 'manager', managerSubTab: 'team' },
  '/manager/logs': { activeTab: 'manager', managerSubTab: 'logs' },
  '/admin/operations': { activeTab: 'admin', adminSubTab: 'logs' },
  '/admin/operation-settings': { activeTab: 'admin', adminSubTab: 'logs' },
  '/admin/user-settings': { activeTab: 'manager', managerSubTab: 'team' },
  '/admin/users': { activeTab: 'manager', managerSubTab: 'team' },
  '/admin/master-users': { activeTab: 'admin', adminSubTab: 'master-users' },
  '/admin/ai-usage': { activeTab: 'admin', adminSubTab: 'ai-usage' },
  '/admin/import-history': { activeTab: 'admin', adminSubTab: 'import-health' },
  '/admin/import-health': { activeTab: 'admin', adminSubTab: 'import-health' },
  '/admin/pbs-sync': { activeTab: 'admin', adminSubTab: 'pbs-sync' },
  '/admin/enrollments': { activeTab: 'manager', managerSubTab: 'team' },
  '/admin/logs': { activeTab: 'admin', adminSubTab: 'logs' },
  '/admin/suggestions': { activeTab: 'admin', adminSubTab: 'suggestions' },
};

const DEFAULT_ROUTE: AppRouteState = { activeTab: 'add' };

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function parseAppRoute(pathname: string): AppRouteState {
  const path = normalizePathname(pathname);
  if (path === '/') return DEFAULT_ROUTE;
  return PATH_TO_ROUTE[path] ?? DEFAULT_ROUTE;
}

export function buildAppPath(state: AppRouteState): string {
  if (state.activeTab === 'manager') {
    switch (state.managerSubTab) {
      case 'preferences':
        return '/manager/preferences';
      case 'team':
        return '/manager/team';
      case 'logs':
        return '/manager/logs';
      case 'operations':
      default:
        return '/manager/operations';
    }
  }

  if (state.activeTab === 'admin') {
    switch (state.adminSubTab) {
      case 'master-users':
        return '/admin/master-users';
      case 'ai-usage':
        return '/admin/ai-usage';
      case 'logs':
        return '/admin/logs';
      case 'suggestions':
        return '/admin/suggestions';
      case 'enrollments':
        return '/admin/enrollments';
      case 'import-health':
        return '/admin/import-health';
      case 'pbs-sync':
        return '/admin/pbs-sync';
      case 'users':
      default:
        return '/admin/master-users';
    }
  }

  switch (state.activeTab) {
    case 'add':
      return '/sales/onboard';
    case 'vin-search':
      return '/sales/vin-search';
    case 'search':
      return '/service/directory';
    case 'alerts':
      return '/service/alerts';
    case 'dispatch':
      return '/service/dispatch';
    case 'pot-of-gold':
      return '/competitions/pot-of-gold';
    case 'appointments':
      return '/reports/operations';
    case 'schedule':
      return '/reports/schedule';
    case 'sales-performance':
      return '/reports/sales-performance';
    case 'forecast':
      return '/reports/forecast';
    default:
      return '/sales/onboard';
  }
}

export function readInitialAppRoute(): AppRouteState {
  if (typeof window === 'undefined') return DEFAULT_ROUTE;
  return parseAppRoute(window.location.pathname);
}

export function syncAppRoute(state: AppRouteState, replace = true): void {
  if (typeof window === 'undefined') return;
  const nextPath = buildAppPath(state);
  const currentPath = normalizePathname(window.location.pathname);
  if (currentPath === nextPath) return;

  if (replace) {
    window.history.replaceState(state, '', nextPath);
  } else {
    window.history.pushState(state, '', nextPath);
  }
}

export const DEALERSHIP_STORAGE_KEY = 's2s-dealership-id';

export function readStoredDealershipId(validIds: string[]): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(DEALERSHIP_STORAGE_KEY);
    if (stored && validIds.includes(stored)) return stored;
  } catch {
    /* ignore storage errors */
  }
  return null;
}

export function storeDealershipId(dealershipId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEALERSHIP_STORAGE_KEY, dealershipId);
  } catch {
    /* ignore storage errors */
  }
}
