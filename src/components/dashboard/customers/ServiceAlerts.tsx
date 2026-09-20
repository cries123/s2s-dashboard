import React, { useMemo, useState } from 'react';
import { writeBatch, doc, collection, serverTimestamp } from 'firebase/firestore';
import { ChevronDown, ChevronUp, Download, History, Loader2, Phone, Search, User as UserIcon } from 'lucide-react';
import { db } from '../../../firebase';
import type { Customer, User } from '../../../types';
import { handleFirestoreError, OperationType } from '../../../lib/firebaseUtils';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { usePreferences } from '../../../context/PreferencesContext';
import { describeCustomerAlert, formatDueDate, type AlertPresentation, type AlertTone } from '../../../lib/alertPresentation';
import { logCustomerContact } from '../../../lib/contactLog';
import { getLastVisitDate } from '../../../lib/serviceAlertWindow';
import { formatCustomerDisplayName } from '../../../lib/customerName';
import { cn } from '../../../lib/utils';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { EmptyState } from '../../ui/EmptyState';
import { TableSkeleton } from '../../ui/Skeleton';
import { ContactLogQuickForm } from '../../forms/ContactLogQuickForm';

interface ServiceAlertsProps {
  customers: Customer[];
  currentUser: User;
  loading?: boolean;
  onViewProfile: (c: Customer) => void;
  onViewLog: (c: Customer) => void;
  onRefresh: (msg?: string, isError?: boolean) => void;
}

type Filter = 'all' | 'soon' | 'today' | 'overdue';
type SortKey = 'due' | 'overdue' | 'name' | 'lastVisit';

interface Row {
  customer: Customer;
  alert: AlertPresentation;
  lastVisit: Date | null;
}

