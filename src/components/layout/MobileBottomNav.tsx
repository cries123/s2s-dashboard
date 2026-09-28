import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart2,
  Bell,
  Calendar,
  CalendarClock,
  Car,
  Circle,
  Layers,
  Lightbulb,
  LucideIcon,
  RefreshCw,
  ScrollText,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  UserCog,
  UserPlus,
  Settings,
  Users,
  FileText,
  LayoutDashboard,
  Wrench,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

export type MobileNavSectionId = 'home' | 'sales' | 'service' | 'competitions' | 'reports' | 'manager' | 'admin';

export interface MobileNavSubItem {
  tabId: string;
  label: string;
  href: string;
  badge?: number;
  managerSubTab?: 'operations' | 'preferences' | 'team' | 'logs';
  adminSubTab?: string;
}

export interface MobileNavSection {
  id: MobileNavSectionId;
  label: string;
  icon: LucideIcon;
  items: MobileNavSubItem[];
}

export interface MobileNavSelection {
  tab: string;
  managerSubTab?: 'operations' | 'preferences' | 'team' | 'logs';
  adminSubTab?: string;
}

interface MobileBottomNavProps {
  activeTab: string;
  managerSubTab?: 'operations' | 'preferences' | 'team' | 'logs';
  adminSubTab?: string;
  sections: MobileNavSection[];
  onNavigate: (selection: MobileNavSelection) => void;
}

/**
 * The lit tab is whichever section actually lists the current page. This used
 * to be a hand-kept map that went stale whenever a page was added, and its
 * fallback lit Home — so Sales to service, every admin screen and Settings all
 * showed "Home" as the current section. A page no section lists (Settings,
 * reached from the top bar) now lights nothing, which is the truth.
 */
function resolveActiveSection(
  activeTab: string,
  sections: MobileNavSection[]
): MobileNavSectionId | null {
  return sections.find((section) => section.items.some((item) => item.tabId === activeTab))?.id ?? null;
}

/**
 * One icon per destination. Every item in the menu must be listed here — the
 * Manager and Admin entries all share a tabId ('manager' / 'admin') and are told
 * apart by their sub-tab, so they are keyed by that instead.
 *
 * Icons have to differ from each other to be worth drawing at all: the whole
 * Admin list, plus Open ROs and Schedule, used to miss the lookup and fall back
 * to one shared magnifying glass.
 */
const SUB_ITEM_ICONS: Record<string, LucideIcon> = {
  home: LayoutDashboard,
  add: UserPlus,
  'vin-search': Car,
  search: Search,
  alerts: Bell,
  'open-ros': Wrench,
  dispatch: Layers,
  'pot-of-gold': Trophy,
  appointments: Calendar,
  schedule: CalendarClock,
  'sales-performance': BarChart2,
  forecast: TrendingUp,
  'manager:operations': Settings,
  'manager:preferences': SlidersHorizontal,
  'manager:team': Users,
  'manager:logs': FileText,
  'admin:master-users': UserCog,
  'admin:logs': ScrollText,
  'admin:suggestions': Lightbulb,
  'admin:import-health': Activity,
  'admin:pbs-sync': RefreshCw,
  webdcs: Bell,
};

function subItemIcon(item: MobileNavSubItem): LucideIcon {
  const subTab = item.managerSubTab ?? item.adminSubTab;
  // A neutral dot, not a magnifying glass — an unmapped item should look like
  // nothing in particular rather than claim to be a search.
  return SUB_ITEM_ICONS[subTab ? `${item.tabId}:${subTab}` : item.tabId] ?? Circle;
}

function isSubItemActive(
  item: MobileNavSubItem,
  activeTab: string,
  managerSubTab?: 'operations' | 'preferences' | 'team' | 'logs',
  adminSubTab?: string
): boolean {
  if (item.tabId !== activeTab) return false;
  if (item.tabId === 'manager' && item.managerSubTab) {
    return managerSubTab === item.managerSubTab;
  }
  if (item.tabId === 'admin' && item.adminSubTab) {
    return adminSubTab === item.adminSubTab;
  }
  return true;
}

