import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  Bell,
  Calendar,
  Layers,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import type { AppTab, AdminSubTab, ManagerSubTab } from './appNavigation';

export interface SidebarNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  tab: AppTab;
  adminSubTab?: AdminSubTab;
  managerSubTab?: ManagerSubTab;
  badge?: number;
}

export interface SidebarNavSection {
  id: string;
  label: string;
  items: SidebarNavItem[];
}

interface BuildSidebarNavArgs {
  modules: {
    showVinSearchTab: boolean;
    showForecastTab: boolean;
    showSalesPerformanceTab: boolean;
    showPotOfGoldTab: boolean;
  };
  currentDealershipId: string | null;
  enableDispatchTab: boolean;
  enableBundleMenus: boolean;
  showManager: boolean;
  showAdmin: boolean;
  activeAlertsCount: number;
}

export function buildSidebarNav({
  modules,
  currentDealershipId,
  enableDispatchTab,
  enableBundleMenus,
  showManager,
  showAdmin,
  activeAlertsCount,
}: BuildSidebarNavArgs): SidebarNavSection[] {
  const sections: SidebarNavSection[] = [];

  const salesItems: SidebarNavItem[] = [
    { id: 'onboard', label: 'Onboard customer', href: '/sales/onboard', icon: UserPlus, tab: 'add' },
  ];
  if (modules.showVinSearchTab) {
    salesItems.push({
      id: 'vin-search',
      label: 'VIN search',
      href: '/sales/vin-search',
      icon: Search,
      tab: 'vin-search',
    });
  }
  sections.push({ id: 'sales', label: 'Sales', items: salesItems });

  const serviceItems: SidebarNavItem[] = [
    { id: 'directory', label: 'Customer directory', href: '/service/directory', icon: Users, tab: 'search' },
    {
      id: 'alerts',
      label: 'Service alerts',
      href: '/service/alerts',
      icon: Bell,
      tab: 'alerts',
      badge: activeAlertsCount,
    },
  ];
  if (enableDispatchTab) {
    serviceItems.push({
      id: 'dispatch',
      label: 'Dispatch board',
      href: '/service/dispatch',
      icon: Layers,
      tab: 'dispatch',
    });
  }
  serviceItems.push({
    id: 'recalls',
    label: 'Recalls',
    href: '/service/recalls',
    icon: ShieldAlert,
    tab: 'recalls',
  });
  if (enableBundleMenus) {
    serviceItems.push({
      id: 'bundle-menus',
      label: 'Bundle menus (TV)',
      href: '/service/bundle-menus',
      icon: Sparkles,
      tab: 'bundle-menus',
    });
  }
  sections.push({ id: 'service', label: 'Service', items: serviceItems });

  if (currentDealershipId === 'hyundai' && modules.showPotOfGoldTab) {
    sections.push({
      id: 'competitions',
      label: 'Competitions',
      items: [
        {
          id: 'pot-of-gold',
          label: 'Pot of Gold',
          href: '/competitions/pot-of-gold',
          icon: Trophy,
          tab: 'pot-of-gold',
        },
      ],
    });
  }

  const reportItems: SidebarNavItem[] = [
    {
      id: 'operations',
      label: 'Operations',
      href: '/reports/operations',
      icon: Calendar,
      tab: 'appointments',
    },
  ];
  if (modules.showSalesPerformanceTab) {
    reportItems.push({
      id: 'sales-performance',
      label: 'Sales performance',
      href: '/reports/sales-performance',
      icon: BarChart2,
      tab: 'sales-performance',
    });
  }
  if (modules.showForecastTab) {
    reportItems.push({
      id: 'forecast',
      label: 'Fixed ops forecast',
      href: '/reports/forecast',
      icon: TrendingUp,
      tab: 'forecast',
    });
  }
  sections.push({ id: 'reports', label: 'Reports', items: reportItems });

  if (showManager) {
    sections.push({
      id: 'manager',
      label: 'Manager',
      items: [
        {
          id: 'mgr-ops',
          label: 'Operation settings',
          href: '/manager/operations',
          icon: Settings,
          tab: 'manager',
          managerSubTab: 'operations',
        },
        {
          id: 'mgr-prefs',
          label: 'Preferences',
          href: '/manager/preferences',
          icon: Settings,
          tab: 'manager',
          managerSubTab: 'preferences',
        },
        {
          id: 'mgr-team',
          label: 'Team approvals',
          href: '/manager/team',
          icon: Users,
          tab: 'manager',
          managerSubTab: 'team',
        },
        {
          id: 'mgr-logs',
          label: 'Logs',
          href: '/manager/logs',
          icon: Shield,
          tab: 'manager',
          managerSubTab: 'logs',
        },
      ],
    });
  }

  if (showAdmin) {
    sections.push({
      id: 'admin',
      label: 'Admin',
      items: [
        {
          id: 'admin-ops',
          label: 'CRM import & targets',
          href: '/admin/operations',
          icon: Settings,
          tab: 'admin',
          adminSubTab: 'operations',
        },
        {
          id: 'admin-users',
          label: 'User settings',
          href: '/admin/users',
          icon: Users,
          tab: 'admin',
          adminSubTab: 'users',
        },
        {
          id: 'admin-logs',
          label: 'Audit logs',
          href: '/admin/logs',
          icon: Shield,
          tab: 'admin',
          adminSubTab: 'logs',
        },
        {
          id: 'admin-suggestions',
          label: 'Suggestions',
          href: '/admin/suggestions',
          icon: Lightbulb,
          tab: 'admin',
          adminSubTab: 'suggestions',
        },
      ],
    });
  }

  return sections;
}

export function isSidebarItemActive(
  item: SidebarNavItem,
  activeTab: AppTab,
  adminSubTab?: AdminSubTab,
  managerSubTab?: ManagerSubTab
): boolean {
  if (item.tab !== activeTab) return false;
  if (item.tab === 'admin' && item.adminSubTab) return adminSubTab === item.adminSubTab;
  if (item.tab === 'manager' && item.managerSubTab) return managerSubTab === item.managerSubTab;
  return true;
}
