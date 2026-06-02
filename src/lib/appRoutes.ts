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
  | 'sales-performance';

export type AdminSubTab = 'operations' | 'users' | 'logs';

export const TAB_PATHS: Record<AppTab, string> = {
  add: '/sales/onboard',
  'vin-search': '/sales/vin-search',
  search: '/service/directory',
  alerts: '/service/alerts',
  dispatch: '/service/dispatch',
  'pot-of-gold': '/competitions/pot-of-gold',
  appointments: '/reports/operations',
  'sales-performance': '/reports/sales-performance',
  forecast: '/reports/forecast',
  admin: '/admin/operation-settings',
};

const ADMIN_SUB_PATHS: Record<AdminSubTab, string> = {
  operations: '/admin/operation-settings',
  users: '/admin/user-settings',
  logs: '/admin/logs',
};

const PATH_TO_TAB: Record<string, AppTab> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as AppTab])
) as Record<string, AppTab>;

PATH_TO_TAB['/admin/user-settings'] = 'admin';
PATH_TO_TAB['/admin/logs'] = 'admin';

export function adminSubTabFromPath(path: string): AdminSubTab {
  if (path === '/admin/user-settings') return 'users';
  if (path === '/admin/logs') return 'logs';
  return 'operations';
}

export function resolveRoute(pathname: string): {
  tab: AppTab | null;
  adminSubTab: AdminSubTab;
} {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  if (path === '/' || path === '') {
    return { tab: null, adminSubTab: 'operations' };
  }
  const tab = PATH_TO_TAB[path] ?? null;
  return {
    tab,
    adminSubTab: tab === 'admin' ? adminSubTabFromPath(path) : 'operations',
  };
}

export function pathForTab(tab: AppTab, adminSubTab: AdminSubTab = 'operations'): string {
  if (tab === 'admin') {
    return ADMIN_SUB_PATHS[adminSubTab];
  }
  return TAB_PATHS[tab];
}

export function navigateToTab(
  tab: AppTab,
  adminSubTab: AdminSubTab = 'operations',
  replace = false
): void {
  const path = pathForTab(tab, adminSubTab);
  if (replace) {
    window.history.replaceState({ tab, adminSubTab }, '', path);
  } else {
    window.history.pushState({ tab, adminSubTab }, '', path);
  }
}
