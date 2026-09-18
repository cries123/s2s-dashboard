import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, ArrowRight, Bell, Layers, Search, UserPlus, Users, Wrench } from 'lucide-react';
import { db } from '../../../firebase';
import type { Customer, DispatchRepairOrder, User } from '../../../types';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { describeCustomerAlert, formatDueDate, type AlertTone } from '../../../lib/alertPresentation';
import { filterDispatchOrdersForDealership } from '../../../lib/dispatchDealershipScope';
import { normalizeDispatchOrder } from '../../../lib/dispatchTransitions';
import { formatCustomerDisplayName } from '../../../lib/customerName';
import { isPreviewMode } from '../../../lib/previewMode';
import { getDispatchDatePst } from '../../../lib/dispatchPst';
import { appointmentTrackerDoc, toLocalDateString } from '../../../lib/appointmentTracker';
import { buildPreviewDispatchOrders } from '../../../lib/previewFixtures';
import { KpiStrip, type KpiTile } from '../../ui/KpiStrip';
import { KpiStripSkeleton, TableSkeleton } from '../../ui/Skeleton';
import { EmptyState } from '../../ui/EmptyState';
import { cn } from '../../../lib/utils';

interface HomeDashboardProps {
  customers: Customer[];
  customersLoading: boolean;
  currentDealershipId: string;
  dealershipName: string;
  currentUser: User;
  onNavigate: (tab: 'alerts' | 'dispatch' | 'search' | 'add' | 'open-ros') => void;
  onViewProfile: (customer: Customer) => void;
}

const TONE_CLASS: Record<AlertTone, string> = {
  info: 'badge-info',
  warning: 'badge-warning',
  danger: 'badge-error',
  muted: 'badge',
};

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The first screen after sign-in: today's numbers, then the shortest path into the
 * work. Everything here is derived from data other screens already load, so it adds
 * one listener (dispatch orders) and nothing else.
 */
