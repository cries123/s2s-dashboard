import {
  BarChart2,
  Calendar,
  LayoutDashboard,
  ClipboardList,
  Shield,
  Trophy,
  UserPlus,
} from 'lucide-react';
import type { MobileNavSection } from '../components/layout/MobileBottomNav';
import type { User } from '../types';
import { canAccessPrimaryAdminSettings, canSeeManagerPanel } from './rbac';

interface DashboardModules {
  showVinSearchTab: boolean;
  showForecastTab: boolean;
  showSalesPerformanceTab: boolean;
  showPotOfGoldTab: boolean;
}

interface BuildMobileNavSectionsArgs {
  user: User;
  modules: DashboardModules;
  currentDealershipId: string | null;
  enableDispatchTab: boolean;
  showOpenRosTab: boolean;
  activeAlertsCount: number;
}

export function buildMobileNavSections({
  user,
  modules,
  currentDealershipId,
  enableDispatchTab,
  showOpenRosTab,
  activeAlertsCount,
}: BuildMobileNavSectionsArgs): MobileNavSection[] {
  const sections: MobileNavSection[] = [];

  sections.push({
    id: 'home',
    label: 'Home',
    icon: LayoutDashboard,
    items: [{ tabId: 'home', label: 'Home', href: '/home' }],
  });

  const salesItems: MobileNavSection['items'] = [
    { tabId: 'add', label: 'Onboard', href: '/sales/onboard' },
  ];
  if (modules.showVinSearchTab) {
    salesItems.push({ tabId: 'vin-search', label: 'VIN Search', href: '/sales/vin-search' });
  }
  sections.push({ id: 'sales', label: 'Sales', icon: UserPlus, items: salesItems });

  // Schedule and Pot of Gold live with Service: they are things the drive does
  // during the day, not month-end reporting.
  const serviceItems: MobileNavSection['items'] = [
    { tabId: 'search', label: 'Directory', href: '/service/directory' },
    { tabId: 'alerts', label: 'Alerts', href: '/service/alerts', badge: activeAlertsCount },
    { tabId: 'schedule', label: 'Schedule', href: '/reports/schedule' },
  ];
  if (showOpenRosTab) {
    serviceItems.push({ tabId: 'open-ros', label: 'Open ROs', href: '/service/open-ros' });
  }
  if (enableDispatchTab) {
    serviceItems.push({ tabId: 'dispatch', label: 'Dispatch', href: '/service/dispatch' });
  }
  if (currentDealershipId === 'hyundai' && modules.showPotOfGoldTab) {
    serviceItems.push({ tabId: 'pot-of-gold', label: 'Pot of Gold', href: '/competitions/pot-of-gold' });
  }
  sections.push({ id: 'service', label: 'Service', icon: Calendar, items: serviceItems });

  const reportItems: MobileNavSection['items'] = [
    { tabId: 'appointments', label: 'Operations', href: '/reports/operations' },
  ];
  if (modules.showSalesPerformanceTab) {
    reportItems.push({
      tabId: 'sales-performance',
      label: 'Sales Performance',
      href: '/reports/sales-performance',
    });
  }
  if (modules.showForecastTab) {
    reportItems.push({ tabId: 'forecast', label: 'Forecast', href: '/reports/forecast' });
  }
  sections.push({ id: 'reports', label: 'Reports', icon: BarChart2, items: reportItems });

  const adminItems: MobileNavSection['items'] = canAccessPrimaryAdminSettings(user)
    ? [
        { tabId: 'admin', label: 'Master users', href: '/admin/master-users', adminSubTab: 'master-users' },
        { tabId: 'admin', label: 'Audit logs', href: '/admin/logs', adminSubTab: 'logs' },
        { tabId: 'admin', label: 'Suggestions', href: '/admin/suggestions', adminSubTab: 'suggestions' },
        { tabId: 'admin', label: 'Import health', href: '/admin/import-health', adminSubTab: 'import-health' },
        { tabId: 'admin', label: 'PBS sync', href: '/admin/pbs-sync', adminSubTab: 'pbs-sync' },
      ]
    : [];

  if (canSeeManagerPanel(user)) {
    sections.push({
      id: 'manager',
      label: 'Manage',
      icon: Shield,
      items: [
        {
          tabId: 'manager',
          label: 'Operation Settings',
          href: '/manager/operations',
          managerSubTab: 'operations',
        },
        {
          tabId: 'manager',
          label: 'Preferences',
          href: '/manager/preferences',
          managerSubTab: 'preferences',
        },
        {
          tabId: 'manager',
          label: 'Team Approvals',
          href: '/manager/team',
          managerSubTab: 'team',
        },
        {
          tabId: 'manager',
          label: 'Logs',
          href: '/manager/logs',
          managerSubTab: 'logs',
        },
        ...adminItems,
      ],
    });
  } else if (adminItems.length) {
    sections.push({ id: 'admin', label: 'Admin', icon: Shield, items: adminItems });
  }

  return sections;
}
