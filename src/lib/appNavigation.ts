export type AppTab =
  | 'add'
  | 'search'
  | 'alerts'
  | 'appointments'
  | 'admin'
  | 'manager'
  | 'vin-search'
  | 'pot-of-gold'
  | 'forecast'
  | 'dispatch'
  | 'recalls'
  | 'sales-performance'
  | 'bundle-menus';

export type AdminSubTab = 'operations' | 'users' | 'logs' | 'master-users' | 'ai-usage' | 'import-history' | 'suggestions';
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
  '/service/recalls': { activeTab: 'recalls' },
  '/service/bundle-menus': { activeTab: 'bundle-menus' },
  '/competitions/pot-of-gold': { activeTab: 'pot-of-gold' },
  '/reports/operations': { activeTab: 'appointments' },
  '/reports/sales-performance': { activeTab: 'sales-performance' },
  '/reports/forecast': { activeTab: 'forecast' },
  '/manager/operations': { activeTab: 'manager', managerSubTab: 'operations' },
  '/manager/preferences': { activeTab: 'manager', managerSubTab: 'preferences' },
  '/manager/team': { activeTab: 'manager', managerSubTab: 'team' },
  '/manager/logs': { activeTab: 'manager', managerSubTab: 'logs' },
  '/admin/operations': { activeTab: 'admin', adminSubTab: 'operations' },
  // Legacy admin operation settings URL → CRM import & ops targets
  '/admin/operation-settings': { activeTab: 'admin', adminSubTab: 'operations' },
  '/admin/user-settings': { activeTab: 'admin', adminSubTab: 'users' },
  '/admin/users': { activeTab: 'admin', adminSubTab: 'users' },
  '/admin/master-users': { activeTab: 'admin', adminSubTab: 'master-users' },
  '/admin/ai-usage': { activeTab: 'admin', adminSubTab: 'ai-usage' },
  '/admin/import-history': { activeTab: 'admin', adminSubTab: 'import-history' },
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
      case 'operations':
        return '/admin/operations';
      case 'master-users':
        return '/admin/master-users';
      case 'ai-usage':
        return '/admin/ai-usage';
      case 'import-history':
        return '/admin/import-history';
      case 'logs':
        return '/admin/logs';
      case 'suggestions':
        return '/admin/suggestions';
      case 'users':
      default:
        return '/admin/users';
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
    case 'recalls':
      return '/service/recalls';
    case 'pot-of-gold':
      return '/competitions/pot-of-gold';
    case 'appointments':
      return '/reports/operations';
    case 'sales-performance':
      return '/reports/sales-performance';
    case 'forecast':
      return '/reports/forecast';
    case 'bundle-menus':
      return '/service/bundle-menus';
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
