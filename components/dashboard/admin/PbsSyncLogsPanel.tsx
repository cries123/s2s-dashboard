import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Users } from 'lucide-react';
import type { DealershipSettings, PbsSyncLogEntry } from '../../../types';
import { fetchPbsSyncStatus } from '../../../lib/pbsSyncApi';
import { isPbsSyncDealership } from '../../../lib/pbsSyncScope';
import { cn } from '../../../lib/utils';

interface PbsSyncLogsPanelProps {
  dealershipId: string;
  settings?: Partial<DealershipSettings>;
}

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function cleanErrorText(raw?: string | null): string {
  const text = (raw || '').trim();
  if (!text) return '';
  if (text.startsWith('<')) {
    if (/inactivity timeout/i.test(text)) {
      return 'The server took too long to respond (gateway timeout). Please try again.';
    }
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  return text;
}

function triggerLabel(entry: PbsSyncLogEntry): string {
  if (entry.triggeredBy === 'cron') return 'Scheduled (6 AM)';
  if (entry.triggeredByUsername) return entry.triggeredByUsername;
  if (entry.triggeredByEmail) return entry.triggeredByEmail;
  return 'Manual';
}

export function LogRow({ entry }: { entry: PbsSyncLogEntry }) {
  const isPartial = entry.ok && !!entry.hadPartialFailure;
  const stageErrors = [
    entry.counts.appointmentScheduleError && { label: 'Appointment schedule', text: entry.counts.appointmentScheduleError },
    entry.counts.performanceSyncError && { label: 'Advisor performance', text: entry.counts.performanceSyncError },
    entry.counts.technicianSyncError && { label: 'Technician efficiency', text: entry.counts.technicianSyncError },
    entry.counts.extendedSyncError && { label: 'Reminders/inventory/dispatch', text: entry.counts.extendedSyncError },
  ].filter((e): e is { label: string; text: string } => Boolean(e));

  return (
    <li className="py-3 border-b border-slate-200 dark:border-white/5 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {entry.ok && !isPartial ? (
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle size={14} className={isPartial ? 'text-amber-400 shrink-0' : 'text-rose-400 shrink-0'} />
          )}
          <span
            className={cn(
              'text-[10px] font-black uppercase tracking-wider',
              !entry.ok ? 'text-rose-300' : isPartial ? 'text-amber-300' : 'text-emerald-300'
            )}
          >
            {!entry.ok ? 'Failed' : isPartial ? 'Partial' : 'Success'}
          </span>
          <span className="text-[10px] text-slate-600">·</span>
          <span className="text-[10px] text-slate-500 font-medium">{triggerLabel(entry)}</span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono shrink-0">{formatWhen(entry.finishedAt)}</span>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">{entry.summary}</p>

      {stageErrors.length > 0 ? (
        <div className="mt-2 space-y-1">
          {stageErrors.map((e) => (
            <p key={e.label} className="text-[11px] text-amber-400/90 leading-relaxed">
              <span className="font-black uppercase tracking-wider">{e.label} failed:</span>{' '}
              {cleanErrorText(e.text)}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {[
          { label: 'Customers pulled', value: entry.fetched.contactVehicles },
          { label: 'ROs pulled', value: entry.fetched.repairOrders },
          { label: 'Appts pulled', value: entry.fetched.appointments },
          { label: 'New profiles', value: entry.counts.customersCreated },
          { label: 'Updated profiles', value: entry.counts.customersUpdated },
          { label: 'Owner changes', value: entry.counts.ownerChanges ?? 0 },
          { label: 'Visit lists updated', value: entry.counts.visitsMerged },
          { label: 'Ops days', value: entry.counts.appointmentDaysUpdated },
          { label: 'Perf advisors', value: entry.counts.performanceAdvisors ?? 0 },
          { label: 'Cashiered ROs', value: entry.counts.performanceRepairOrders ?? 0 },
          { label: 'Tech reports', value: entry.counts.technicianReports ?? 0 },
          { label: 'Reminders', value: entry.counts.serviceRemindersUpdated ?? 0 },
          { label: 'Inventory', value: entry.counts.inventoryVehiclesWritten ?? 0 },
          { label: 'Dispatch ROs', value: entry.counts.dispatchOrdersUpserted ?? 0 },
        ].map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-950/60 px-2 py-1 text-[10px] text-slate-400"
          >
            <span className="font-black uppercase tracking-wider text-slate-500">{chip.label}</span>
            <span className="font-mono text-slate-200">{chip.value}</span>
          </span>
        ))}
      </div>

      {entry.counts.performanceSyncWarning ? (
        <p className="text-[11px] text-amber-400/90 mt-2 line-clamp-3">
          {entry.counts.performanceSyncWarning}
        </p>
      ) : null}

      {entry.counts.technicianSyncWarning ? (
        <p className="text-[11px] text-amber-400/90 mt-2 line-clamp-3">
          {entry.counts.technicianSyncWarning}
        </p>
      ) : null}

      {entry.error && !isPartial ? (
        <p className="text-[11px] text-rose-400/90 mt-2 line-clamp-3">{cleanErrorText(entry.error)}</p>
      ) : null}
    </li>
  );
}

export function PbsSyncLogsPanel({ dealershipId, settings }: PbsSyncLogsPanelProps) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [logs, setLogs] = useState<PbsSyncLogEntry[]>(settings?.pbsSyncLogs ?? []);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await fetchPbsSyncStatus();
      if (status.logs.length > 0) {
        setLogs(status.logs);
      }
    } catch (err) {
      console.error('[PbsSyncLogsPanel] status error', err);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPbsSyncDealership(dealershipId)) {
      void refreshStatus();
    } else {
      setStatusLoading(false);
    }
  }, [dealershipId, refreshStatus]);

  useEffect(() => {
    if (settings?.pbsSyncLogs?.length) {
      setLogs(settings.pbsSyncLogs);
    }
  }, [settings?.pbsSyncLogs]);

  const displayLogs = logs.length > 0 ? logs : settings?.pbsSyncLogs ?? [];

  if (!isPbsSyncDealership(dealershipId)) {
    return null;
  }

  return (
    <div className="card-base rounded-2xl border border-slate-200 dark:border-white/5 p-5 mt-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-brand-primary" />
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">PBS sync log</h4>
        </div>
        <button
          type="button"
          onClick={refreshStatus}
          disabled={statusLoading}
          className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {statusLoading && displayLogs.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-6 justify-center">
          <Loader2 size={14} className="animate-spin" />
          Loading PBS sync history…
        </div>
      ) : displayLogs.length === 0 ? (
        <div className="text-center py-8">
          <Users size={24} className="mx-auto text-slate-600 mb-2" />
          <p className="text-xs text-slate-500">No PBS syncs recorded yet.</p>
          <p className="text-[10px] text-slate-600 mt-1">Use Admin → PBS Sync → Pull changes to import data.</p>
        </div>
      ) : (
        <ul className="max-h-[32rem] overflow-y-auto pr-1">
          {displayLogs.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default PbsSyncLogsPanel;
