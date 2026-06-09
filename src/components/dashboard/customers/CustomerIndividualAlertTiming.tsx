import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Loader2, Save, ShieldCheck, User } from 'lucide-react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Customer } from '../../../types';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import {
  formatServiceAlertOverrideDate,
  getCustomerServiceAlertOverrideDate,
  isServiceAlertOverridePending,
  normalizeCustomerAlertPatch,
  resolveCustomerAlertTiming,
} from '../../../lib/customerAlertTiming';
import { serviceAlertIntervalMonths } from '../../../lib/dealershipSettingsUtils';
import { cn } from '../../../lib/utils';

interface CustomerIndividualAlertTimingProps {
  customer: Customer;
  onUpdated: (patch: Partial<Customer>) => void;
}

export function CustomerIndividualAlertTiming({
  customer,
  onUpdated,
}: CustomerIndividualAlertTimingProps) {
  const dealershipAlerts = useServiceAlertHelpers();
  const resolved = resolveCustomerAlertTiming(
    customer,
    dealershipAlerts.intervalDays,
    dealershipAlerts.bufferDays
  );

  const [intervalDays, setIntervalDays] = useState(
    customer.serviceAlertIntervalDays?.toString() ?? ''
  );
  const [bufferDays, setBufferDays] = useState(
    customer.serviceAlertBufferDays?.toString() ?? ''
  );
  const [overrideDate, setOverrideDate] = useState(
    getCustomerServiceAlertOverrideDate(customer) ?? ''
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIntervalDays(customer.serviceAlertIntervalDays?.toString() ?? '');
    setBufferDays(customer.serviceAlertBufferDays?.toString() ?? '');
    setOverrideDate(getCustomerServiceAlertOverrideDate(customer) ?? '');
  }, [customer]);

  const previewCustomer: Customer = {
    ...customer,
    ...normalizeCustomerAlertPatch({
      serviceAlertIntervalDays: intervalDays === '' ? '' : Number(intervalDays),
      serviceAlertBufferDays: bufferDays === '' ? '' : Number(bufferDays),
      serviceAlertOverrideDate: overrideDate,
    }),
  };
  const previewTiming = resolveCustomerAlertTiming(
    previewCustomer,
    dealershipAlerts.intervalDays,
    dealershipAlerts.bufferDays
  );
  const alertActive = dealershipAlerts.isServiceAlertActive(previewCustomer);
  const overridePending = isServiceAlertOverridePending(previewCustomer);
  const hasOverride = Boolean(overrideDate.trim());
  const nextDue = dealershipAlerts.getNextServiceMilestone(previewCustomer);

  const savedOverride = getCustomerServiceAlertOverrideDate(customer) ?? '';

  const hasChanges =
    intervalDays !== (customer.serviceAlertIntervalDays?.toString() ?? '') ||
    bufferDays !== (customer.serviceAlertBufferDays?.toString() ?? '') ||
    overrideDate !== savedOverride;

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = normalizeCustomerAlertPatch({
        serviceAlertIntervalDays: intervalDays === '' ? '' : Number(intervalDays),
        serviceAlertBufferDays: bufferDays === '' ? '' : Number(bufferDays),
        serviceAlertOverrideDate: overrideDate,
      });
      await updateDoc(
        doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id),
        {
          serviceAlertIntervalDays:
            patch.serviceAlertIntervalDays != null
              ? patch.serviceAlertIntervalDays
              : deleteField(),
          serviceAlertBufferDays:
            patch.serviceAlertBufferDays != null ? patch.serviceAlertBufferDays : deleteField(),
          serviceAlertOverrideDate: patch.serviceAlertOverrideDate ?? deleteField(),
          serviceAlertHoldUntil: deleteField(),
        }
      );
      onUpdated(patch);
    } catch (err) {
      console.error('[CustomerAlertTiming] Save failed:', err);
      alert('Could not save alert timing for this customer.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setIntervalDays('');
    setBufferDays('');
    setOverrideDate('');
    setSaving(true);
    try {
      await updateDoc(
        doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id),
        {
          serviceAlertIntervalDays: deleteField(),
          serviceAlertBufferDays: deleteField(),
          serviceAlertOverrideDate: deleteField(),
          serviceAlertHoldUntil: deleteField(),
        }
      );
      onUpdated({
        serviceAlertIntervalDays: undefined,
        serviceAlertBufferDays: undefined,
        serviceAlertOverrideDate: undefined,
        serviceAlertHoldUntil: undefined,
      });
    } catch (err) {
      console.error('[CustomerAlertTiming] Clear failed:', err);
      alert('Could not clear custom alert timing.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
      <div className="flex items-start gap-3 border-b border-indigo-500/10 pb-3">
        <User size={14} className="text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <h5 className="text-xs font-black text-indigo-200 uppercase tracking-[0.2em]">
            Individual alert schedule
          </h5>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
            Override the dealership default for this customer only. Leave interval fields blank to
            use store settings ({dealershipAlerts.intervalDays} days
            {dealershipAlerts.bufferDays > 0 ? ` + ${dealershipAlerts.bufferDays} buffer` : ''}).
          </p>
        </div>
      </div>

      <label className="block space-y-2 p-4 rounded-xl border border-amber-500/25 bg-amber-950/15">
        <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
          <ShieldCheck size={12} />
          Service alert override
        </span>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Set the exact date this customer should next appear in Service Alerts. Replaces the
          auto-calculated schedule until that date — use when it is not time to contact them yet.
        </p>
        <input
          type="date"
          value={overrideDate}
          onChange={(e) => setOverrideDate(e.target.value)}
          className="input-field w-full sm:max-w-xs font-mono text-sm"
        />
        {hasOverride ? (
          <p className="text-[10px] text-amber-200/90 font-medium">
            Override active — alert scheduled for{' '}
            <span className="font-bold">{formatServiceAlertOverrideDate(overrideDate)}</span>
          </p>
        ) : null}
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
            Days between service
          </span>
          <input
            type="number"
            min={30}
            max={730}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            placeholder={String(dealershipAlerts.intervalDays)}
            disabled={hasOverride}
            className="input-field w-full font-mono tabular-nums text-sm disabled:opacity-50"
          />
          {hasOverride ? (
            <span className="text-[9px] text-slate-500">Ignored while override date is set</span>
          ) : null}
        </label>

        <label className="space-y-1.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
            Buffer days after due
          </span>
          <input
            type="number"
            min={0}
            max={60}
            value={bufferDays}
            onChange={(e) => setBufferDays(e.target.value)}
            placeholder={String(dealershipAlerts.bufferDays)}
            disabled={hasOverride}
            className="input-field w-full font-mono tabular-nums text-sm disabled:opacity-50"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px]">
        <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
          <span className="text-slate-500 font-black uppercase tracking-wider block">
            {hasOverride ? 'Auto interval' : 'Effective interval'}
          </span>
          <span className="text-white font-bold mt-1 block">
            {hasOverride ? 'Overridden' : `${previewTiming.intervalDays} days`}
            {!hasOverride ? (
              <span className="text-slate-500 font-medium">
                {' '}
                (≈ {serviceAlertIntervalMonths(previewTiming.intervalDays)} mo)
              </span>
            ) : null}
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
          <span className="text-slate-500 font-black uppercase tracking-wider block flex items-center gap-1">
            <Calendar size={10} /> Next alert date
          </span>
          <span className="text-brand-secondary font-bold mt-1 block">{nextDue}</span>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
          <span className="text-slate-500 font-black uppercase tracking-wider block flex items-center gap-1">
            <Clock size={10} /> Alert status
          </span>
          <span
            className={cn(
              'font-black uppercase mt-1 block',
              overridePending
                ? 'text-amber-400'
                : alertActive
                  ? 'text-rose-400'
                  : 'text-emerald-400'
            )}
          >
            {overridePending ? 'Override set' : alertActive ? 'Due now' : 'Not due'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !hasChanges}
          className="btn-primary text-xs py-2 px-4 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save for this customer
        </button>
        {(resolved.usesCustomInterval ||
          resolved.usesCustomBuffer ||
          resolved.overrideDate ||
          intervalDays ||
          bufferDays ||
          overrideDate) && (
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={saving}
            className="btn-secondary text-xs py-2 px-4"
          >
            Clear overrides
          </button>
        )}
      </div>
    </div>
  );
}
