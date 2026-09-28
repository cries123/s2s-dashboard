import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';
import type { Customer, ServiceVisit } from '../../../types';
import {
  fetchOpenRepairOrderDetail,
  fetchOpenRepairOrders,
  type OpenRepairOrderRow,
} from '../../../lib/openRepairOrdersApi';
import { cn } from '../../../lib/utils';
import { isPbsSyncDealership } from '../../../lib/pbsSyncScope';
import { ServiceVisitDetailModal } from '../customers/ServiceVisitDetailModal';
import { PageHeader } from '../../layout/PageHeader';
import { EmptyState } from '../../ui/EmptyState';
import { tidyCase, tidyPersonName } from '../../ui/Panel';

type SortColumn = 'roNumber' | 'advisor' | 'days';
type SortDirection = 'asc' | 'desc';

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

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown size={12} className="opacity-40" />;
  return direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
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
  // A failed first load used to fall through to "0 open ROs / No open repair orders",
  // which reads as a fact about the shop rather than a failure. Tracked separately now.
  const [loadError, setLoadError] = useState(false);
  const hasOrdersRef = React.useRef(false);
  hasOrdersRef.current = orders.length > 0;
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('days');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
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
        const result = await fetchOpenRepairOrders({ forceRefresh: isRefresh });
        setOrders(result.orders);
        setFetchedAt(result.fetchedAt);
        setLoadError(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load open repair orders.';
        // With orders already on screen, a failed refresh is a passing notice; with
        // nothing on screen it is the page's state and is shown in place.
        if (isRefresh && hasOrdersRef.current) onErrorRef.current(message);
        else setLoadError(true);
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

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      // Days defaults to oldest-first (most urgent); RO # and Advisor default A→Z.
      setSortDirection(column === 'days' ? 'desc' : 'asc');
    }
  };

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortColumn === 'roNumber') {
        cmp = a.roNumber.localeCompare(b.roNumber, undefined, { numeric: true });
      } else if (sortColumn === 'advisor') {
        cmp = (a.advisor || '').localeCompare(b.advisor || '');
      } else if (sortColumn === 'days') {
        cmp = a.daysOpen - b.daysOpen;
      }
      if (cmp === 0) cmp = a.roNumber.localeCompare(b.roNumber, undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortColumn, sortDirection]);

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
        payTypeTotals: detail.visit.payTypeTotals,
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
      <EmptyState
        title="Not available for this store"
        description="Open repair orders come from PBS, which is connected for Hyundai of Santa Maria only."
      />
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <PageHeader
        title="Open repair orders"
        description={`Open ROs from PBS. Tap one for details.${fetchedAt ? ` Updated ${formatFetchedAt(fetchedAt)}.` : ''}`}
        breadcrumbs={[{ label: 'Service' }, { label: 'Open ROs' }]}
        actions={
          <button
            type="button"
            onClick={() => void loadOrders(true)}
            disabled={loading || refreshing}
            className="btn-secondary min-h-[44px] disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {loadError && !loading ? (
        <EmptyState
          title="Couldn't load repair orders"
          description="Check your connection and try again. If you were signed out, sign back in first."
          action={
            <button type="button" className="btn-secondary" onClick={() => void loadOrders(false)}>
              <RefreshCw size={14} /> Try again
            </button>
          }
        />
      ) : (
      <>
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          aria-label="Search by RO number, tag, customer, VIN or advisor"
          className="input-field pl-9"
        />
      </div>

      {!loading ? (
        <p className="crm-label tabular-nums">
          {filtered.length} open RO{filtered.length === 1 ? '' : 's'}
          {search.trim() ? ` (of ${orders.length})` : ''}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm font-medium">Loading open repair orders…</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search.trim() ? 'No matches' : 'No open repair orders'}
          description={search.trim() ? 'Try a different RO number, name or VIN.' : 'Nothing has been open in the last 90 days.'}
        />
      ) : (
        <>
          {/* Phones: one row per repair order, label/value lines, tap for details. */}
          <div className="md:hidden list-group">
            {sorted.map((row) => {
              const isLoadingRow = detailLoadingId === row.repairOrderId;
              const hasCrmMatch = Boolean(row.customerId && customerById.has(row.customerId));
              const ageBadge = row.daysOpen >= 7 ? 'badge-error' : row.daysOpen >= 5 ? 'badge-warning' : null;
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
                  className={cn('list-row items-start cursor-pointer', isLoadingRow && 'opacity-60 pointer-events-none')}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold text-brand-primary tabular-nums inline-flex items-center gap-2">
                        RO {row.roNumber}
                        {isLoadingRow ? <Loader2 size={13} className="animate-spin" /> : null}
                      </span>
                      {ageBadge ? (
                        <span className={cn('badge', ageBadge)}>{row.daysOpen} days open</span>
                      ) : (
                        <span className="crm-label tabular-nums">
                          {row.daysOpen === 0 ? 'Today' : `${row.daysOpen} day${row.daysOpen === 1 ? '' : 's'} open`}
                        </span>
                      )}
                    </div>
                    <dl className="mt-1 space-y-0.5">
                      <div className="field-line">
                        <dt>Customer</dt>
                        <dd className="truncate" onClick={(e) => hasCrmMatch && e.stopPropagation()}>
                          {row.customerName ? (
                            hasCrmMatch ? (
                              <button
                                type="button"
                                onClick={(e) => handleCustomerClick(e, row)}
                                className="text-brand-primary text-left hover:underline"
                                title="Open customer profile"
                              >
                                {tidyPersonName(row.customerName)}
                              </button>
                            ) : (
                              tidyPersonName(row.customerName)
                            )
                          ) : (
                            '—'
                          )}
                          {row.isWaiting ? <span className="badge badge-warning ml-2">Waiting</span> : null}
                        </dd>
                      </div>
                      <div className="field-line">
                        <dt>Vehicle</dt>
                        <dd className="truncate">{tidyCase(row.vehicleLabel) || '—'}</dd>
                      </div>
                      <div className="field-line">
                        <dt>Advisor</dt>
                        <dd className="truncate">
                          {tidyCase(row.advisor) || '—'}
                          {row.techNumber ? <span style={{ color: 'var(--color-text-secondary)' }}> · Tech {row.techNumber}</span> : null}
                        </dd>
                      </div>
                      {row.concern ? (
                        <div className="field-line">
                          <dt>Concern</dt>
                          <dd className="line-clamp-2">{tidyCase(row.concern, 'sentence')}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop / tablet — full data table */}
          <div className="hidden md:block card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-slate-900/50 text-xs text-slate-500">
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => handleSort('roNumber')}
                      className="inline-flex items-center gap-1 hover:text-slate-300 transition-colors"
                    >
                      RO #
                      <SortIcon active={sortColumn === 'roNumber'} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">Tag</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Vehicle</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSort('advisor')}
                      className="inline-flex items-center gap-1 hover:text-slate-300 transition-colors"
                    >
                      Advisor
                      <SortIcon active={sortColumn === 'advisor'} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Tech</th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => handleSort('days')}
                      className="inline-flex items-center gap-1 hover:text-slate-300 transition-colors"
                    >
                      Days
                      <SortIcon active={sortColumn === 'days'} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Concern</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map((row) => {
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
                                <span className="shrink-0 text-xs font-bold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">
                                  Wait
                                </span>
                              ) : null}
                              {hasCrmMatch ? (
                                <span title="Matched in customer directory" className="inline-flex shrink-0"><User size={12} className="text-brand-primary opacity-70" /></span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-slate-500 ">—</span>
                          )}
                        </div>
                        <p className="md:hidden text-xs text-slate-500 mt-0.5 truncate max-w-[12rem]">
                          {row.vehicleLabel || row.vinLast8 || ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-300 hidden md:table-cell">
                        <div className="truncate max-w-[10rem]">{row.vehicleLabel || '—'}</div>
                        {row.vinLast8 ? (
                          <div className="text-xs text-slate-500 font-mono">…{row.vinLast8}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-300 hidden lg:table-cell whitespace-nowrap">
                        {row.advisor}
                      </td>
                      <td className="px-4 py-3 text-slate-300 hidden lg:table-cell whitespace-nowrap">
                        {row.techNumber || '—'}
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
