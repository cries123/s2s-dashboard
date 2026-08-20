import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Pencil } from 'lucide-react';
import type { Customer, DispatchRepairOrder, DispatchStatus, PerformanceAdvisorSlot } from '../../../types';
import { DISPATCH_STATUS_COLORS } from '../../../lib/dispatchConfig';
import {
  combinePromiseDateAndTime,
  splitPromiseTimeIso,
  validatePromiseDateAndTime,
} from '../../../lib/dispatchPromiseTime';
import { findCustomersByLastName, splitDispatchCustomerName } from '../../../lib/dispatchCustomerMatch';
import { formatPhoneAsYouType, formatPhoneDisplay } from '../../../lib/phoneFormat';
import { normalizeTechNumber, resolveTechDisplayName } from '../../../lib/dispatchTechRoster';
import { DispatchPromiseTimeInput } from './DispatchPromiseTimeInput';

export interface DispatchRoEditValues {
  customerFirstName: string;
  customerLastName: string;
  phoneNumber: string;
  roNumber: string;
  vinLastEight: string;
  techNumber: string;
  tagNumber: string;
  status: DispatchStatus;
  isWaiting: boolean;
  isPdl: boolean;
  promiseDate: string;
  promiseTime: string;
  concern: string;
  customerId?: string;
}

interface DispatchRoEditModalProps {
  ro: DispatchRepairOrder;
  customers?: Customer[];
  dispatchTechRoster: PerformanceAdvisorSlot[];
  techRoCounts: Map<string, number>;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: DispatchRoEditValues) => void | Promise<void>;
}

function initialValuesFromRo(ro: DispatchRepairOrder): DispatchRoEditValues {
  const { firstName, lastName } = splitDispatchCustomerName(ro.customerName, ro.customerLastName);
  const promise = splitPromiseTimeIso(ro.promiseTimeAt);
  return {
    customerFirstName: firstName,
    customerLastName: lastName,
    phoneNumber: formatPhoneDisplay(ro.phoneNumber),
    roNumber: ro.roNumber,
    vinLastEight: ro.vinLastEight || '',
    techNumber: ro.techNumber,
    tagNumber: ro.tagNumber || '',
    status: ro.status,
    isWaiting: !!ro.isWaiting,
    isPdl: !!ro.isPdl,
    promiseDate: promise.date,
    promiseTime: promise.time,
    concern: ro.concern || '',
    customerId: ro.customerId,
  };
}

