export type AppTab =
  | 'add'
  | 'search'
  | 'alerts'
  | 'appointments'
  | 'admin'
  | 'vin-search'
  | 'pot-of-gold'
  | 'forecast'
  | 'dispatch'
  | 'recalls'
  | 'sales-performance';

export type AdminSubTab = 'operations' | 'users' | 'logs';

export interface AppRouteState {
  activeTab: AppTab;
  adminSubTab?: AdminSubTab;
}

const PATH_TO_ROUTE: Record<string, AppRouteState> = {
  '/sales/onboard': { activeTab: 'add' },
  '/sales/vin-search': { activeTab: 'vin-search' },
  '/service/directory': { activeTab: 'search' },
  '/service/alerts': { activeTab: 'alerts' },
  '/service/dispatch': { activeTab: 'dispatch' },
  '/service/recalls': { activeTab: 'recalls' },
  '/competitions/pot-of-gold': { activeTab: 'pot-of-gold' },
  '/reports/operations': { activeTab: 'appointments' },
  '/reports/sales-performance': { activeTab: 'sales-performance' },
  '/reports/forecast': { activeTab: 'forecast' },
  '/admin/operation-settings': { activeTab: 'admin', adminSubTab: 'operations' },
  '/admin/user-settings': { activeTab: 'admin', adminSubTab: 'users' },
  '/admin/logs': { activeTab: 'admin', adminSubTab: 'logs' },
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
  if (state.activeTab === 'admin') {
    switch (state.adminSubTab) {
      case 'users':
        return '/admin/user-settings';
      case 'logs':
        return '/admin/logs';
      case 'operations':
      default:
        return '/admin/operation-settings';
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
