import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { CalendarDays, ChevronRight, Phone, Search, UserPlus, Users, Wrench } from 'lucide-react';
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
import { ListRowButton, Panel, tidyCase, tidyPersonName } from '../../ui/Panel';
import { countOverdueOrders } from '../../../lib/dispatchPromiseTime';

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
    {
      label: 'Calls due',
      value: String(dueThisWeek),
      sublabel: 'this week',
      valueTone: dueThisWeek ? 'danger' : undefined,
    },
    // PBS keeps syncing dispatch orders even when the board is switched off for the
    // store. Counting them then puts a number nobody acts on in the most prominent
    // slot in the app — and it reads as "101 past promise" precisely because a board
    // nobody opens never gets closed out.
    ...(dispatchEnabled
      ? [{ label: 'On the board', value: String(activeOrders.length), sublabel: 'active repair orders' }]
      : []),
    {
      label: 'Appointments today',
      value: todayAppointments === null ? '—' : todayAppointments.toLocaleString(),
    },
    {
      label: 'Visits this month',
      value: visitsThisMonth.toLocaleString(),
      sublabel: `${customers.length.toLocaleString()} customers on file`,
    },
  ];

  const firstName = (currentUser.username || '').split(' ')[0] || 'there';
  const loading = customersLoading || ordersLoading;
  const pastPromiseCount = dispatchEnabled ? countOverdueOrders(activeOrders, now.getTime()) : 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="crm-page-title" style={{ fontSize: '1.375rem' }}>
            {greeting(now)}, {firstName}
          </h1>
          <p className="crm-label mt-0.5">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="hidden sm:flex flex-wrap gap-2">
          <button type="button" onClick={() => onNavigate('add')} className="btn-secondary">
            <UserPlus size={15} /> Add customer
          </button>
          <button type="button" onClick={() => onNavigate('search')} className="btn-secondary">
            <Search size={15} /> Find a customer
          </button>
        </div>
      </header>

      {loading ? <KpiStripSkeleton /> : <KpiStrip tiles={tiles} columns={4} />}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        <Panel
          className="lg:col-span-3"
          title="Service alerts"
          icon={Phone}
          tone="violet"
          action={{ label: 'View all', onClick: () => onNavigate('alerts') }}
        >
          {customersLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={3} /></div>
          ) : alertRows.length === 0 ? (
            <p className="crm-label px-4 py-8 text-center">No calls due. Customers appear here as they come up for service.</p>
          ) : (
            <>
              {alertRows.slice(0, 6).map(({ customer, alert }) => (
                <ListRowButton
                  key={customer.id}
                  onClick={() => onViewProfile(customer)}
                  title={formatCustomerDisplayName(customer.firstName, customer.lastName)}
                  subtitle={[customer.year, tidyCase(customer.model)].filter(Boolean).join(' ') || 'No vehicle on file'}
                  right={<span className={cn('badge', TONE_CLASS[alert.tone])} title={`Due ${formatDueDate(alert.dueIso)}`}>{alert.label}</span>}
                  chevron={false}
                />
              ))}
              {alertRows.length > 6 && (
                <button type="button" onClick={() => onNavigate('alerts')} className="list-row justify-center link-text text-sm">
                  {alertRows.length - 6} more
                </button>
              )}
            </>
          )}
        </Panel>

        <div className="lg:col-span-2 space-y-5">
          <Panel
            title="Appointments today"
            icon={CalendarDays}
            tone="blue"
            action={{ label: 'Schedule', onClick: () => onNavigate('schedule') }}
          >
            {appointments.loading ? (
              <div className="p-4"><TableSkeleton rows={3} cols={2} /></div>
            ) : appointments.error ? (
              <p role="status" className="crm-label px-4 py-6 text-center">Couldn't load appointments. Open the schedule to try again.</p>
            ) : appointments.slots.length ? (
              <div className="max-h-96 overflow-y-auto">
                {appointments.slots.map((slot) => (
                  <div key={slot.id} className="list-row items-start">
                    <span className="text-sm font-semibold tabular-nums shrink-0 w-[4.5rem] pt-px">{formatScheduleTimeDetail(slot.startMinutes)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{tidyPersonName(slot.customerName)}</p>
                      <p className="crm-label truncate">{tidyCase(slot.vehicleLabel)}</p>
                      {slot.concern || slot.status ? (
                        <p className="crm-label line-clamp-1">{tidyCase(slot.concern || slot.status, 'sentence')}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="crm-label px-4 py-6 text-center">
                {todayAppointments === 0 ? 'No appointments today.' : 'Open the schedule to see today’s appointments.'}
              </p>
            )}
          </Panel>

          {dispatchEnabled ? (
            <Panel title="Shop today" icon={Wrench} tone="teal" action={{ label: 'Dispatch', onClick: () => onNavigate('dispatch') }}>
              <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: 'var(--color-row-divider)' }}>
                <div className="px-4 py-3" style={{ backgroundColor: 'var(--color-surface-card)' }}>
                  <p className="crm-label">Active repair orders</p>
                  <p className="text-xl font-semibold tabular-nums mt-0.5">{activeOrders.length}</p>
                </div>
                <div className="px-4 py-3" style={{ backgroundColor: 'var(--color-surface-card)' }}>
                  <p className="crm-label">Past promise</p>
                  <p className="text-xl font-semibold tabular-nums mt-0.5" style={pastPromiseCount ? { color: 'var(--color-badge-error-text)' } : undefined}>
                    {pastPromiseCount}
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}

          <div className="list-group">
            {[
              { label: 'Customer directory', icon: Users, tab: 'search' as const },
              { label: 'Add customer', icon: UserPlus, tab: 'add' as const },
            ].map(({ label, icon: Icon, tab }) => (
              <button key={label} type="button" className="list-row" onClick={() => onNavigate(tab)}>
                <Icon size={17} style={{ color: 'var(--color-text-secondary)' }} />
                <span className="flex-1 text-sm">{label}</span>
                <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeDashboard;
