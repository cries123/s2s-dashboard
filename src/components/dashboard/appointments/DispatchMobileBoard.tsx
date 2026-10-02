import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { DepartmentColumnId, DispatchRepairOrder } from '../../../types';
import { cn } from '../../../lib/utils';
import type { DispatchProductionLane } from '../../../lib/dispatchConfig';

export type MobileDispatchTab = 'intake' | DispatchProductionLane;

interface DispatchMobileBoardProps {
  activeTab: MobileDispatchTab;
  onTabChange: (tab: MobileDispatchTab) => void;
  displayColumns: { id: DispatchProductionLane; label: string; shortLabel: string }[];
  ticketsByColumn: Record<DepartmentColumnId, DispatchRepairOrder[]>;
  intakeForm: React.ReactNode;
  renderCard: (ro: DispatchRepairOrder) => React.ReactNode;
  laneCapacity: Partial<Record<DepartmentColumnId, number>>;
}

/**
 * Dispatch on a phone: lane chips across the top, then that lane's tickets.
 * The intake form used to fill the first screen; it now opens from a
 * "New repair order" button, so the waiting queue is what you see first.
 */
export function DispatchMobileBoard({
  activeTab,
  onTabChange,
  displayColumns,
  ticketsByColumn,
  intakeForm,
  renderCard,
  laneCapacity,
}: DispatchMobileBoardProps) {
  const [intakeOpen, setIntakeOpen] = useState(false);
  const queueTickets = ticketsByColumn.unassigned || [];

  const tabs: { id: MobileDispatchTab; label: string; count: number }[] = [
    { id: 'intake', label: 'Waiting', count: queueTickets.length },
    ...displayColumns.map((col) => ({
      id: col.id,
      label: col.shortLabel,
      count: (ticketsByColumn[col.id] || []).length,
    })),
  ];

  const activeList =
    activeTab === 'intake' ? queueTickets : ticketsByColumn[activeTab as DepartmentColumnId] || [];
  const cap = activeTab !== 'intake' ? laneCapacity[activeTab as DepartmentColumnId] : 0;
  const laneName =
    activeTab === 'intake' ? 'Waiting for a lane' : displayColumns.find((c) => c.id === activeTab)?.label || activeTab;

  return (
    <div className="md:hidden space-y-3 pb-6">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-0.5" role="tablist" aria-label="Lanes">
        {tabs.map((tab) => {
          const on = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'shrink-0 px-3.5 min-h-[44px] rounded-full text-sm border transition-colors whitespace-nowrap',
                on ? 'bg-brand-primary border-brand-primary font-semibold' : ''
              )}
              style={
                on
                  ? { color: '#fff' }
                  : { borderColor: 'var(--color-input-border)', backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }
              }
            >
              {tab.label}
              {tab.count > 0 ? <span className={cn('ml-1.5 tabular-nums', on ? '' : 'opacity-60')}>{tab.count}</span> : null}
            </button>
          );
        })}
      </div>

      {activeTab === 'intake' ? (
        intakeOpen ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">New repair order</h2>
              <button type="button" onClick={() => setIntakeOpen(false)} className="link-text text-sm inline-flex items-center gap-1 min-h-[44px]">
                <X size={15} /> Close
              </button>
            </div>
            {intakeForm}
          </div>
        ) : (
          <button type="button" onClick={() => setIntakeOpen(true)} className="btn-primary w-full">
            <Plus size={16} /> New repair order
          </button>
        )
      ) : null}

      <div className="flex items-baseline justify-between px-0.5">
        <h2 className="text-sm font-semibold">{laneName}</h2>
        <span className="crm-label tabular-nums">
          {cap && cap > 0 ? `${activeList.length} of ${cap}` : `${activeList.length} ${activeList.length === 1 ? 'ticket' : 'tickets'}`}
        </span>
      </div>

      {activeList.length === 0 ? (
        <p className="card-base crm-label text-center py-10">
          {activeTab === 'intake' ? 'Nothing waiting.' : 'No tickets in this lane.'}
        </p>
      ) : (
        <div className="space-y-3">
          {activeList.map((ro) => (
            <div key={ro.id}>{renderCard(ro)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
