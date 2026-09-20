import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRight, Bell, CalendarDays, Search, UserPlus, Users } from 'lucide-react';
import { db } from '../../../firebase';
import type { Customer, DispatchRepairOrder, User } from '../../../types';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { describeCustomerAlert, formatDueDate, type AlertTone } from '../../../lib/alertPresentation';
import { filterDispatchOrdersForDealership } from '../../../lib/dispatchDealershipScope';
import { normalizeDispatchOrder } from '../../../lib/dispatchTransitions';
import { formatCustomerDisplayName } from '../../../lib/customerName';
import { isPreviewMode } from '../../../lib/previewMode';
import { getDispatchDatePst } from '../../../lib/dispatchPst';
import { useTodayAppointments } from '../../../hooks/useTodayAppointments';
import { formatScheduleTimeDetail } from '../../../lib/appointmentSchedule';
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
  /** When the dispatch board is off, its counts are meaningless — nobody works it. */
  dispatchEnabled?: boolean;
  currentUser: User;
  onNavigate: (tab: 'alerts' | 'dispatch' | 'search' | 'add' | 'open-ros' | 'schedule') => void;
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
 * store-scoped dispatch and appointment listeners.
 */
export function HomeDashboard({
  customers,
  customersLoading,
  currentDealershipId,
  dealershipName,
  dispatchEnabled = true,
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
    setOrders([]);
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

  const appointments = useTodayAppointments(currentDealershipId);
  const now = useMemo(() => new Date(), [appointments.date]);

  const activeOrders = useMemo(
    () => orders.filter((o) => !o.isCompleted && (o.lifecycleStatus ?? 'active') === 'active'),
    [orders]
  );
  const todayAppointments = appointments.count;

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

  const tiles: KpiTile[] = [
    // PBS keeps syncing dispatch orders even when the board is switched off for the
    // store. Counting them then puts a number nobody acts on in the most prominent
    // slot in the app — and it reads as "101 past promise" precisely because a board
    // nobody opens never gets closed out.
    ...(dispatchEnabled
      ? [{
          label: 'On the board',
          value: String(activeOrders.length),
          sublabel: 'active repair orders',
          tone: 'info' as const,
        }]
      : []),
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="crm-section-title flex items-center gap-2">
              <CalendarDays size={16} className="text-brand-primary" /> Appointments today
            </h2>
            <button type="button" onClick={() => onNavigate('schedule')} className="btn-secondary text-sm">
              Full schedule <ArrowRight size={14} />
            </button>
          </div>
          <div className="card-base p-4 space-y-4">
            <p className="text-sm text-text-secondary">
              {appointments.date} · {todayAppointments === null ? 'Count unavailable' : todayAppointments.toLocaleString() + ' appointments'}
            </p>
            {appointments.loading ? <TableSkeleton rows={3} cols={2} /> : appointments.error ? (
              <p role="status" className="text-sm text-text-secondary">Appointments could not be loaded. Open the schedule to retry.</p>
            ) : appointments.slots.length ? (
              <ul className="divide-y divide-surface-border max-h-80 overflow-y-auto">
                {appointments.slots.map(slot => (
                  <li key={slot.id} className="py-3 flex gap-3 text-sm">
                    <span className="font-semibold tabular-nums shrink-0 w-20">{formatScheduleTimeDetail(slot.startMinutes)}</span>
                    <div className="min-w-0">
                      <p className="font-medium break-words">{slot.customerName}</p>
                      <p className="text-text-secondary break-words">{slot.vehicleLabel}</p>
                      <p className="text-text-secondary break-words">{slot.concern || slot.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">{todayAppointments === 0
                ? 'No appointments scheduled for today.'
                : 'Appointment details have not been loaded yet. Open the full schedule to check availability.'}</p>
            )}
          </div>

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
