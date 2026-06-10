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
  | 'sales-performance';

export type AdminSubTab = 'users' | 'logs';
export type ManagerSubTab = 'users' | 'settings' | 'logs';

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
  admin: '/admin/user-settings',
  manager: '/manager/users',
};

const ADMIN_SUB_PATHS: Record<AdminSubTab, string> = {
  users: '/admin/user-settings',
  logs: '/admin/logs',
};

const MANAGER_SUB_PATHS: Record<ManagerSubTab, string> = {
  users: '/manager/users',
  settings: '/manager/settings',
  logs: '/manager/logs',
};

const PATH_TO_TAB: Record<string, AppTab> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as AppTab])
) as Record<string, AppTab>;

PATH_TO_TAB['/admin/user-settings'] = 'admin';
PATH_TO_TAB['/admin/logs'] = 'admin';
PATH_TO_TAB['/manager/settings'] = 'manager';
PATH_TO_TAB['/manager/logs'] = 'manager';

export function adminSubTabFromPath(path: string): AdminSubTab {
  if (path === '/admin/user-settings') return 'users';
  if (path === '/admin/logs') return 'logs';
  return 'users';
}

export function managerSubTabFromPath(path: string): ManagerSubTab {
  if (path === '/manager/settings') return 'settings';
  if (path === '/manager/logs') return 'logs';
  return 'users';
}

export function resolveRoute(pathname: string): {
  tab: AppTab | null;
  adminSubTab: AdminSubTab;
  managerSubTab: ManagerSubTab;
} {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  if (path === '/' || path === '') {
    return { tab: null, adminSubTab: 'users', managerSubTab: 'users' };
  }
  const tab = PATH_TO_TAB[path] ?? null;
  return {
    tab,
    adminSubTab: tab === 'admin' ? adminSubTabFromPath(path) : 'users',
    managerSubTab: tab === 'manager' ? managerSubTabFromPath(path) : 'users',
  };
}

export function pathForTab(
  tab: AppTab,
  adminSubTab: AdminSubTab = 'users',
  managerSubTab: ManagerSubTab = 'users'
): string {
  if (tab === 'admin') {
    return ADMIN_SUB_PATHS[adminSubTab];
  }
  if (tab === 'manager') {
    return MANAGER_SUB_PATHS[managerSubTab];
  }
  return TAB_PATHS[tab];
}

export function navigateToTab(
  tab: AppTab,
  adminSubTab: AdminSubTab = 'users',
  replace = false,
  managerSubTab: ManagerSubTab = 'users'
): void {
  const path = pathForTab(tab, adminSubTab, managerSubTab);
  if (replace) {
    window.history.replaceState({ tab, adminSubTab, managerSubTab }, '', path);
  } else {
    window.history.pushState({ tab, adminSubTab, managerSubTab }, '', path);
  }
}
