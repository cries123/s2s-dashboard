import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw, Search, User } from 'lucide-react';
import type { Customer, ServiceVisit } from '../../../types';
import {
  fetchOpenRepairOrderDetail,
  fetchOpenRepairOrders,
  type OpenRepairOrderRow,
} from '../../../lib/openRepairOrdersApi';
import { DISPATCH_STATUS_COLORS } from '../../../lib/dispatchConfig';
import { cn } from '../../../lib/utils';
import { isPbsSyncDealership } from '../../../lib/pbsSyncScope';
import { ServiceVisitDetailModal } from '../customers/ServiceVisitDetailModal';

interface OpenRepairOrdersProps {
  currentDealershipId: string;
  customers: Customer[];
  onViewProfile: (customer: Customer) => void;
  onError: (message: string) => void;
}

function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function matchesSearch(row: OpenRepairOrderRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.roNumber,
    row.tag,
    row.customerName,
    row.vehicleLabel,
    row.vinLast8,
    row.advisor,
    row.techNumber,
    row.status,
    row.customStatus,
    row.concern,
    row.shop,
    row.phoneNumber,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function StatusBadge({ row }: { row: OpenRepairOrderRow }) {
  const lane = row.laneStatus as keyof typeof DISPATCH_STATUS_COLORS;
  const colors = DISPATCH_STATUS_COLORS[lane];
  const label = colors?.label || row.customStatus || row.status;
  const bg = colors?.hex || '#64748B';
  const text = colors?.text || '#FFFFFF';

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

export default function OpenRepairOrders({
  currentDealershipId,
  customers,
  onViewProfile,
  onError,
}: OpenRepairOrdersProps) {
  const [orders, setOrders] = useState<OpenRepairOrderRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<{
    visit: ServiceVisit;
    customerName?: string;
    vehicleLabel?: string;
    customerId?: string;
  } | null>(null);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) map.set(c.id, c);
    return map;
  }, [customers]);

  // Keep the latest onError in a ref instead of a useCallback dependency. The parent
  // passes an inline arrow function that gets a new identity on every render (e.g. any
  // time a toast is shown); depending on it directly caused loadOrders -> onError ->
  // toast -> re-render -> new loadOrders -> loadOrders effect refiring -> loadOrders ->
  // onError... an infinite fetch/toast loop whenever the fetch fails (as it always does
  // in preview mode, with no authenticated Firebase user).
  const onErrorRef = React.useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const loadOrders = useCallback(
    async (isRefresh = false) => {
      if (!isPbsSyncDealership(currentDealershipId)) {
        setOrders([]);
        setFetchedAt(null);
        setLoading(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await fetchOpenRepairOrders();
        setOrders(result.orders);
        setFetchedAt(result.fetchedAt);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load open repair orders.';
        onErrorRef.current(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentDealershipId]
  );

  useEffect(() => {
    void loadOrders();
    // Only re-fetch when the dealership actually changes (or on mount) — not on every
    // re-render of loadOrders's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDealershipId]);

  const filtered = useMemo(
    () => orders.filter((row) => matchesSearch(row, search)),
    [orders, search]
  );

  const handleCustomerClick = (
    event: React.MouseEvent,
    row: OpenRepairOrderRow
  ) => {
    event.stopPropagation();
    if (!row.customerId) return;
    const customer = customerById.get(row.customerId);
    if (customer) onViewProfile(customer);
  };

  const handleRowClick = async (row: OpenRepairOrderRow) => {
    setDetailLoadingId(row.repairOrderId);
    try {
      const detail = await fetchOpenRepairOrderDetail(row.repairOrderId);
      const visit: ServiceVisit = {
        id: detail.repairOrderId,
        soNumber: detail.visit.soNumber,
        date: detail.visit.date,
        mileage: detail.visit.mileage,
        advisor: detail.visit.advisor,
        requests: detail.visit.requests,
        status: detail.visit.status,
        lines: detail.visit.lines,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as ServiceVisit['createdAt'],
      };
      setSelectedVisit({
        visit,
        customerName: detail.customerName || row.customerName,
        vehicleLabel: detail.vehicleLabel || row.vehicleLabel,
        customerId: detail.customerId || row.customerId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load repair order detail.';
      onError(message);
    } finally {
      setDetailLoadingId(null);
    }
  };

  const handleOpenCustomerFromModal = () => {
    if (!selectedVisit?.customerId) return;
    const customer = customerById.get(selectedVisit.customerId);
    if (customer) {
      setSelectedVisit(null);
      onViewProfile(customer);
    }
  };

  if (!isPbsSyncDealership(currentDealershipId)) {
    return (
      <div className="card-base rounded-2xl border border-white/5 p-8 text-center">
        <p className="text-sm text-slate-300">Open repair orders are only available for PBS-integrated stores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList size={22} className="text-brand-primary" />
            Open Repair Orders
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Live open ROs from PBS. Click a row for the repair order, or click a customer name to open their profile.
            {fetchedAt ? ` Last refreshed ${formatFetchedAt(fetchedAt)}.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders(true)}
          disabled={loading || refreshing}
          className="btn-primary bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm py-2.5 px-4 min-h-[44px] w-full sm:w-auto disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          {refreshing ? 'Refreshing…' : 'Refresh from PBS'}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search RO #, tag, customer, VIN, advisor…"
          className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="font-semibold text-white">{filtered.length}</span>
        <span>open RO{filtered.length === 1 ? '' : 's'}</span>
        {search.trim() ? <span className="text-slate-500">(filtered from {orders.length})</span> : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm font-medium">Loading open repair orders…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-base rounded-2xl border border-white/5 p-10 text-center">
          <p className="text-sm text-slate-300 font-medium">
            {search.trim() ? 'No repair orders match your search.' : 'No open repair orders in the last 90 days.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile — one card per repair order, all fields visible without horizontal scroll */}
          <div className="md:hidden space-y-3">
            {filtered.map((row) => {
              const isLoadingRow = detailLoadingId === row.repairOrderId;
              const hasCrmMatch = Boolean(row.customerId && customerById.has(row.customerId));
              return (
                <div
                  key={row.repairOrderId}
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleRowClick(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleRowClick(row);
                    }
                  }}
                  className={cn(
                    'card-base card-interactive rounded-2xl p-4 space-y-3 cursor-pointer',
                    isLoadingRow && 'opacity-60 pointer-events-none'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-mono font-semibold text-white">
                        {row.roNumber}
                        {isLoadingRow ? <Loader2 size={12} className="animate-spin text-brand-primary" /> : null}
                        {row.tag ? (
                          <span className="text-[10px] font-sans font-normal text-slate-500">· {row.tag}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {row.customerName ? (
                          <>
                            {hasCrmMatch ? (
                              <button
                                type="button"
                                onClick={(e) => handleCustomerClick(e, row)}
                                className="text-brand-primary font-medium truncate text-left hover:underline"
                                title="Open customer profile"
                              >
                                {row.customerName}
                              </button>
                            ) : (
                              <span className="text-white font-medium truncate">
                                {row.customerName}
                              </span>
                            )}
                            {row.isWaiting ? (
                              <span className="shrink-0 text-[9px] font-bold uppercase bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">
                                Wait
                              </span>
                            ) : null}
                            {hasCrmMatch ? (
                              <span className="shrink-0" title="Matched in customer directory">
                                <User size={12} className="text-brand-primary opacity-70" />
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-500 italic">—</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <StatusBadge row={row} />
                      <span
                        className={cn(
                          'font-semibold tabular-nums text-xs',
                          row.daysOpen >= 5 ? 'text-amber-400' : 'text-slate-300'
                        )}
                      >
                        {row.daysOpen} day{row.daysOpen === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs border-t border-white/5 pt-3">
                    <div>
                      <p className="crm-label">Vehicle</p>
                      <p className="text-slate-200 truncate">{row.vehicleLabel || '—'}</p>
                      {row.vinLast8 ? (
                        <p className="text-[10px] text-slate-500 font-mono">…{row.vinLast8}</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="crm-label">Advisor</p>
                      <p className="text-slate-200 truncate">{row.advisor || '—'}</p>
                    </div>
                    <div>
                      <p className="crm-label">Tech</p>
                      <p className="text-slate-200 truncate">{row.techNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="crm-label">Promise</p>
                      <p className="text-slate-200 truncate">{row.datePromisedLabel || '—'}</p>
                    </div>
                    {row.concern ? (
                      <div className="col-span-2">
                        <p className="crm-label">Concern</p>
                        <p className="text-slate-200">{row.concern}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop / tablet — full data table */}
          <div className="hidden md:block card-base rounded-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-slate-900/50 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">RO #</th>
                  <th className="px-4 py-3 font-semibold">Tag</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Vehicle</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Advisor</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Tech</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Days</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Promise</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Concern</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((row) => {
                  const isLoadingRow = detailLoadingId === row.repairOrderId;
                  const hasCrmMatch = Boolean(row.customerId && customerById.has(row.customerId));
                  return (
                    <tr
                      key={row.repairOrderId}
                      onClick={() => void handleRowClick(row)}
                      className={cn(
                        'transition-colors cursor-pointer hover:bg-brand-primary/5',
                        isLoadingRow && 'opacity-60 pointer-events-none'
                      )}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-white whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          {row.roNumber}
                          {isLoadingRow ? <Loader2 size={12} className="animate-spin text-brand-primary" /> : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{row.tag || '—'}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 min-w-[8rem]">
                          {row.customerName ? (
                            <>
                              {hasCrmMatch ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleCustomerClick(e, row)}
                                  className="text-brand-primary font-medium truncate max-w-[10rem] sm:max-w-none text-left hover:underline"
                                  title="Open customer profile"
                                >
                                  {row.customerName}
                                </button>
                              ) : (
                                <span className="text-white font-medium truncate max-w-[10rem] sm:max-w-none">
                                  {row.customerName}
                                </span>
                              )}
                              {row.isWaiting ? (
                                <span className="shrink-0 text-[9px] font-bold uppercase bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">
                                  Wait
                                </span>
                              ) : null}
                              {hasCrmMatch ? (
                                <User size={12} className="shrink-0 text-brand-primary opacity-70" title="Matched in customer directory" />
                              ) : null}
                            </>
                          ) : (
                            <span className="text-slate-500 italic">—</span>
                          )}
                        </div>
                        <p className="md:hidden text-[10px] text-slate-500 mt-0.5 truncate max-w-[12rem]">
                          {row.vehicleLabel || row.vinLast8 || ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-300 hidden md:table-cell">
                        <div className="truncate max-w-[10rem]">{row.vehicleLabel || '—'}</div>
                        {row.vinLast8 ? (
                          <div className="text-[10px] text-slate-500 font-mono">…{row.vinLast8}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-300 hidden lg:table-cell whitespace-nowrap">
                        {row.advisor}
                      </td>
                      <td className="px-4 py-3 text-slate-300 hidden lg:table-cell whitespace-nowrap">
                        {row.techNumber || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge row={row} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            row.daysOpen >= 5 ? 'text-amber-400' : 'text-slate-300'
                          )}
                        >
                          {row.daysOpen}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 hidden xl:table-cell whitespace-nowrap">
                        {row.datePromisedLabel || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 hidden xl:table-cell max-w-[14rem] truncate">
                        {row.concern || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}

      {selectedVisit ? (
        <ServiceVisitDetailModal
          visit={selectedVisit.visit}
          customerName={selectedVisit.customerName}
          vehicleLabel={selectedVisit.vehicleLabel}
          onOpenCustomer={
            selectedVisit.customerId && customerById.has(selectedVisit.customerId)
              ? handleOpenCustomerFromModal
              : undefined
          }
          onClose={() => setSelectedVisit(null)}
        />
      ) : null}
    </div>
  );
}
