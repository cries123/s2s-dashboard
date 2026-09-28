import React from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { dispatchLaneLabel } from '../../../lib/dispatchConfig';
import { tidyPersonName } from '../../ui/Panel';
import type { OverdueDispatchOrder } from '../../../lib/dispatchPromiseTime';
import type { DispatchRepairOrder } from '../../../types';

interface DispatchOverdueAlertProps {
  overdue: OverdueDispatchOrder[];
  onSelectRo?: (ro: DispatchRepairOrder) => void;
  compact?: boolean;
}

/**
 * Repair orders past their promise time. It was a red gradient box with a pulsing
 * icon; now it is a list like any other, with a thin red edge on each late ticket,
 * so red still stands out without taking over the page.
 */
export function DispatchOverdueAlert({ overdue, onSelectRo, compact = false }: DispatchOverdueAlertProps) {
  if (overdue.length === 0) return null;

  const countLabel = overdue.length === 1 ? '1 repair order' : `${overdue.length} repair orders`;

  if (compact) {
    return (
      <span role="alert" className="badge badge-error inline-flex items-center gap-1.5">
        <AlertTriangle size={12} className="shrink-0" />
        {countLabel} past promise
      </span>
    );
  }

  return (
    <section role="alert" className="card-base overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--color-row-divider)' }}>
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--color-badge-error-bg)', color: 'var(--color-badge-error-text)' }}
          aria-hidden="true"
        >
          <AlertTriangle size={15} />
        </span>
        <h2 className="flex-1 text-sm font-semibold">Past promise time</h2>
        <span className="badge badge-error">{overdue.length}</span>
      </header>
      {overdue.slice(0, 5).map(({ ro, state }) => (
        <button
          key={ro.id}
          type="button"
          onClick={() => onSelectRo?.(ro)}
          className="list-row"
          style={{ boxShadow: 'inset 3px 0 0 var(--color-badge-error-text)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-primary truncate">
              RO {ro.roNumber} · {tidyPersonName(ro.customerName || ro.customerLastName) || 'Guest'}
            </p>
            <p className="crm-label truncate">{dispatchLaneLabel(ro.department)}</p>
          </div>
          <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--color-badge-error-text)' }}>
            {state.countdownLabel}
          </span>
          <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
        </button>
      ))}
      {overdue.length > 5 ? <p className="crm-label px-4 py-2.5">{overdue.length - 5} more on the board</p> : null}
    </section>
  );
}
