import React from 'react';
import { CheckCircle2, Plus, RefreshCw, UserSearch } from 'lucide-react';
import { Customer } from '../../../types';
import { DISPATCH_STATUS_COLORS } from '../../../lib/dispatchConfig';
import type { PerformanceAdvisorSlot } from '../../../types';

interface DispatchIntakeFormProps {
  customerFirstName: string;
  setCustomerFirstName: (v: string) => void;
  customerLastName: string;
  setCustomerLastName: (v: string) => void;
  roNumber: string;
  setRoNumber: (v: string) => void;
  vinLastEight: string;
  setVinLastEight: (v: string) => void;
  techNumber: string;
  setTechNumber: (v: string) => void;
  tagNumber: string;
  setTagNumber: (v: string) => void;
  initialStatus: 'WIP' | 'DIS' | 'POO' | 'WFA';
  setInitialStatus: (v: 'WIP' | 'DIS' | 'POO' | 'WFA') => void;
  quickComplete: boolean;
  setQuickComplete: (v: boolean) => void;
  submitting: boolean;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  matchCandidates: Customer[];
  dispatchTechRoster: PerformanceAdvisorSlot[];
  onSubmit: (e: React.FormEvent) => void;
}

export function DispatchIntakeForm({
  customerFirstName,
  setCustomerFirstName,
  customerLastName,
  setCustomerLastName,
  roNumber,
  setRoNumber,
  vinLastEight,
  setVinLastEight,
  techNumber,
  setTechNumber,
  tagNumber,
  setTagNumber,
  initialStatus,
  setInitialStatus,
  quickComplete,
  setQuickComplete,
  submitting,
  selectedCustomer,
  setSelectedCustomer,
  matchCandidates,
  dispatchTechRoster,
  onSubmit,
}: DispatchIntakeFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
            First Name <span className="text-slate-600 font-bold normal-case tracking-normal">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Maria"
            value={customerFirstName}
            onChange={(e) => setCustomerFirstName(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all focus:ring-2 focus:ring-indigo-500/15 font-semibold"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5 flex items-center gap-1">
            <UserSearch size={10} className="text-indigo-400/80" />
            Last Name <span className="text-rose-400/90">*</span>
          </label>
          <input
            type="text"
            placeholder="Martinez"
            value={customerLastName}
            onChange={(e) => {
              setCustomerLastName(e.target.value);
              setSelectedCustomer(null);
            }}
            className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all focus:ring-2 focus:ring-indigo-500/15 font-semibold uppercase"
            required
          />
        </div>
      </div>

      {selectedCustomer && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-500/25">
          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
          <p className="text-[10px] font-bold text-emerald-200/90 truncate">
            CRM linked · {selectedCustomer.firstName} {selectedCustomer.lastName}
            {selectedCustomer.model ? ` · ${selectedCustomer.year || ''} ${selectedCustomer.model}` : ''}
          </p>
        </div>
      )}

      {customerLastName.trim().length >= 2 && matchCandidates.length > 0 && !selectedCustomer && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 overflow-hidden">
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 px-3 py-1.5 border-b border-slate-800/60">
            CRM matches
          </p>
          <div className="max-h-28 overflow-y-auto p-1.5 space-y-1">
            {matchCandidates.slice(0, 6).map((cust) => (
              <button
                key={cust.id}
                type="button"
                onClick={() => {
                  setSelectedCustomer(cust);
                  setCustomerFirstName(cust.firstName || '');
                  setCustomerLastName(cust.lastName);
                  setVinLastEight(cust.vinLast8 || '');
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-[10px] border border-transparent bg-slate-900/60 text-slate-300 hover:bg-indigo-950/40 hover:border-indigo-500/30 transition-all"
              >
                <span className="font-bold text-white">
                  {cust.firstName} {cust.lastName}
                </span>
                <span className="text-slate-500 block mt-0.5 font-mono text-[9px]">
                  {[cust.vinLast8 && `VIN …${cust.vinLast8}`, cust.model && `${cust.year || ''} ${cust.model}`.trim()]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {customerLastName.trim().length >= 2 && matchCandidates.length === 0 && (
        <p className="text-[9px] text-amber-400/80 pl-0.5 font-medium">
          No CRM match — ticket will use the name you entered.
        </p>
      )}

      <div className="space-y-1.5">
        <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
          RO Number <span className="text-rose-400/90">*</span>
        </label>
        <input
          type="text"
          placeholder="883719"
          value={roNumber}
          onChange={(e) => setRoNumber(e.target.value)}
          className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all focus:ring-2 focus:ring-indigo-500/15 font-semibold tabular-nums"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
          VIN Last 8 <span className="text-slate-600 font-bold normal-case tracking-normal">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="G2054992"
          maxLength={8}
          value={vinLastEight}
          onChange={(e) => setVinLastEight(e.target.value.toUpperCase())}
          className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all focus:ring-2 focus:ring-indigo-500/15 font-mono font-bold uppercase tracking-wider"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
            Tech Number <span className="text-rose-400/90">*</span>
          </label>
          <input
            type="text"
            list="dispatch-tech-roster"
            placeholder="402"
            value={techNumber}
            onChange={(e) => setTechNumber(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all focus:ring-2 focus:ring-indigo-500/15 font-mono font-bold tabular-nums"
            required
          />
          <datalist id="dispatch-tech-roster">
            {dispatchTechRoster.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
            Tag Number <span className="text-rose-400/90">*</span>
          </label>
          <input
            type="text"
            placeholder="A-142"
            value={tagNumber}
            onChange={(e) => setTagNumber(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all focus:ring-2 focus:ring-indigo-500/15 font-semibold uppercase"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
          Status <span className="text-slate-600 font-bold normal-case tracking-normal">(optional)</span>
        </label>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
            style={{ backgroundColor: DISPATCH_STATUS_COLORS[initialStatus].hex }}
          />
          <select
            value={initialStatus}
            onChange={(e) => setInitialStatus(e.target.value as typeof initialStatus)}
            className="w-full appearance-none bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg pl-7 pr-8 py-2.5 text-[11px] text-slate-200 font-bold uppercase tracking-wide cursor-pointer focus:ring-2 focus:ring-indigo-500/15"
          >
            {Object.entries(DISPATCH_STATUS_COLORS).map(([val, info]) => (
              <option key={val} value={val} className="bg-slate-950 text-white">
                {info.label} ({val})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            id="quickComplete"
            checked={quickComplete}
            onChange={(e) => setQuickComplete(e.target.checked)}
            className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500/30 w-4 h-4 cursor-pointer"
          />
          <span className="text-[10px] text-slate-500 group-hover:text-slate-300 font-semibold transition-colors">
            Mark completed on intake
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 shadow-lg shadow-indigo-950/40 transition-all duration-200"
        >
          {submitting ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
          Queue Ticket
        </button>
      </div>
    </form>
  );
}

export function DispatchIntakePanel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-slate-900/90 via-slate-950 to-indigo-950/30 shadow-xl shadow-black/20">
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-400/20 shrink-0">
            <Plus size={16} className="text-indigo-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Fast Intake</h2>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-relaxed">
              Enter customer name, RO details, and tag — last name can match CRM.
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
