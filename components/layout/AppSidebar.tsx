import React, { useCallback, useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, LayoutDashboard } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  buildSidebarNav,
  isSidebarItemActive,
  type SidebarNavItem,
} from '../../lib/sidebarNav';
import type { AdminSubTab, AppTab, ManagerSubTab } from '../../lib/appNavigation';
import { DealershipSwitcher } from './DealershipSwitcher';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 's2s-sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    return stored === 'true';
  } catch {
    /* ignore — fall through to default */
  }
  return false;
}

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
  showOpenRosTab: boolean;
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
  showOpenRosTab,
  showManager,
  showAdmin,
  activeAlertsCount,
  canSwitchDealership,
  onDealershipChange,
  onNavigate,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed());

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      /* best-effort persistence only */
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const sections = buildSidebarNav({
    modules,
    currentDealershipId,
    enableDispatchTab,
    showOpenRosTab,
    showManager,
    showAdmin,
    activeAlertsCount,
  });

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col shrink-0 app-sidebar border-r h-screen sticky top-0 min-h-0 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div
        className={cn('py-4 border-b space-y-3', collapsed ? 'px-2' : 'px-4')}
        style={{ borderColor: 'var(--color-sidebar-border)' }}
      >
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <div
            className="w-9 h-9 rounded-lg bg-brand-primary flex items-center justify-center text-white shrink-0"
            title={collapsed ? 'Service to Sales' : undefined}
          >
            <LayoutDashboard size={18} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">Service to Sales</p>
              {!canSwitchDealership && (
                <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {dealershipName}
                </p>
              )}
            </div>
          )}
        </div>
        {canSwitchDealership && !collapsed && (
          <DealershipSwitcher
            value={currentDealershipId || 'hyundai'}
            onChange={onDealershipChange}
          />
        )}
      </div>

      <nav
        className={cn(
          'flex-1 min-h-0 overflow-y-auto no-scrollbar py-4 space-y-6',
          collapsed ? 'px-2' : 'px-3'
        )}
      >
        {sections.map((section) => (
          <div key={section.id}>
            {!collapsed && (
              <p
                className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isSidebarItemActive(item, activeTab, adminSubTab, managerSubTab);
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(item);
                      }}
                      className={cn(
                        'flex items-center rounded-lg text-sm font-medium transition-colors',
                        collapsed ? 'justify-center py-2.5 relative' : 'gap-2.5 px-2.5 py-2',
                        active && 'bg-brand-primary/10 text-brand-primary'
                      )}
                      style={!active ? { color: 'var(--color-text-primary)' } : undefined}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <span className="relative shrink-0">
                        <Icon size={16} />
                        {collapsed && item.badge !== undefined && item.badge > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 text-[9px] font-semibold bg-rose-500 text-white px-1 py-0 rounded-full min-w-[0.9rem] h-[0.9rem] leading-[0.9rem] text-center"
                          >
                            {item.badge > 9 ? '9+' : item.badge}
                          </span>
                        )}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="truncate flex-1">{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span className="text-[10px] font-semibold bg-rose-500 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="py-3 px-2 border-t" style={{ borderColor: 'var(--color-sidebar-border)' }}>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center rounded-lg text-sm font-medium transition-colors w-full',
            collapsed ? 'justify-center py-2.5' : 'gap-2.5 px-2.5 py-2'
          )}
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {collapsed ? <ChevronsRight size={16} className="shrink-0" /> : <ChevronsLeft size={16} className="shrink-0" />}
          {!collapsed && <span className="truncate flex-1">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