export function DispatchRoEditModal({
  ro,
  customers = [],
  dispatchTechRoster,
  techRoCounts,
  saving = false,
  onClose,
  onSave,
}: DispatchRoEditModalProps) {
  const [values, setValues] = useState<DispatchRoEditValues>(() => initialValuesFromRo(ro));
  const [promiseTimeError, setPromiseTimeError] = useState<string | null>(null);

  useEffect(() => {
    setValues(initialValuesFromRo(ro));
    setPromiseTimeError(null);
  }, [ro]);

  const matchCandidates = useMemo(
    () => findCustomersByLastName(customers, values.customerLastName),
    [customers, values.customerLastName]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const roNumber = values.roNumber.trim();
    const techNumber = values.techNumber.trim();
    const customerLastName = values.customerLastName.trim();
    const tagNumber = values.tagNumber.trim();

    if (!roNumber || !techNumber || !customerLastName || !tagNumber) {
      setPromiseTimeError('RO number, last name, tech number, and tag number are required.');
      return;
    }

    const promiseValidation = validatePromiseDateAndTime(values.promiseDate, values.promiseTime);
    if (!promiseValidation.valid) {
      setPromiseTimeError(promiseValidation.error ?? 'Invalid promise time.');
      return;
    }

    setPromiseTimeError(null);
    onSave({
      ...values,
      roNumber,
      techNumber,
      customerLastName,
      tagNumber,
      customerFirstName: values.customerFirstName.trim(),
      phoneNumber: values.phoneNumber.trim(),
      vinLastEight: values.vinLastEight.trim().toUpperCase(),
      concern: values.concern.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-ro-edit-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-1.5">
              <Pencil size={12} />
              Edit repair order
            </p>
            <h2 id="dispatch-ro-edit-title" className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mt-0.5">
              {ro.roNumber}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                First name
              </label>
              <input
                type="text"
                value={values.customerFirstName}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, customerFirstName: e.target.value, customerId: undefined }))
                }
                className="input-field w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                Last name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={values.customerLastName}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, customerLastName: e.target.value, customerId: undefined }))
                }
                className="input-field w-full uppercase"
                required
              />
            </div>
          </div>

          {matchCandidates.length > 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 p-2 space-y-1 max-h-28 overflow-y-auto">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 px-1">
                CRM matches
              </p>
              {matchCandidates.slice(0, 5).map((cust) => (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() =>
                    setValues((prev) => ({
                      ...prev,
                      customerFirstName: cust.firstName || '',
                      customerLastName: cust.lastName,
                      phoneNumber: formatPhoneDisplay(cust.phone) || prev.phoneNumber,
                      vinLastEight: cust.vinLast8 || prev.vinLastEight,
                      customerId: cust.id,
                    }))
                  }
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[10px] text-slate-600 dark:text-slate-300 hover:bg-indigo-950/40"
                >
                  {cust.firstName} {cust.lastName}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
              Customer concern
            </label>
            <textarea
              value={values.concern}
              onChange={(e) => setValues((prev) => ({ ...prev, concern: e.target.value }))}
              rows={3}
              placeholder="What is the vehicle in for?"
              className="input-field w-full resize-y min-h-[4.5rem]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
              Phone
            </label>
            <input
              type="tel"
              placeholder="(805) 555-0100"
              value={values.phoneNumber}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, phoneNumber: formatPhoneAsYouType(e.target.value) }))
              }
              className="input-field w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                RO number <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={values.roNumber}
                onChange={(e) => setValues((prev) => ({ ...prev, roNumber: e.target.value }))}
                className="input-field w-full font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                Tag <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={values.tagNumber}
                onChange={(e) => setValues((prev) => ({ ...prev, tagNumber: e.target.value }))}
                className="input-field w-full uppercase"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                VIN last 8
              </label>
              <input
                type="text"
                maxLength={8}
                value={values.vinLastEight}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, vinLastEight: e.target.value.toUpperCase() }))
                }
                className="input-field w-full font-mono uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                Technician <span className="text-rose-400">*</span>
              </label>
              <select
                value={values.techNumber}
                onChange={(e) => setValues((prev) => ({ ...prev, techNumber: e.target.value }))}
                className="input-field w-full"
                required
              >
                {dispatchTechRoster.map((row) => {
                  const count = techRoCounts.get(normalizeTechNumber(row.id)) ?? 0;
                  return (
                    <option key={row.id} value={row.id}>
                      {resolveTechDisplayName(row.id, dispatchTechRoster)}
                      {count > 0 ? ` (${count})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <DispatchPromiseTimeInput
            date={values.promiseDate}
            time={values.promiseTime}
            onDateChange={(promiseDate) => {
              setValues((prev) => ({ ...prev, promiseDate }));
              setPromiseTimeError(null);
            }}
            onTimeChange={(promiseTime) => {
              setValues((prev) => ({ ...prev, promiseTime }));
              setPromiseTimeError(null);
            }}
            error={promiseTimeError}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={values.isWaiting}
                onChange={(e) => setValues((prev) => ({ ...prev, isWaiting: e.target.checked }))}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              Customer waiting
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={values.isPdl}
                onChange={(e) => setValues((prev) => ({ ...prev, isPdl: e.target.checked }))}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              PDL loaner
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
              Status
            </label>
            <select
              value={values.status}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, status: e.target.value as DispatchStatus }))
              }
              className="input-field w-full"
            >
              {Object.entries(DISPATCH_STATUS_COLORS).map(([code, info]) => (
                <option key={code} value={code}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-3">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-3">
              {saving ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
