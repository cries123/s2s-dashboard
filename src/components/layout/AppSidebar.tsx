import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  buildSidebarNav,
  isSidebarItemActive,
  type SidebarNavItem,
} from '../../lib/sidebarNav';
import type { AdminSubTab, AppTab, ManagerSubTab } from '../../lib/appNavigation';
import { DealershipSwitcher } from './DealershipSwitcher';

interface AppSidebarProps {
  dealershipName: string;
  activeTab: AppTab;
  adminSubTab?: AdminSubTab;
  managerSubTab?: ManagerSubTab;
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
  canSwitchDealership: boolean;
  onDealershipChange: (id: string) => void;
  onNavigate: (item: SidebarNavItem) => void;
}

export function AppSidebar({
  dealershipName,
  activeTab,
  adminSubTab,
  managerSubTab,
  modules,
  currentDealershipId,
  enableDispatchTab,
  enableBundleMenus,
  showManager,
  showAdmin,
  activeAlertsCount,
  canSwitchDealership,
  onDealershipChange,
  onNavigate,
}: AppSidebarProps) {
  const sections = buildSidebarNav({
    modules,
    currentDealershipId,
    enableDispatchTab,
    enableBundleMenus,
    showManager,
    showAdmin,
    activeAlertsCount,
  });

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 app-sidebar border-r h-screen sticky top-0">
      <div className="px-4 py-4 border-b space-y-3" style={{ borderColor: 'var(--color-sidebar-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-primary flex items-center justify-center text-white shrink-0">
            <LayoutDashboard size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Service to Sales</p>
            {!canSwitchDealership && (
              <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {dealershipName}
              </p>
            )}
          </div>
        </div>
        {canSwitchDealership && (
          <DealershipSwitcher
            value={currentDealershipId || 'hyundai'}
            onChange={onDealershipChange}
          />
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section) => (
          <div key={section.id}>
            <p
              className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isSidebarItemActive(item, activeTab, adminSubTab, managerSubTab);
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(item);
                      }}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-brand-primary/10 text-brand-primary'
                          : 'hover:bg-white/5'
                      )}
                      style={!active ? { color: 'var(--color-text-primary)' } : undefined}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="text-[10px] font-semibold bg-rose-500 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                          {item.badge}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