export function HomeDashboard({
  customers,
  customersLoading,
  currentDealershipId,
  dealershipName,
  currentUser,
  onNavigate,
  onViewProfile,
}: HomeDashboardProps) {
  const serviceAlerts = useServiceAlertHelpers();
  const [orders, setOrders] = useState<DispatchRepairOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(!isPreviewMode);

  useEffect(() => {
    if (isPreviewMode) {
      setOrders(buildPreviewDispatchOrders(currentDealershipId, getDispatchDatePst()));
      setOrdersLoading(false);
      return;
    }
    if (!currentDealershipId) return;
    setOrdersLoading(true);
    const q = query(
      collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dispatchOrders'),
      where('dealershipId', '==', currentDealershipId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DispatchRepairOrder[] = [];
        snap.forEach((d) => list.push(normalizeDispatchOrder(d.data() as Omit<DispatchRepairOrder, 'id'>, d.id)));
        setOrders(filterDispatchOrdersForDealership(list, currentDealershipId));
        setOrdersLoading(false);
      },
      (err) => {
        console.error('[Home] dispatch orders', err);
        setOrdersLoading(false);
      }
    );
    return () => unsub();
  }, [currentDealershipId]);

  const now = useMemo(() => new Date(), []);

  const activeOrders = useMemo(
    () => orders.filter((o) => !o.isCompleted && (o.lifecycleStatus ?? 'active') === 'active'),
    [orders]
  );
  const pastPromise = useMemo(
    () => activeOrders.filter((o) => o.promiseTimeAt && new Date(o.promiseTimeAt).getTime() < now.getTime()),
    [activeOrders, now]
  );

  // Appointments booked for today, from the same tracker the Operations tab uses.
  const [todayAppointments, setTodayAppointments] = useState<number | null>(null);
  useEffect(() => {
    if (isPreviewMode || !currentDealershipId) {
      setTodayAppointments(isPreviewMode ? 0 : null);
      return;
    }
    const today = toLocalDateString(new Date());
    const ref = appointmentTrackerDoc(db, currentDealershipId, today);
    const unsub = onSnapshot(
      ref,
      (snap) => setTodayAppointments(snap.exists() ? Number(snap.data()?.count) || 0 : 0),
      (err) => {
        console.error('[Home] today appointments', err);
        setTodayAppointments(null);
      }
    );
    return () => unsub();
  }, [currentDealershipId]);

  const alertRows = useMemo(() => {
    const rows = customers
      .filter(serviceAlerts.isServiceAlertActive)
      .map((c) => ({ customer: c, alert: describeCustomerAlert(c, serviceAlerts.config, now) }))
      .sort((a, b) => (b.alert.daysPastDue ?? -Infinity) - (a.alert.daysPastDue ?? -Infinity));
    return rows;
  }, [customers, serviceAlerts, now]);

  const dueThisWeek = alertRows.filter((r) => (r.alert.daysPastDue ?? -99) >= -7).length;

  const visitsThisMonth = useMemo(() => {
    const y = now.getFullYear();
    const m = now.getMonth();
    let n = 0;
    for (const c of customers) {
      for (const v of c.recentVisits || []) {
        const d = new Date(`${String(v.date).slice(0, 10)}T00:00:00`);
        if (!Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m) n++;
      }
    }
    return n;
  }, [customers, now]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of activeOrders) {
      const key = o.departmentName || String(o.department || 'unassigned');
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeOrders]);

  const tiles: KpiTile[] = [
    {
      label: 'On the board',
      value: String(activeOrders.length),
      sublabel: 'active repair orders',
      tone: 'info',
    },
    {
      label: 'Appointments today',
      value: todayAppointments === null ? '—' : todayAppointments.toLocaleString(),
      sublabel: now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      tone: 'info',
    },
    {
      label: 'Calls due this week',
      value: String(dueThisWeek),
      sublabel: `${alertRows.length} total in queue`,
      tone: dueThisWeek ? 'warning' : 'default',
    },
    {
      label: 'Visits this month',
      value: visitsThisMonth.toLocaleString(),
      sublabel: `${customers.length.toLocaleString()} customer${customers.length === 1 ? '' : 's'} on file`,
    },
  ];

  const firstName = (currentUser.username || '').split(' ')[0] || 'there';
  const loading = customersLoading || ordersLoading;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="crm-label">{dealershipName}</p>
          <h1 className="crm-page-title mt-1" style={{ fontSize: '1.5rem' }}>
            {greeting(now)}, {firstName}
          </h1>
          <p className="crm-label mt-1">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onNavigate('add')} className="btn-secondary text-sm">
            <UserPlus size={15} /> Onboard customer
          </button>
          <button type="button" onClick={() => onNavigate('search')} className="btn-secondary text-sm">
            <Search size={15} /> Find a customer
          </button>
        </div>
      </header>

      {loading ? <KpiStripSkeleton /> : <KpiStrip tiles={tiles} columns={4} />}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="crm-section-title flex items-center gap-2">
              <Bell size={15} className="text-brand-primary" /> Call list — next up
            </h2>
            <button type="button" onClick={() => onNavigate('alerts')} className="crm-label hover:text-brand-primary inline-flex items-center gap-1">
              All alerts <ArrowRight size={13} />
            </button>
          </div>

          {customersLoading ? (
            <TableSkeleton rows={5} cols={3} />
          ) : alertRows.length === 0 ? (
            <EmptyState
              title="No calls due"
              description="Nobody is coming up for service in the current window. New alerts appear here as customers approach their predicted due date."
            />
          ) : (
            <div className="card-base overflow-hidden">
              <ul className="divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
                {alertRows.slice(0, 8).map(({ customer, alert }) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => onViewProfile(customer)}
                      className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {formatCustomerDisplayName(customer.firstName, customer.lastName)}
                        </p>
                        <p className="crm-label truncate">
                          {[customer.year, customer.model].filter(Boolean).join(' ')}
                          {customer.phone ? ` · ${customer.phone}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn('badge', TONE_CLASS[alert.tone])}>{alert.label}</span>
                        <p className="crm-label mt-1 tabular-nums">{formatDueDate(alert.dueIso)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {alertRows.length > 8 && (
                <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <button type="button" onClick={() => onNavigate('alerts')} className="crm-label hover:text-brand-primary">
                    {alertRows.length - 8} more in the full list →
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="crm-section-title flex items-center gap-2">
              <Wrench size={15} className="text-brand-primary" /> Shop right now
            </h2>
            <button type="button" onClick={() => onNavigate('dispatch')} className="crm-label hover:text-brand-primary inline-flex items-center gap-1">
              Dispatch board <ArrowRight size={13} />
            </button>
          </div>

          {ordersLoading ? (
            <TableSkeleton rows={4} cols={2} />
          ) : activeOrders.length === 0 ? (
            <EmptyState
              title="Board is clear"
              description="No active repair orders. New ROs appear here as they are dispatched."
              action={
                <button type="button" onClick={() => onNavigate('dispatch')} className="btn-secondary text-sm">
                  <Layers size={15} /> Open dispatch
                </button>
              }
            />
          ) : (
            <div className="card-base p-4 space-y-3">
              {pastPromise.length > 0 && (
                <div className="flex items-center gap-2 rounded-md px-3 py-2 badge-error text-sm">
                  <AlertTriangle size={15} />
                  {pastPromise.length} past promise time
                </div>
              )}
              <ul className="space-y-2">
                {byDepartment.map(([dept, count]) => (
                  <li key={dept} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{dept.replace(/_/g, ' ')}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card-base p-4">
            <p className="crm-label mb-2 flex items-center gap-2"><Users size={13} /> Quick links</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onNavigate('search')} className="btn-secondary text-sm justify-start">Directory</button>
              <button type="button" onClick={() => onNavigate('alerts')} className="btn-secondary text-sm justify-start">Alerts</button>
              <button type="button" onClick={() => onNavigate('dispatch')} className="btn-secondary text-sm justify-start">Dispatch</button>
              <button type="button" onClick={() => onNavigate('add')} className="btn-secondary text-sm justify-start">Onboard</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default HomeDashboard;
