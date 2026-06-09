import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Loader2, Save, User } from 'lucide-react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Customer } from '../../../types';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import {
  isServiceAlertOnHold,
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
  const [holdUntil, setHoldUntil] = useState(customer.serviceAlertHoldUntil ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIntervalDays(customer.serviceAlertIntervalDays?.toString() ?? '');
    setBufferDays(customer.serviceAlertBufferDays?.toString() ?? '');
    setHoldUntil(customer.serviceAlertHoldUntil ?? '');
  }, [customer]);

  const previewCustomer: Customer = {
    ...customer,
    ...normalizeCustomerAlertPatch({
      serviceAlertIntervalDays: intervalDays === '' ? '' : Number(intervalDays),
      serviceAlertBufferDays: bufferDays === '' ? '' : Number(bufferDays),
      serviceAlertHoldUntil: holdUntil,
    }),
  };
  const previewTiming = resolveCustomerAlertTiming(
    previewCustomer,
    dealershipAlerts.intervalDays,
    dealershipAlerts.bufferDays
  );
  const alertActive = dealershipAlerts.isServiceAlertActive(previewCustomer);
  const onHold = isServiceAlertOnHold(previewCustomer);
  const nextDue = dealershipAlerts.getNextServiceMilestone(previewCustomer);

  const hasChanges =
    intervalDays !== (customer.serviceAlertIntervalDays?.toString() ?? '') ||
    bufferDays !== (customer.serviceAlertBufferDays?.toString() ?? '') ||
    holdUntil !== (customer.serviceAlertHoldUntil ?? '');

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = normalizeCustomerAlertPatch({
        serviceAlertIntervalDays: intervalDays === '' ? '' : Number(intervalDays),
        serviceAlertBufferDays: bufferDays === '' ? '' : Number(bufferDays),
        serviceAlertHoldUntil: holdUntil,
      });

      const firestorePatch: Record<string, unknown> = {};
      if (patch.serviceAlertIntervalDays != null) {
        firestorePatch.serviceAlertIntervalDays = patch.serviceAlertIntervalDays;
      } else {
        firestorePatch.serviceAlertIntervalDays = deleteField();
      }
      if (patch.serviceAlertBufferDays != null) {
        firestorePatch.serviceAlertBufferDays = patch.serviceAlertBufferDays;
      } else {
        firestorePatch.serviceAlertBufferDays = deleteField();
      }
      if (patch.serviceAlertHoldUntil) {
        firestorePatch.serviceAlertHoldUntil = patch.serviceAlertHoldUntil;
      } else {
        firestorePatch.serviceAlertHoldUntil = deleteField();
      }

      await updateDoc(
        doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id),
        firestorePatch
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
    setHoldUntil('');
    setSaving(true);
    try {
      await updateDoc(
        doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id),
        {
          serviceAlertIntervalDays: deleteField(),
          serviceAlertBufferDays: deleteField(),
          serviceAlertHoldUntil: deleteField(),
        }
      );
      onUpdated({
        serviceAlertIntervalDays: undefined,
        serviceAlertBufferDays: undefined,
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
            Override the dealership default for this customer only. Leave blank to use store
            settings ({dealershipAlerts.intervalDays} days
            {dealershipAlerts.bufferDays > 0 ? ` + ${dealershipAlerts.bufferDays} buffer` : ''}).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            className="input-field w-full font-mono tabular-nums text-sm"
          />
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
            className="input-field w-full font-mono tabular-nums text-sm"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block flex items-center gap-1">
            <Calendar size={10} /> Don't contact until
          </span>
          <input
            type="date"
            value={holdUntil}
            onChange={(e) => setHoldUntil(e.target.value)}
            className="input-field w-full font-mono text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px]">
        <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
          <span className="text-slate-500 font-black uppercase tracking-wider block">Effective interval</span>
          <span className="text-white font-bold mt-1 block">
            {previewTiming.intervalDays} days
            <span className="text-slate-500 font-medium">
              {' '}
              (≈ {serviceAlertIntervalMonths(previewTiming.intervalDays)} mo)
            </span>
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
          <span className="text-slate-500 font-black uppercase tracking-wider block flex items-center gap-1">
            <Clock size={10} /> Next alert date
          </span>
          <span className="text-brand-secondary font-bold mt-1 block">{nextDue}</span>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
          <span className="text-slate-500 font-black uppercase tracking-wider block">Alert status</span>
          <span
            className={cn(
              'font-black uppercase mt-1 block',
              onHold ? 'text-amber-400' : alertActive ? 'text-rose-400' : 'text-emerald-400'
            )}
          >
            {onHold ? 'On hold' : alertActive ? 'Due now' : 'Not due'}
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
          resolved.holdUntil ||
          intervalDays ||
          bufferDays ||
          holdUntil) && (
          <button
            type="button"
            onClick={handleClear}
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
