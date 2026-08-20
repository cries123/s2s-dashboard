import React, { useEffect, useId, useRef, useState } from 'react';
import { Search, X, CheckCircle2, Clock } from 'lucide-react';
import type { DispatchRepairOrder } from '../../../types';
import { dispatchLaneLabel } from '../../../lib/dispatchConfig';
import { searchDispatchOrders } from '../../../lib/dispatchRoSearch';
import { cn } from '../../../lib/utils';

interface DispatchRoSearchProps {
  orders: DispatchRepairOrder[];
  selectedRoId: string | null;
  onSelectRo: (ro: DispatchRepairOrder) => void;
  onClear: () => void;
}

export function DispatchRoSearch({
  orders,
  selectedRoId,
  onSelectRo,
  onClear,
}: DispatchRoSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const matches = searchDispatchOrders(orders, query);

  useEffect(() => {
    if (!selectedRoId) return;
    const selected = orders.find((ro) => ro.id === selectedRoId);
    if (selected) setQuery(selected.roNumber);
  }, [orders, selectedRoId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelect = (ro: DispatchRepairOrder) => {
    setQuery(ro.roNumber);
    setOpen(false);
    onSelectRo(ro);
  };

  const handleClear = () => {
    setQuery('');
    setOpen(false);
    onClear();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (matches.length > 0) {
      handleSelect(matches[0]);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <form onSubmit={handleSubmit}>
        <label htmlFor="dispatch-ro-search" className="sr-only">
          Search repair order
        </label>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none"
          />
          <input
            id="dispatch-ro-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              if (!event.target.value.trim()) onClear();
            }}
            onFocus={() => {
              if (query.trim()) setOpen(true);
            }}
            placeholder="Search RO #, tag, customer, VIN…"
            autoComplete="off"
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-controls={listboxId}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          />
          {query ? (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Clear RO search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </form>

      {open && query.trim() ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl shadow-black/40 overflow-hidden"
        >
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-slate-500">No repair orders match that search.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80">
              {matches.slice(0, 12).map((ro) => (
                <li key={ro.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedRoId === ro.id}
                    onClick={() => handleSelect(ro)}
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-indigo-500/10 transition-colors',
                      selectedRoId === ro.id && 'bg-indigo-500/15'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">{ro.roNumber}</span>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                        {dispatchLaneLabel(ro.department)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
                      <span className="text-slate-400 truncate">
                        {ro.customerName || ro.customerLastName || 'Guest'}
                        {ro.tagNumber ? ` · TAG ${ro.tagNumber}` : ''}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 shrink-0 font-black uppercase tracking-wider',
                          ro.isCompleted ? 'text-emerald-400' : 'text-amber-300'
                        )}
                      >
                        {ro.isCompleted ? (
                          <>
                            <CheckCircle2 size={11} />
                            Done
                          </>
                        ) : (
                          <>
                            <Clock size={11} />
                            {ro.status}
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {matches.length > 12 ? (
            <p className="px-4 py-2 text-[10px] text-slate-500 dark:text-slate-600 border-t border-slate-200 dark:border-slate-800">
              Showing first 12 of {matches.length} matches — refine your search.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
