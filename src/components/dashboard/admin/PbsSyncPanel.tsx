import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { DealershipSettings, PbsSyncLogEntry } from '../../../types';
import { fetchPbsSyncStatus, runPbsSyncNow, type PbsSyncStatusResponse } from '../../../lib/pbsSyncApi';
import { isPbsSyncDealership, PBS_SYNC_DEALERSHIP_NAME } from '../../../lib/pbsSyncScope';
import { cn } from '../../../lib/utils';

interface PbsSyncPanelProps {
  dealershipId: string;
  dealershipName: string;
  settings?: Partial<DealershipSettings>;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function triggerLabel(entry: PbsSyncLogEntry): string {
  if (entry.triggeredBy === 'cron') return 'Scheduled (8 AM)';
  if (entry.triggeredByUsername) return entry.triggeredByUsername;
  if (entry.triggeredByEmail) return entry.triggeredByEmail;
  return 'Manual';
}

function LogRow({ entry }: { entry: PbsSyncLogEntry }) {
  return (
    <li className="py-3 border-b border-white/5 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {entry.ok ? (
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle size={14} className="text-rose-400 shrink-0" />
          )}
          <span
            className={cn(
              'text-[10px] font-black uppercase tracking-wider',
              entry.ok ? 'text-emerald-300' : 'text-rose-300'
            )}
          >
            {entry.ok ? 'Success' : 'Failed'}
          </span>
          <span className="text-[10px] text-slate-600">·</span>
          <span className="text-[10px] text-slate-500 font-medium">{triggerLabel(entry)}</span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono shrink-0">{formatWhen(entry.finishedAt)}</span>
      </div>

      <p className="text-xs text-slate-300 mt-2 leading-relaxed">{entry.summary}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {[
          { label: 'Customers pulled', value: entry.fetched.contactVehicles },
          { label: 'ROs pulled', value: entry.fetched.repairOrders },
          { label: 'Appts pulled', value: entry.fetched.appointments },
          { label: 'New profiles', value: entry.counts.customersCreated },
          { label: 'Updated profiles', value: entry.counts.customersUpdated },
          { label: 'Visits merged', value: entry.counts.visitsMerged },
          { label: 'Ops days', value: entry.counts.appointmentDaysUpdated },
        ].map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1 rounded-lg border border-white/5 bg-slate-950/60 px-2 py-1 text-[10px] text-slate-400"
          >
            <span className="font-black uppercase tracking-wider text-slate-500">{chip.label}</span>
            <span className="font-mono text-slate-200">{chip.value}</span>
          </span>
        ))}
      </div>

      {entry.error ? (
        <p className="text-[11px] text-rose-400/90 mt-2 line-clamp-3">{entry.error}</p>
      ) : null}
    </li>
  );
}

