import React, { useMemo } from 'react';
import { Moon, Printer, X } from 'lucide-react';
import type { DispatchRepairOrder } from '../../../types';
import { computeDispatchMetrics, formatWaitMinutes } from '../../../lib/dispatchMetrics';
import { countOverdueOrders, formatDispatchPromiseClock } from '../../../lib/dispatchPromiseTime';
import { sortDispatchOrdersByRoNumber } from '../../../lib/dispatchRoSort';
import { isOvernightRo } from '../../../lib/dispatchTransitions';

interface DispatchEndOfDayReportProps {
  dealershipName: string;
  businessDate: string;
  orders: DispatchRepairOrder[];
  overdueGraceMinutes?: number;
  onClose: () => void;
}

export function DispatchEndOfDayReport({
  dealershipName,
  businessDate,
  orders,
  overdueGraceMinutes = 0,
  onClose,
}: DispatchEndOfDayReportProps) {
  const metrics = useMemo(
    () => computeDispatchMetrics(orders, businessDate, (ro) => isOvernightRo(ro, businessDate)),
    [orders, businessDate]
  );

  const downInShop = useMemo(
    () =>
      sortDispatchOrdersByRoNumber(
        orders.filter((o) => !o.isCompleted && o.department === 'down_in_shop')
      ),
    [orders]
  );

  const active = orders.filter((o) => !o.isCompleted);
  const overdueCount = countOverdueOrders(active, Date.now(), { overdueGraceMinutes });
  const downInShopLaneMinutes = metrics.avgLaneWaitMinutes.down_in_shop;

  const printReport = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 print:bg-white print:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="End of day dispatch report"
    >
      <div className="card-base max-w-lg w-full rounded-2xl border border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar print:max-h-none print:overflow-visible print:border-0 print:shadow-none print:bg-white print:text-black">
        <div className="hidden print:block border-b border-gray-300 pb-4 mb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">End of day</p>
          <h1 className="text-xl font-black text-black uppercase">Dispatch snapshot — down in shop</h1>
        </div>

        <div className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-primary">End of day</p>
            <h2 className="text-lg font-black text-white uppercase">Down in shop</h2>
            <p className="text-[10px] text-slate-500 mt-1">Overnight carryover snapshot for end-of-day closeout.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="text-sm text-slate-300 space-y-1 print:text-black">
          <p className="font-black text-white print:text-black">{dealershipName}</p>
          <p className="text-slate-500 print:text-gray-600">Business date: {businessDate}</p>
          <p className="text-slate-500 print:text-gray-600">Generated: {new Date().toLocaleString()}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Down in shop', value: String(downInShop.length) },
            { label: 'Written today', value: String(metrics.writtenToday) },
            { label: 'Overdue (promise)', value: String(overdueCount) },
            {
              label: 'Avg down-in-shop time',
              value: downInShopLaneMinutes != null ? formatWaitMinutes(downInShopLaneMinutes) : '—',
            },
            { label: 'In queue', value: String(metrics.queueCount) },
            { label: 'Completed today', value: String(metrics.completedToday) },
          ].map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl border border-white/10 bg-slate-950/50 p-3 print:border-gray-300 print:bg-white"
            >
              <p className="text-[9px] font-black uppercase text-slate-500 print:text-gray-600">{tile.label}</p>
              <p className="text-xl font-black text-white tabular-nums mt-1 print:text-black">{tile.value}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[9px] font-black uppercase text-slate-500 mb-2 print:text-gray-600 flex items-center gap-1.5">
            <Moon size={10} className="text-amber-400 print:text-gray-700" />
            Down in shop repair orders
          </p>
          {downInShop.length > 0 ? (
            <ul className="space-y-1.5 text-xs max-h-48 overflow-y-auto no-scrollbar print:max-h-none print:overflow-visible">
              {downInShop.map((ro) => (
                <li
                  key={ro.id}
                  className="flex justify-between gap-2 border-b border-white/5 pb-1 print:border-gray-200"
                >
                  <span className="font-bold text-white print:text-black">
                    RO {ro.roNumber} · {ro.customerLastName || ro.customerName || '—'}
                  </span>
                  <span className="text-slate-500 shrink-0 print:text-gray-600">
                    {ro.techNumber ? `Tech ${ro.techNumber}` : '—'}
                    {ro.promiseTimeAt ? ` · ${formatDispatchPromiseClock(ro.promiseTimeAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 print:text-gray-600 py-4 text-center border border-dashed border-slate-800 rounded-xl print:border-gray-300">
              No vehicles down in shop
            </p>
          )}
        </div>

        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={printReport}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-primary text-slate-950 text-[10px] font-black uppercase"
          >
            <Printer size={14} />
            Print / Save PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 text-[10px] font-black uppercase text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DispatchEndOfDayReport;
