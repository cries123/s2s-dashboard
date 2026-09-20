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

const SECTION_TAB_MAP: Record<MobileNavSectionId, string[]> = {
  home: ['home'],
  sales: ['add', 'vin-search'],
  service: ['search', 'alerts', 'schedule', 'dispatch', 'open-ros', 'pot-of-gold'],
  competitions: [],
  reports: ['appointments', 'forecast', 'sales-performance'],
  manager: ['manager'],
  admin: ['admin'],
};

function resolveActiveSection(
  activeTab: string,
  sections: MobileNavSection[]
): MobileNavSectionId | null {
  for (const section of sections) {
    if (SECTION_TAB_MAP[section.id].includes(activeTab)) {
      return section.id;
    }
  }
  return sections[0]?.id ?? null;
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
              className="lg:hidden fixed inset-0 z-[75] bg-slate-950/60 backdrop-blur-[2px]"
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
              <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-slate-800/50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 normal-case tracking-normal">
                    {expanded.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedSection(null)}
                    className="text-xs font-semibold normal-case tracking-normal text-slate-400 hover:text-white px-3 min-h-[44px] inline-flex items-center"
                  >
                    Close
                  </button>
                </div>
                <div className="p-2 max-h-[min(50vh,360px)] overflow-y-auto no-scrollbar">
                  {expanded.items.map((item) => {
                    const Icon = subItemIcon(item);
                    const isActive = isSubItemActive(item, activeTab, managerSubTab, adminSubTab);

                    return (
                      <button
                        key={`${item.tabId}-${item.managerSubTab ?? item.href}`}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'w-full flex items-center justify-between gap-3 px-3 py-3.5 rounded-xl text-left transition-colors touch-manipulation',
                          isActive
                            ? 'bg-brand-primary/15 text-brand-primary'
                            : 'text-slate-300 hover:bg-white/5 active:bg-white/10'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            size={18}
                            className={cn('shrink-0', isActive ? 'text-brand-primary' : 'text-slate-500')}
                          />
                          <span className="text-xs font-semibold normal-case tracking-wide truncate">
                            {item.label}
                          </span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-xs font-semibold flex items-center justify-center">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
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
        className="lg:hidden fixed bottom-0 inset-x-0 z-[80] border-t border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.35)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
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
                  'relative flex flex-col items-center justify-center gap-0.5 rounded-xl mx-0.5 transition-colors touch-manipulation min-h-[44px]',
                  isSectionActive || isExpanded
                    ? 'text-brand-primary'
                    : 'text-slate-500 active:text-slate-300'
                )}
              >
                <span className="relative">
                  <Icon size={19} strokeWidth={isSectionActive || isExpanded ? 2.5 : 2} />
                  {alertBadge > 0 && id === 'service' && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-xs font-semibold flex items-center justify-center">
                      {alertBadge > 99 ? '99+' : alertBadge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold normal-case tracking-wide leading-none text-center px-0.5',
                    (isSectionActive || isExpanded) && 'text-brand-primary'
                  )}
                >
                  {label}
                </span>
                {(isSectionActive || isExpanded) && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand-primary" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