export function PbsSyncPanel({
  dealershipId,
  dealershipName,
  settings,
  onSuccess,
  onError,
}: PbsSyncPanelProps) {
  if (!isPbsSyncDealership(dealershipId)) {
    return (
      <div className="card-base rounded-2xl border border-white/5 p-6">
        <p className="text-sm text-slate-300 font-medium">PBS automated sync is not enabled for this store.</p>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-2xl">
          PartnerHUB sync only runs for <strong className="text-slate-300">{PBS_SYNC_DEALERSHIP_NAME}</strong>.
          Nissan/Mazda and Ford/Lincoln use separate DMS import workflows — their customer directories are never
          modified by PBS sync.
        </p>
      </div>
    );
  }

  const [syncing, setSyncing] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [firestoreAdmin, setFirestoreAdmin] = useState(false);
  const [firestoreReachable, setFirestoreReachable] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [firestoreQuotaExceeded, setFirestoreQuotaExceeded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PbsSyncStatusResponse['diagnostics']>();
  const [logs, setLogs] = useState<PbsSyncLogEntry[]>(settings?.pbsSyncLogs ?? []);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await fetchPbsSyncStatus();
      setConfigured(status.configured);
      setFirestoreAdmin(status.firestoreAdmin);
      setFirestoreReachable(status.firestoreReachable !== false);
      setFirestoreError(status.firestoreError ?? null);
      setFirestoreQuotaExceeded(Boolean(status.firestoreQuotaExceeded));
      setDiagnostics(status.diagnostics);
      if (status.logs.length > 0) {
        setLogs(status.logs);
      }
    } catch (err) {
      console.error('[PbsSyncPanel] status error', err);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (settings?.pbsSyncLogs?.length) {
      setLogs(settings.pbsSyncLogs);
    }
  }, [settings?.pbsSyncLogs]);

  const lastState = settings?.pbsSyncState;
  const displayLogs = logs.length > 0 ? logs : settings?.pbsSyncLogs ?? [];
  const credentialsReady = configured && firestoreAdmin;
  const canPullFromPbs = credentialsReady;
  const statusHealthy = credentialsReady && firestoreReachable;
  const missingPbsVars = diagnostics?.missingPbsVars ?? [];
  const needsEnvSetup = !configured || !firestoreAdmin;
  const firebaseUsageUrl = diagnostics?.firebaseProjectId
    ? `https://console.firebase.google.com/project/${diagnostics.firebaseProjectId}/usage`
    : 'https://console.firebase.google.com/';

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await runPbsSyncNow();
      if (result.skipped) {
        onError?.(result.reason || 'Sync was skipped.');
        return;
      }
      await refreshStatus();
      if (result.ok) {
        onSuccess?.(result.summary || 'PBS data pulled into Directory and Operations.');
      } else {
        onError?.(result.error || result.summary || 'PBS sync failed.');
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'PBS sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
        Pull customers, service history, mileage, and this month&apos;s appointments from PBS PartnerHUB into{' '}
        <strong className="text-slate-300">{PBS_SYNC_DEALERSHIP_NAME}</strong> only. Other dealerships in this
        program are not modified. A scheduled job also runs every morning at 8:00 AM Pacific.
      </p>

      <div className="card-base rounded-2xl border border-white/5 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database size={16} className="text-brand-primary" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">{dealershipName}</h3>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              PBS PartnerHUB · Serial 8200
            </p>
          </div>

          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !canPullFromPbs}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all',
              canPullFromPbs
                ? 'bg-brand-primary text-slate-950 hover:brightness-110 disabled:opacity-60'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            )}
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Pulling from PBS…' : 'Pull from PBS now'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">PBS credentials</p>
            <p className={cn('text-xs font-bold mt-1', configured ? 'text-emerald-300' : 'text-rose-300')}>
              {configured ? 'Configured' : 'Not configured'}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Server writes</p>
            <p
              className={cn(
                'text-xs font-bold mt-1',
                firestoreAdmin && firestoreReachable
                  ? 'text-emerald-300'
                  : firestoreAdmin
                    ? 'text-amber-300'
                    : 'text-rose-300'
              )}
            >
              {firestoreAdmin && firestoreReachable
                ? 'Ready'
                : firestoreAdmin
                  ? 'Firestore unreachable'
                  : 'Service account missing'}
            </p>
            {firestoreError ? (
              <p className="text-[10px] text-amber-400/90 mt-1 line-clamp-3">{firestoreError}</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Last sync</p>
            <p className="text-xs font-bold text-slate-200 mt-1">
              {lastState?.lastSyncAt ? formatWhen(lastState.lastSyncAt) : 'Never'}
            </p>
            {lastState?.lastSyncOk === false ? (
              <p className="text-[10px] text-rose-400 mt-1 line-clamp-2">{lastState.lastError}</p>
            ) : lastState?.summary ? (
              <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{lastState.summary}</p>
            ) : null}
          </div>
        </div>

        {!statusHealthy && !statusLoading ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 text-xs text-amber-100/90 space-y-2">
            {firestoreQuotaExceeded ? (
              <>
                <p>
                  <strong className="text-amber-50">Firebase read/write quota is exceeded.</strong> PBS credentials
                  and the service account are configured correctly — Firestore is temporarily blocking requests.
                </p>
                <p>
                  Open{' '}
                  <a
                    href={firebaseUsageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-50 underline underline-offset-2 hover:text-white"
                  >
                    Firebase Console → Usage
                  </a>{' '}
                  to check daily limits and billing, or wait for the quota to reset (usually midnight Pacific).
                </p>
                <p className="text-amber-200/80">
                  The dashboard loads the full customer list on every visit, which can use up the free-tier quota
                  quickly. Upgrading to the Blaze (pay-as-you-go) plan removes the hard daily cap.
                </p>
              </>
            ) : needsEnvSetup ? (
              <>
                <p>
                  Server-side env vars are not ready yet. After saving variables in Netlify, trigger a new{' '}
                  <strong className="text-amber-50">production deploy</strong> — saving alone does not update live
                  functions.
                </p>
                {missingPbsVars.length ? (
                  <p>
                    Missing PBS vars on the server:{' '}
                    <code className="text-amber-100">{missingPbsVars.join(', ')}</code>
                  </p>
                ) : null}
                {diagnostics?.serviceAccountMessage ? (
                  <p>{diagnostics.serviceAccountMessage}</p>
                ) : (
                  <p>
                    Set <code className="text-amber-100">FIREBASE_SERVICE_ACCOUNT_JSON</code> to the entire
                    downloaded Firebase service-account JSON file (not just the private key).
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  Firestore could not be reached from the server. PBS credentials and the service account look
                  configured — this is usually a temporary Firebase outage or permission issue.
                </p>
                {firestoreError ? <p>{firestoreError}</p> : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="card-base rounded-2xl border border-white/5 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-brand-primary" />
            <h4 className="text-sm font-black text-white uppercase tracking-wider">Sync activity log</h4>
          </div>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={statusLoading}
            className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-white transition-colors"
          >
            Refresh
          </button>
        </div>

        {statusLoading && displayLogs.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-6 justify-center">
            <Loader2 size={14} className="animate-spin" />
            Loading sync history…
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="text-center py-8">
            <Users size={24} className="mx-auto text-slate-600 mb-2" />
            <p className="text-xs text-slate-500">No PBS syncs recorded yet.</p>
            <p className="text-[10px] text-slate-600 mt-1">Click &quot;Pull from PBS now&quot; to import data.</p>
          </div>
        ) : (
          <ul className="max-h-[32rem] overflow-y-auto pr-1">
            {displayLogs.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PbsSyncPanel;