export function MobileBottomNav({ activeTab, managerSubTab, adminSubTab,
  sections,
  onNavigate,
}: MobileBottomNavProps) {
  const activeSection = useMemo(
    () => resolveActiveSection(activeTab, sections),
    [activeTab, sections]
  );
  const [expandedSection, setExpandedSection] = useState<MobileNavSectionId | null>(null);

  const openSection = (sectionId: MobileNavSectionId) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    if (section.items.length === 1) {
      const only = section.items[0];
      onNavigate({ tab: only.tabId, managerSubTab: only.managerSubTab, adminSubTab: only.adminSubTab });
      setExpandedSection(null);
      return;
    }

    setExpandedSection((current) => (current === sectionId ? null : sectionId));
  };

  const handleSelect = (item: MobileNavSubItem) => {
    onNavigate({ tab: item.tabId, managerSubTab: item.managerSubTab, adminSubTab: item.adminSubTab });
    setExpandedSection(null);
  };

  const expanded = sections.find((s) => s.id === expandedSection);

  return (
    <>
      <AnimatePresence>
        {expanded && expanded.items.length > 1 && (
          <>
            <motion.button
              type="button"
              aria-label="Close navigation menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-[75] bg-black/40"
              onClick={() => setExpandedSection(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="lg:hidden fixed inset-x-0 z-[85] px-3"
              style={{ bottom: 'calc(4.25rem + 1px + env(safe-area-inset-bottom, 0px))' }}
            >
              <div
                className="mx-auto max-w-lg rounded-lg border overflow-hidden"
                style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)', boxShadow: '0 -4px 24px rgba(0,0,0,0.16)' }}
              >
                <div className="pl-4 pr-1 border-b flex items-center justify-between">
                  <span className="text-sm font-semibold">{expanded.label}</span>
                  <button
                    type="button"
                    onClick={() => setExpandedSection(null)}
                    className="link-text text-sm px-3 min-h-[44px] inline-flex items-center"
                  >
                    Done
                  </button>
                </div>
                {/* Tall enough for the Manage list (10 items) without slicing the last row in half. */}
                <div className="max-h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom,0px)-7rem)] overflow-y-auto overscroll-contain">
                  {expanded.items.map((item) => {
                    const Icon = subItemIcon(item);
                    const isActive = isSubItemActive(item, activeTab, managerSubTab, adminSubTab);

                    return (
                      <button
                        key={`${item.tabId}-${item.managerSubTab ?? item.href}`}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn('list-row touch-manipulation', isActive && 'text-brand-primary')}
                      >
                        <Icon
                          size={18}
                          className="shrink-0"
                          style={isActive ? undefined : { color: 'var(--color-text-secondary)' }}
                        />
                        <span className={cn('flex-1 min-w-0 text-sm truncate', isActive && 'font-semibold')}>
                          {item.label}
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="badge badge-error shrink-0">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                        <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-[80] border-t"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          backgroundColor: 'var(--color-surface-card)',
          borderColor: 'var(--color-surface-border)',
        }}
        aria-label="Primary navigation"
      >
        <div
          className="grid h-[4.25rem] max-w-lg mx-auto px-0.5 gap-0.5"
          style={{ gridTemplateColumns: `repeat(${Math.max(sections.length, 1)}, minmax(0, 1fr))` }}
        >
          {sections.map(({ id, label, icon: Icon, items }) => {
            const isSectionActive = activeSection === id;
            const isExpanded = expandedSection === id;
            const alertBadge = items.find((i) => i.tabId === 'alerts')?.badge ?? 0;

            return (
              <button
                key={id}
                type="button"
                onClick={() => openSection(id)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 mx-0.5 transition-colors touch-manipulation min-h-[44px]',
                  isSectionActive || isExpanded
                    ? 'text-brand-primary'
                    : 'text-text-secondary active:text-slate-300'
                )}
              >
                <span className="relative">
                  <Icon size={21} strokeWidth={isSectionActive || isExpanded ? 2.25 : 1.75} />
                  {alertBadge > 0 && id === 'service' && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ba0517] text-[11px] font-semibold flex items-center justify-center" style={{ color: '#fff' }}>
                      {alertBadge > 99 ? '99+' : alertBadge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-medium leading-none text-center px-0.5',
                    (isSectionActive || isExpanded) && 'text-brand-primary font-semibold'
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
