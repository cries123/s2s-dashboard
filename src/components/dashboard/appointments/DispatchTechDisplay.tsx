import React, { useMemo } from 'react';
import { Moon, X } from 'lucide-react';
import type { DispatchRepairOrder, PerformanceAdvisorSlot } from '../../../types';
import { cn } from '../../../lib/utils';
import { normalizeTechNumber, resolveTechDisplayName } from '../../../lib/dispatchTechRoster';
import { sortDispatchOrdersByRoNumber } from '../../../lib/dispatchRoSort';

const TECHS_PER_ROW = 7;

interface DispatchTechDisplayProps {
  roster: PerformanceAdvisorSlot[];
  activeOrders: DispatchRepairOrder[];
  renderCard: (ro: DispatchRepairOrder) => React.ReactNode;
  onClose: () => void;
  showExit: boolean;
}

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function DispatchTechDisplay({
  roster,
  activeOrders,
  renderCard,
  onClose,
  showExit,
}: DispatchTechDisplayProps) {
  const downInShopOrders = useMemo(
    () =>
      sortDispatchOrdersByRoNumber(
        activeOrders.filter((ro) => ro.department === 'down_in_shop')
      ),
    [activeOrders]
  );

  const ordersByTech = useMemo(() => {
    const map = new Map<string, DispatchRepairOrder[]>();
    for (const ro of activeOrders) {
      if (ro.department === 'down_in_shop') continue;
      const key = normalizeTechNumber(ro.techNumber);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(ro);
      map.set(key, list);
    }
    for (const [key, list] of map) {
      map.set(key, sortDispatchOrdersByRoNumber(list));
    }
    return map;
  }, [activeOrders]);

  const techRows = useMemo(() => chunkRows(roster, TECHS_PER_ROW), [roster]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950 text-slate-100 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Dispatch tech display"
    >
      <div className="relative flex flex-col flex-1 min-h-0 p-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:border-slate-500 transition-opacity duration-500',
            showExit ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          title="Exit tech display (Esc)"
        >
          <X size={12} />
          Exit
        </button>

        <div className="shrink-0 px-2 pt-1">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-indigo-400">
            Tech dispatch view
          </p>
          <h2 className="text-sm font-black text-white uppercase tracking-wide">
            Repair orders by technician
          </h2>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          {techRows.map((row, rowIndex) => (
            <div
              key={`tech-row-${rowIndex}`}
              className="grid grid-cols-7 gap-1.5 flex-1 min-h-0"
            >
              {row.map((tech) => {
                const key = normalizeTechNumber(tech.id);
                const list = ordersByTech.get(key) ?? [];
                return (
                  <div
                    key={tech.id}
                    className="flex flex-col min-w-0 min-h-0 rounded-xl border border-slate-800/80 bg-slate-900/50 overflow-hidden"
                  >
                    <div className="shrink-0 px-2 py-1.5 border-b border-slate-800/80 bg-slate-950/80">
                      <p className="text-[8px] font-black uppercase tracking-wider text-indigo-400 truncate">
                        #{tech.id}
                      </p>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-white truncate leading-tight">
                          {resolveTechDisplayName(tech.id, [tech])}
                        </span>
                        <span className="text-[8px] font-black tabular-nums px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                          {list.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar p-1 space-y-1">
                      {list.length === 0 ? (
                        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-600 text-center py-3">
                          —
                        </p>
                      ) : (
                        list.map((ro) => <React.Fragment key={ro.id}>{renderCard(ro)}</React.Fragment>)
                      )}
                    </div>
                  </div>
                );
              })}
              {row.length < TECHS_PER_ROW
                ? Array.from({ length: TECHS_PER_ROW - row.length }).map((_, i) => (
                    <div
                      key={`pad-${rowIndex}-${i}`}
                      className="rounded-xl border border-dashed border-slate-900/80 bg-slate-950/20"
                    />
                  ))
                : null}
            </div>
          ))}
        </div>

        <div className="shrink-0 flex flex-col max-h-[28vh] min-h-[120px] rounded-xl border border-amber-500/30 bg-slate-900/60 overflow-hidden">
          <div className="shrink-0 px-3 py-2 border-b border-amber-500/20 bg-amber-950/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Moon size={12} className="text-amber-400 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-wider text-amber-200">
                Down in Shop
              </span>
            </div>
            <span className="text-[8px] font-black tabular-nums px-2 py-0.5 rounded bg-amber-950/50 text-amber-300">
              {downInShopOrders.length}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-2">
            {downInShopOrders.length === 0 ? (
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-600 text-center py-4">
                No vehicles down in shop
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
                {downInShopOrders.map((ro) => (
                  <div key={ro.id}>{renderCard(ro)}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