const TONE_CLASS: Record<AlertTone, string> = {
  info: 'badge-info',
  warning: 'badge-warning',
  danger: 'badge-error',
  muted: 'badge',
};

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ServiceAlerts({
  customers,
  currentUser,
  loading = false,
  onViewProfile,
  onViewLog,
  onRefresh,
}: ServiceAlertsProps) {
  const serviceAlerts = useServiceAlertHelpers();
  const { preferences } = usePreferences();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const now = useMemo(() => new Date(), []);

  const allRows = useMemo<Row[]>(
    () =>
      customers
        .filter(serviceAlerts.isServiceAlertActive)
        .map((customer) => ({
          customer,
          alert: describeCustomerAlert(customer, serviceAlerts.config, now),
          lastVisit: getLastVisitDate(customer),
        })),
    [customers, serviceAlerts, now]
  );

  const counts = useMemo(() => {
    let soon = 0, today = 0, overdue = 0;
    for (const r of allRows) {
      const d = r.alert.daysPastDue;
      if (d === undefined) continue;
      if (d < 0) soon++;
      else if (d === 0) today++;
      else overdue++;
    }
    return { all: allRows.length, soon, today, overdue };
  }, [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allRows.filter((r) => {
      const d = r.alert.daysPastDue;
      if (filter === 'soon' && !(d !== undefined && d < 0)) return false;
      if (filter === 'today' && d !== 0) return false;
      if (filter === 'overdue' && !(d !== undefined && d > 0)) return false;
      if (!q) return true;
      const c = r.customer;
      const hay = `${c.firstName} ${c.lastName} ${c.phone} ${c.year} ${c.model} ${c.vinLast8}`.toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') {
        return `${a.customer.lastName} ${a.customer.firstName}`.localeCompare(`${b.customer.lastName} ${b.customer.firstName}`);
      }
      if (sortKey === 'lastVisit') {
        return (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0);
      }
      if (sortKey === 'overdue') {
        // Triage view: the ones about to age out of the follow-up window first.
        return (b.alert.daysPastDue ?? -Infinity) - (a.alert.daysPastDue ?? -Infinity);
      }
      // Default — the order the list is actually worth working. Someone due in three
      // days is still winnable; someone 55 days past due mostly is not. Upcoming and
      // due-today lead, then overdue from freshest to stalest.
      const ad = a.alert.daysPastDue;
      const bd = b.alert.daysPastDue;
      if (ad === undefined || bd === undefined) {
        return (ad === undefined ? 1 : 0) - (bd === undefined ? 1 : 0);
      }
      const rank = (d: number) => (d <= 0 ? 0 : 1);
      if (rank(ad) !== rank(bd)) return rank(ad) - rank(bd);
      return Math.abs(ad) - Math.abs(bd);
    });
    return list;
  }, [allRows, search, filter, sortKey]);

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.customer.id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.customer.id));
      return next;
    });
  };

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleLogCall = async (customer: Customer, values: { outcome: string; notes: string; appointmentSet: boolean }) => {
    try {
      await logCustomerContact(customer, currentUser, values, serviceAlerts.config);
      setExpandedId(null);
      setSelected((prev) => { const n = new Set(prev); n.delete(customer.id); return n; });
      onRefresh(`Logged ${values.outcome} for ${customer.firstName}.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `customers/${customer.id}/contactLog`);
      } catch (formatted: any) {
        onRefresh(formatted.message, true);
      }
    }
  };

  /** Mark every selected row as contacted with one outcome, in Firestore batches. */
  const bulkMarkContacted = async (outcome: string) => {
    const targets = allRows.filter((r) => selected.has(r.customer.id)).map((r) => r.customer);
    if (!targets.length) return;
    setBulkBusy(true);
    try {
      for (let i = 0; i < targets.length; i += 200) {
        const batch = writeBatch(db);
        for (const c of targets.slice(i, i + 200)) {
          const nextDue = serviceAlerts.computeContactClearDueDate(c);
          const base = ['artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', c.id] as const;
          batch.set(doc(collection(db, ...base, 'contactLog')), {
            timestamp: serverTimestamp(),
            userId: currentUser.uid,
            username: currentUser.username,
            outcome,
            notes: 'Marked from the call list.',
            appointmentSet: false,
          });
          batch.update(doc(db, ...base), {
            lastServiceContact: serverTimestamp(),
            serviceReminderDueDate: nextDue,
            serviceAlertTriggered: false,
            lastContactOutcome: outcome,
            lastContactUsername: currentUser.username,
            lastContactUserId: currentUser.uid,
          });
        }
        await batch.commit();
      }
      onRefresh(`Marked ${targets.length} customer${targets.length === 1 ? '' : 's'} as ${outcome.toLowerCase()}.`);
      setSelected(new Set());
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'customers/bulk-contact');
      } catch (formatted: any) {
        onRefresh(formatted.message, true);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    const source = selected.size ? rows.filter((r) => selected.has(r.customer.id)) : rows;
    const header = ['Name', 'Phone', 'Vehicle', 'Last visit', 'Next due', 'Status', 'Language'];
    const lines = source.map((r) => [
      formatCustomerDisplayName(r.customer.firstName, r.customer.lastName),
      r.customer.phone,
      [r.customer.year, r.customer.model].filter(Boolean).join(' '),
      r.lastVisit ? r.lastVisit.toISOString().slice(0, 10) : '',
      r.alert.dueIso || '',
      r.alert.label,
      r.customer.language || '',
    ].map(csvEscape).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-list-${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetAll = async () => {
    const targets = allRows.map((r) => r.customer);
    if (!targets.length) { setShowResetConfirm(false); return; }
    setIsResetting(true);
    try {
      for (let i = 0; i < targets.length; i += 200) {
        const batch = writeBatch(db);
        for (const c of targets.slice(i, i + 200)) {
          const nextDue = serviceAlerts.computeContactClearDueDate(c);
          const base = ['artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', c.id] as const;
          batch.set(doc(collection(db, ...base, 'contactLog')), {
            timestamp: serverTimestamp(),
            userId: currentUser.uid,
            username: currentUser.username,
            outcome: 'Bulk Cycle Reset',
            notes: `Service reminder reset. Next due ${nextDue}.`,
            appointmentSet: false,
          });
          batch.update(doc(db, ...base), {
            lastServiceContact: serverTimestamp(),
            serviceReminderDueDate: nextDue,
            serviceAlertTriggered: false,
            lastContactOutcome: 'Bulk Cycle Reset',
            lastContactUsername: currentUser.username,
            lastContactUserId: currentUser.uid,
          });
        }
        await batch.commit();
      }
      onRefresh(`Reset reminders for ${targets.length} customers.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'customers/bulk-reset');
      } catch (formatted: any) {
        onRefresh(formatted.message, true);
      }
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const modeNote =
    serviceAlerts.config.mode === 'smart'
      ? 'Showing active customers coming up on their own predicted service date.'
      : serviceAlerts.config.mode === 'optimized'
        ? 'Reminders follow each customer\'s oil-change interval.'
        : 'Reminders are six months after delivery or last outreach.';

  const filterChips: Array<{ id: Filter; label: string; n: number }> = [
    { id: 'all', label: 'All', n: counts.all },
    { id: 'soon', label: 'Due soon', n: counts.soon },
    { id: 'today', label: 'Due today', n: counts.today },
    { id: 'overdue', label: 'Overdue', n: counts.overdue },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="crm-page-title">Service alerts</h1>
          <p className="crm-label mt-1">{modeNote}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="btn-secondary text-sm" title="Download the current list as a CSV call sheet">
            <Download size={15} /> Call sheet
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="card-base p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* One line on a phone: four chips wrapping 3+1 looked like a mistake. */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 lg:flex-wrap lg:overflow-visible lg:mx-0 lg:px-0">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors min-h-[36px]',
                filter === chip.id ? 'bg-brand-primary text-white' : 'hover:bg-[var(--color-surface-hover)]'
              )}
              style={filter === chip.id ? undefined : { color: 'var(--color-text-secondary)' }}
            >
              {chip.label} <span className="tabular-nums opacity-70">{chip.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative flex-1 lg:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, vehicle…"
              className="input-field pl-9 py-2"
              aria-label="Search alerts"
            />
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="input-field w-auto py-2"
            aria-label="Sort"
          >
            <option value="due">Sort: due soonest</option>
            <option value="overdue">Sort: most overdue</option>
            <option value="name">Sort: name</option>
            <option value="lastVisit">Sort: last visit</option>
          </select>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center gap-2 border-brand-primary/30">
          <span className="text-sm font-medium mr-2">{selected.size} selected</span>
          {['Answered', 'Left Voicemail', 'No Answer'].map((outcome) => (
            <button
              key={outcome}
              type="button"
              disabled={bulkBusy}
              onClick={() => bulkMarkContacted(outcome)}
              className="btn-secondary text-sm"
            >
              {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />} {outcome}
            </button>
          ))}
          <button type="button" onClick={() => setSelected(new Set())} className="crm-label ml-auto hover:text-brand-primary">
            Clear selection
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : allRows.length === 0 ? (
        <EmptyState
          title="No alerts right now"
          description={
            serviceAlerts.config.mode === 'smart'
              ? 'Nobody is inside their service window. Customers appear here three weeks before their predicted due date.'
              : 'Every customer is accounted for.'
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Try a different filter or clear the search."
          action={<button type="button" className="btn-secondary text-sm" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button>}
        />
      ) : (
        <div className="card-base overflow-hidden">
          {/*
            Phones get a stacked list, not the table. At 375px the six columns
            squeezed every name and vehicle onto three lines each and pushed the
            call button off the right edge, so the one thing you came to do was
            the one thing you had to scroll sideways to reach.
          */}
          <ul className="md:hidden divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
            {rows.map(({ customer, alert, lastVisit }) => {
              const open = expandedId === customer.id;
              return (
                <li key={customer.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${customer.firstName} ${customer.lastName}`}
                      checked={selected.has(customer.id)}
                      onChange={() => toggleOne(customer.id)}
                      className="accent-[var(--color-brand-primary)] mt-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onViewProfile(customer)}
                        className="font-semibold text-left hover:text-brand-primary block truncate w-full"
                      >
                        {formatCustomerDisplayName(customer.firstName, customer.lastName)}
                      </button>
                      <div className="crm-label flex items-center gap-2 min-w-0">
                        <span className="truncate tabular-nums">{customer.phone || 'No phone number'}</span>
                        {customer.language === 'Spanish' && (
                          <span className="badge badge-warning text-xs shrink-0">Spanish</span>
                        )}
                      </div>
                      <div className="crm-label truncate">
                        {[customer.year, customer.model].filter(Boolean).join(' ') || 'No vehicle on file'}
                        {customer.vinLast8 ? ` · ${customer.vinLast8}` : ''}
                      </div>
                      <div className="crm-label mt-0.5">
                        {lastVisit
                          ? `Last in ${lastVisit.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : 'No visits on record'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={cn('badge whitespace-nowrap', TONE_CLASS[alert.tone])} title={alert.reason}>
                        {alert.label}
                      </span>
                      <div className="crm-label mt-1 tabular-nums whitespace-nowrap">{formatDueDate(alert.dueIso)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        className="btn-secondary flex-1 justify-center text-sm py-2 whitespace-nowrap"
                      >
                        <Phone size={14} /> Call
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onViewLog(customer)}
                      className="btn-secondary text-sm py-2 px-3 shrink-0"
                      title="Contact history"
                      aria-label="Contact history"
                    >
                      <History size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : customer.id)}
                      className={cn(
                        'btn-primary flex-1 justify-center text-sm py-2 px-3 whitespace-nowrap',
                        open && 'bg-brand-secondary'
                      )}
                      aria-expanded={open}
                    >
                      Log call {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {open && (
                    <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: 'var(--color-surface-base)' }}>
                      <p className="crm-label mb-3">{alert.reason}</p>
                      <ContactLogQuickForm
                        defaultOutcome={preferences.contactWorkflow.defaultOutcome}
                        autoCheckAppointmentSet={preferences.contactWorkflow.autoCheckAppointmentSet}
                        onSubmit={(values) => handleLogCall(customer, values)}
                        submitLabel="Save & clear alert"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block overflow-x-auto">
            <table className="crm-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" aria-label="Select all" checked={allVisibleSelected} onChange={toggleAll} className="accent-[var(--color-brand-primary)]" />
                  </th>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th className="hidden md:table-cell">Last visit</th>
                  <th>Next due</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ customer, alert, lastVisit }) => {
                  const open = expandedId === customer.id;
                  return (
                    <React.Fragment key={customer.id}>
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${customer.firstName} ${customer.lastName}`}
                            checked={selected.has(customer.id)}
                            onChange={() => toggleOne(customer.id)}
                            className="accent-[var(--color-brand-primary)]"
                          />
                        </td>
                        <td>
                          <button type="button" onClick={() => onViewProfile(customer)} className="font-semibold hover:text-brand-primary text-left">
                            {formatCustomerDisplayName(customer.firstName, customer.lastName)}
                          </button>
                          <div className="crm-label">
                            {customer.phone ? (
                              <a href={`tel:${customer.phone}`} className="hover:text-brand-primary">{customer.phone}</a>
                            ) : '—'}
                            {customer.language === 'Spanish' && <span className="ml-2 badge badge-warning text-xs">Spanish</span>}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm">{[customer.year, customer.model].filter(Boolean).join(' ') || '—'}</div>
                          <div className="crm-label font-mono">{customer.vinLast8 || ''}</div>
                        </td>
                        <td className="hidden md:table-cell tabular-nums">
                          {lastVisit ? lastVisit.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="crm-label">No visits</span>}
                        </td>
                        <td>
                          <span className={cn('badge', TONE_CLASS[alert.tone])} title={alert.reason}>{alert.label}</span>
                          <div className="crm-label mt-1 tabular-nums">{formatDueDate(alert.dueIso)}</div>
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setExpandedId(open ? null : customer.id)}
                            className={cn('btn-primary text-sm py-1.5 px-3', open && 'bg-brand-secondary')}
                            aria-expanded={open}
                          >
                            <Phone size={14} /> Log call {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <button type="button" onClick={() => onViewLog(customer)} className="btn-secondary text-sm py-1.5 px-2.5 ml-2" title="Contact history" aria-label="Contact history">
                            <History size={14} />
                          </button>
                          <button type="button" onClick={() => onViewProfile(customer)} className="btn-secondary text-sm py-1.5 px-2.5 ml-2 hidden sm:inline-flex" title="Open profile" aria-label="Open profile">
                            <UserIcon size={14} />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} className="!py-4" style={{ backgroundColor: 'var(--color-surface-base)' }}>
                            <div className="max-w-2xl">
                              <p className="crm-label mb-3">{alert.reason}</p>
                              <ContactLogQuickForm
                                defaultOutcome={preferences.contactWorkflow.defaultOutcome}
                                autoCheckAppointmentSet={preferences.contactWorkflow.autoCheckAppointmentSet}
                                onSubmit={(values) => handleLogCall(customer, values)}
                                submitLabel="Save & clear alert"
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="crm-label tabular-nums">{rows.length} of {allRows.length}</span>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isResetting}
              className="crm-label hover:text-rose-400 inline-flex items-center gap-1"
              title="Push every customer's reminder forward one full cycle"
            >
              <History size={12} /> Reset all reminders…
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showResetConfirm}
        title="Reset every service reminder?"
        description={`This pushes all ${allRows.length} customers forward one full cycle and logs a contact for each. It cannot be undone.`}
        confirmLabel="Reset reminders"
        tone="danger"
        loading={isResetting}
        onConfirm={handleResetAll}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
