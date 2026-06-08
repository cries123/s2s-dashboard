import React from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { DepartmentColumnId, DispatchRepairOrder } from '../../../types';
import { cn } from '../../../lib/utils';

export type MobileDispatchTab = 'intake' | DepartmentColumnId;

interface DispatchMobileBoardProps {
  activeTab: MobileDispatchTab;
  onTabChange: (tab: MobileDispatchTab) => void;
  displayColumns: { id: DepartmentColumnId; label: string; shortLabel: string }[];
  ticketsByColumn: Record<DepartmentColumnId, DispatchRepairOrder[]>;
  intakeForm: React.ReactNode;
  renderCard: (ro: DispatchRepairOrder) => React.ReactNode;
  laneCapacity: Partial<Record<DepartmentColumnId, number>>;
}

export function DispatchMobileBoard({
  activeTab,
  onTabChange,
  displayColumns,
  ticketsByColumn,
  intakeForm,
  renderCard,
  laneCapacity,
}: DispatchMobileBoardProps) {
  const tabs: { id: MobileDispatchTab; label: string; count?: number }[] = [
    { id: 'intake', label: 'Intake' },
    ...displayColumns.map((col) => ({
      id: col.id,
      label: col.shortLabel,
      count: (ticketsByColumn[col.id] || []).length,
    })),
  ];

  const tabIndex = tabs.findIndex((t) => t.id === activeTab);
  const goPrev = () => {
    if (tabIndex > 0) onTabChange(tabs[tabIndex - 1].id);
  };
  const goNext = () => {
    if (tabIndex < tabs.length - 1) onTabChange(tabs[tabIndex + 1].id);
  };

  const activeList =
    activeTab === 'intake' ? [] : ticketsByColumn[activeTab as DepartmentColumnId] || [];
  const cap = activeTab !== 'intake' ? laneCapacity[activeTab as DepartmentColumnId] : 0;

  return (
    <div className="md:hidden space-y-4 pb-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={tabIndex <= 0}
          className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 disabled:opacity-30"
          aria-label="Previous lane"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 overflow-x-auto flex gap-1.5 py-1 scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'shrink-0 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-colors',
                activeTab === tab.id
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
              )}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="ml-1 tabular-nums text-amber-300">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={tabIndex >= tabs.length - 1}
          className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 disabled:opacity-30"
          aria-label="Next lane"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {activeTab === 'intake' ? (
        intakeForm
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Inbox size={14} className="text-indigo-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                {displayColumns.find((c) => c.id === activeTab)?.label || activeTab}
              </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 tabular-nums">
              {cap && cap > 0 ? `${activeList.length}/${cap}` : activeList.length} tickets
            </span>
          </div>
          {activeList.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-600 py-12 border border-dashed border-slate-800 rounded-2xl">
              No tickets in this lane
            </p>
          ) : (
            <div className="space-y-3">
              {activeList.map((ro) => (
                <div key={ro.id}>{renderCard(ro)}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
