import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { DealershipSettings } from '../../../types';
import { fetchPbsSyncStatus, runPbsSyncNow, waitForPbsSyncCompletion, type PbsSyncStatusResponse } from '../../../lib/pbsSyncApi';
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

/** Old failed runs may have stored raw HTML gateway pages — never render markup. */
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

export function PbsSyncPanel(props: PbsSyncPanelProps) {
  if (!isPbsSyncDealership(props.dealershipId)) {
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

  return <PbsSyncPanelInner {...props} />;
}

function PbsSyncPanelInner({
  dealershipName,
  settings,
  onSuccess,
  onError,
}: PbsSyncPanelProps) {
  const [syncing, setSyncing] = useState(false);
  const [fullRefreshing, setFullRefreshing] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [firestoreAdmin, setFirestoreAdmin] = useState(false);
  const [firestoreReachable, setFirestoreReachable] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [firestoreQuotaExceeded, setFirestoreQuotaExceeded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PbsSyncStatusResponse['diagnostics']>();
  const [cronStatus, setCronStatus] = useState<PbsSyncStatusResponse['cron']>();
  const [serverState, setServerState] = useState<PbsSyncStatusResponse['state']>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const resumeChecked = useRef(false);

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
      setCronStatus(status.cron);
      setServerState(status.state);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PBS sync status';
      setPanelError(message);
      console.error('[PbsSyncPanel] status error', err);
      return null;
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const lastState = serverState ?? settings?.pbsSyncState;
  const credentialsReady = configured && firestoreAdmin;
  const canPullFromPbs = credentialsReady;
  const statusHealthy = credentialsReady && firestoreReachable;
  const missingPbsVars = diagnostics?.missingPbsVars ?? [];
  const needsEnvSetup = !configured || !firestoreAdmin;
  const firebaseUsageUrl = diagnostics?.firebaseProjectId
    ? `https://console.firebase.google.com/project/${diagnostics.firebaseProjectId}/usage`
    : 'https://console.firebase.google.com/';

  const handleSync = async (fullRefresh = false) => {
    if (!canPullFromPbs) {
      const reason = !configured
        ? 'PBS credentials are not configured on the server.'
        : 'Firebase service account is not configured for server writes.';
      setPanelError(reason);
      onError?.(reason);
      return;
    }

    setPanelError(null);
    setPanelMessage(
      fullRefresh
        ? 'Full fleet refresh started — pulling all customers and repair orders. Keep this page open.'
        : 'Pulling PBS changes — keep this page open until it finishes.'
    );
    if (fullRefresh) setFullRefreshing(true);
    else setSyncing(true);

    try {
      const result = await runPbsSyncNow({ fullRefresh }, (progress) => {
        setPanelMessage(
          `Step ${progress.stageIndex} of ${progress.totalStages}: ${progress.stageLabel}${progress.detail ? ` (${progress.detail})` : ''}…`
        );
      });
      await refreshStatus();
      if (result.skipped) {
        const message = result.reason || 'Sync was skipped.';
        setPanelError(message);
        onError?.(message);
        return;
      }
      if (result.ok) {
        const message =
          result.summary ||
          (fullRefresh
            ? 'Full PBS fleet refresh completed.'
            : 'PBS changes since last sync pulled.');
        setPanelMessage(null);
        onSuccess?.(message);
      } else {
        const message = result.error || result.summary || 'PBS sync failed.';
        setPanelError(message);
        onError?.(message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PBS sync failed.';
      setPanelError(message);
      onError?.(message);
      await refreshStatus();
    } finally {
      setSyncing(false);
      setFullRefreshing(false);
      setPanelMessage(null);
    }
  };

  useEffect(() => {
    if (resumeChecked.current || statusLoading || syncing || fullRefreshing) return;
    if (!serverState?.syncInProgress) return;

    const startedMs = serverState.syncStartedAt
      ? new Date(serverState.syncStartedAt).getTime()
      : 0;
    const ageMs = startedMs ? Date.now() - startedMs : Number.POSITIVE_INFINITY;
    const STALE_MS = 5 * 60 * 1000;

    if (ageMs >= STALE_MS) {
      resumeChecked.current = true;
      void refreshStatus();
      return;
    }

    resumeChecked.current = true;
    setPanelMessage('A PBS sync is already running — waiting for it to finish…');
    setSyncing(true);
    let cancelled = false;

    (async () => {
      try {
        const result = await waitForPbsSyncCompletion(serverState.syncStartedAt);
        if (cancelled) return;
        await refreshStatus();
        if (result.ok) {
          onSuccess?.(result.summary || 'PBS sync completed.');
        } else if (!result.skipped) {
          const message = result.error || result.summary || 'PBS sync failed.';
          setPanelError(message);
          onError?.(message);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'PBS sync failed.';
        setPanelError(message);
        onError?.(message);
      } finally {
        if (!cancelled) {
          setSyncing(false);
          setPanelMessage(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    statusLoading,
    serverState?.syncInProgress,
    serverState?.syncStartedAt,
    syncing,
    fullRefreshing,
    refreshStatus,
    onSuccess,
    onError,
  ]);

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
        Pull Hyundai customer/vehicle changes from PBS PartnerHUB (matched by VIN). Use{' '}
        <strong className="text-slate-300">Pull changes</strong> for updates since the last
        successful sync; use <strong className="text-slate-300">Full fleet refresh</strong> only
        when you need to rebuild the entire directory from PBS. Also refreshes Operations
        appointment counts, advisor performance, technician efficiency, service reminders, vehicle
        inventory, and the dispatch board. Only{' '}
        <strong className="text-slate-300">{PBS_SYNC_DEALERSHIP_NAME}</strong> is modified. A scheduled
        job also runs every morning at 6:00 AM Pacific.
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSync(false)}
              disabled={syncing || fullRefreshing || !canPullFromPbs}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all',
                canPullFromPbs
                  ? 'bg-brand-primary text-slate-950 hover:brightness-110 disabled:opacity-60'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              )}
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? 'Pulling changes…' : 'Pull changes'}
            </button>
            <button
              type="button"
              onClick={() => handleSync(true)}
              disabled={syncing || fullRefreshing || !canPullFromPbs}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all border',
                canPullFromPbs
                  ? 'border-white/10 text-slate-200 hover:bg-white/5 disabled:opacity-60'
                  : 'border-slate-800 text-slate-500 cursor-not-allowed'
              )}
            >
              {fullRefreshing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              {fullRefreshing ? 'Full refresh…' : 'Full fleet refresh'}
            </button>
          </div>
        </div>

        {panelMessage ? (
          <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-3 flex items-start gap-2">
            <Loader2 size={14} className="animate-spin text-brand-primary shrink-0 mt-0.5" />
            <p className="text-xs text-slate-200 leading-relaxed">{panelMessage}</p>
          </div>
        ) : null}

        {panelError ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs text-rose-200/90">
            {cleanErrorText(panelError)}
          </div>
        ) : null}

        {!canPullFromPbs && !statusLoading ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3 text-xs text-slate-400">
            Pull is disabled until PBS credentials and the Firebase service account are configured on the server.
            Check the status cards above after Netlify redeploys.
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Morning auto-sync</p>
            <p
              className={cn(
                'text-xs font-bold mt-1',
                cronStatus?.cronReady ? 'text-emerald-300' : 'text-amber-300'
              )}
            >
              {cronStatus?.cronReady ? 'Scheduled (6 AM Pacific)' : 'Not ready'}
            </p>
            {cronStatus?.lastRunAt ? (
              <p className="text-[10px] text-slate-600 mt-1">
                Last scheduled run {formatWhen(cronStatus.lastRunAt)}
                {cronStatus.lastRunOk === false ? ' · failed' : ''}
              </p>
            ) : cronStatus?.cronReady ? (
              <p className="text-[10px] text-slate-600 mt-1">No scheduled run logged yet</p>
            ) : cronStatus?.missingForCron?.length ? (
              <p className="text-[10px] text-amber-400/90 mt-1 line-clamp-3">
                Missing: {cronStatus.missingForCron.join(', ')}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Last sync</p>
            <p className="text-xs font-bold text-slate-200 mt-1">
              {lastState?.lastSyncAt ? formatWhen(lastState.lastSyncAt) : 'Never'}
            </p>
            {lastState?.lastSuccessfulSyncAt ? (
              <p className="text-[10px] text-slate-600 mt-1">
                Pull changes since {formatWhen(lastState.lastSuccessfulSyncAt)}
              </p>
            ) : null}
            {lastState?.syncInProgress ? (
              <p className="text-[10px] text-brand-primary mt-1 flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                Sync in progress…
              </p>
            ) : lastState?.lastSyncOk === false ? (
              <p className="text-[10px] text-rose-400 mt-1 line-clamp-2">{cleanErrorText(lastState.lastError)}</p>
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
                {cronStatus && !cronStatus.cronReady ? (
                  <p>
                    Morning auto-sync will not run until PBS credentials and{' '}
                    <code className="text-amber-100">FIREBASE_SERVICE_ACCOUNT_JSON</code> are set. Check the
                    Morning auto-sync card above after redeploy.
                  </p>
                ) : null}
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

      <p className="text-[10px] text-slate-600 leading-relaxed">
        Sync history is under <strong className="text-slate-400">Admin → Logs → PBS sync log</strong>.
      </p>
    </div>
  );
}

export default PbsSyncPanel;
