import {
  BarChart2,
  Calendar,
  Shield,
  Trophy,
  UserPlus,
} from 'lucide-react';
import type { MobileNavSection } from '../components/layout/MobileBottomNav';
import type { User } from '../types';
import { canSeeManagerPanel } from './rbac';

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
  activeAlertsCount: number;
}

export function buildMobileNavSections({
  user,
  modules,
  currentDealershipId,
  enableDispatchTab,
  activeAlertsCount,
}: BuildMobileNavSectionsArgs): MobileNavSection[] {
  const sections: MobileNavSection[] = [];

  const salesItems: MobileNavSection['items'] = [
    { tabId: 'add', label: 'Onboard', href: '/sales/onboard' },
  ];
  if (modules.showVinSearchTab) {
    salesItems.push({ tabId: 'vin-search', label: 'VIN Search', href: '/sales/vin-search' });
  }
  sections.push({ id: 'sales', label: 'Sales', icon: UserPlus, items: salesItems });

  const serviceItems: MobileNavSection['items'] = [
    { tabId: 'search', label: 'Directory', href: '/service/directory' },
    { tabId: 'alerts', label: 'Alerts', href: '/service/alerts', badge: activeAlertsCount },
  ];
  if (enableDispatchTab) {
    serviceItems.push({ tabId: 'dispatch', label: 'Dispatch', href: '/service/dispatch' });
  }
  sections.push({ id: 'service', label: 'Service', icon: Calendar, items: serviceItems });

  if (currentDealershipId === 'hyundai' && modules.showPotOfGoldTab) {
    sections.push({
      id: 'competitions',
      label: 'Competition',
      icon: Trophy,
      items: [{ tabId: 'pot-of-gold', label: 'Pot of Gold', href: '/competitions/pot-of-gold' }],
    });
  }

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

  if (canSeeManagerPanel(user)) {
    sections.push({
      id: 'manager',
      label: 'Manager',
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
      ],
    });
  }

  return sections;
}
