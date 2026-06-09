import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  formatTechLabelWithCount,
  normalizeTechNumber,
  resolveTechDisplayName,
} from '../../../lib/dispatchTechRoster';
import type { PerformanceAdvisorSlot } from '../../../types';

interface DispatchTechSelectorProps {
  techNumber: string;
  roster: PerformanceAdvisorSlot[];
  techRoCounts: Map<string, number>;
  onSelect: (techId: string) => void;
  compact?: boolean;
  className?: string;
}

export function DispatchTechSelector({
  techNumber,
  roster,
  techRoCounts,
  onSelect,
  compact,
  className,
}: DispatchTechSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const displayLabel = formatTechLabelWithCount(techNumber, roster, techRoCounts);

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'w-full text-left rounded border transition-colors',
          compact
            ? 'px-1.5 py-1 bg-slate-950/40 border-slate-800/50 hover:border-indigo-500/40'
            : 'px-2 py-1.5 bg-slate-950/50 border-slate-800/60 hover:border-indigo-500/40 hover:bg-indigo-950/20'
        )}
      >
        <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold flex items-center gap-1">
          <Wrench size={9} className="text-indigo-400/80" />
          Assigned tech
        </span>
        <span className="text-slate-200 font-medium block mt-0.5 truncate flex items-center justify-between gap-1">
          <span className="truncate">{displayLabel}</span>
          <ChevronDown size={12} className={cn('shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-indigo-500/30 bg-slate-950 shadow-2xl shadow-black/60 py-1"
          role="listbox"
        >
          {roster.map((row) => {
            const key = normalizeTechNumber(row.id);
            const count = techRoCounts.get(key) ?? 0;
            const isActive = normalizeTechNumber(techNumber) === key;
            return (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onSelect(row.id);
                  setOpen(false);
                }}
                className={cn(
                  'w-full px-2.5 py-2 text-left text-[10px] hover:bg-indigo-500/15 transition-colors',
                  isActive && 'bg-indigo-500/10 text-indigo-200'
                )}
              >
                <span className="font-semibold text-slate-100">
                  {resolveTechDisplayName(row.id, roster)}
                  {count > 0 ? ` (${count})` : ''}
                </span>
                <span className="text-slate-500 block font-mono text-[9px] mt-0.5">#{row.id}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
