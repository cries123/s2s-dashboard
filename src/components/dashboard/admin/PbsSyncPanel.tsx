import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { DealershipSettings } from '../../../types';
import {
  fetchPbsSyncStatus,
  probePbsCapabilities,
  runPbsSyncNow,
  previewRepairOrderLinking,
  runVisitMigration,
  runDuplicateCarMerge,
  setRepairOrderLinking,
  waitForPbsSyncCompletion,
  type DuplicateCarReport,
  type LinkPreview,
  type PbsCapability,
  type PbsSyncStatusResponse,
  type VisitMigrationReport,
} from '../../../lib/pbsSyncApi';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { isPbsSyncDealership, PBS_SYNC_DEALERSHIP_NAME } from '../../../lib/pbsSyncScope';
import { cn } from '../../../lib/utils';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';
import { tidyPersonName } from '../../../lib/tidyCase';

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
        <p className="text-sm text-slate-300 font-medium">PBS sync is not enabled for this store.</p>
        <CardNoticeRow className="mt-2">
          <CardNotice tone="info" summary="Why">
            PartnerHUB sync only runs for{' '}
            <strong className="text-slate-300">{PBS_SYNC_DEALERSHIP_NAME}</strong>. Nissan/Mazda and
            Ford/Lincoln use their own DMS import, and their customer directories are never touched
            by PBS sync.
          </CardNotice>
        </CardNoticeRow>
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
  /** The PBS permission check: which operations this serial may actually call. */
  const [caps, setCaps] = useState<PbsCapability[] | null>(null);
  const [capsBusy, setCapsBusy] = useState(false);
  const [capsProgress, setCapsProgress] = useState<string | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  /** Moving service history out of customer records. Dry run first, always. */
  const [moveReport, setMoveReport] = useState<VisitMigrationReport | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState(false);
  /** Cars on two profiles, folded into one. Preview first, always. */
  const [dupReport, setDupReport] = useState<DuplicateCarReport | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  const [confirmDup, setConfirmDup] = useState(false);
  /** Dry run of linking customers from repair orders. Read-only. */
  const [linkMonth, setLinkMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [firestoreAdmin, setFirestoreAdmin] = useState(false);
  const [firestoreReachable, setFirestoreReachable] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [firestoreQuotaExceeded, setFirestoreQuotaExceeded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PbsSyncStatusResponse['diagnostics']>();
  const [cronStatus, setCronStatus] = useState<PbsSyncStatusResponse['cron']>();
  const [serverState, setServerState] = useState<PbsSyncStatusResponse['state']>(null);
  const [nextScheduledAt, setNextScheduledAt] = useState<string | undefined>();
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
      setNextScheduledAt(status.nextScheduledAt);
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

  const handleCheckPermissions = async () => {
    setCapsBusy(true);
    setCapsError(null);
    setCaps(null);
    try {
      const results = await probePbsCapabilities((done, total) =>
        setCapsProgress(`Asked PBS about ${done} of ${total} operations…`)
      );
      setCaps(results);
    } catch (err) {
      setCapsError(err instanceof Error ? err.message : 'Could not check PBS permissions.');
    } finally {
      setCapsBusy(false);
      setCapsProgress(null);
    }
  };

  const [linkSwitchBusy, setLinkSwitchBusy] = useState(false);
  const [confirmLinkOn, setConfirmLinkOn] = useState(false);
  const handleLinkSwitch = async (enabled: boolean) => {
    setLinkSwitchBusy(true);
    setLinkError(null);
    setConfirmLinkOn(false);
    try {
      await setRepairOrderLinking(enabled);
      setLinkPreview((p) => (p ? { ...p, enabled } : p));
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not change the setting.');
    } finally {
      setLinkSwitchBusy(false);
    }
  };

  const handleLinkPreview = async () => {
    setLinkBusy(true);
    setLinkError(null);
    setLinkPreview(null);
    try {
      setLinkPreview(await previewRepairOrderLinking(linkMonth));
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not preview the matching.');
    } finally {
      setLinkBusy(false);
    }
  };

  const handleMoveHistory = async (dryRun: boolean) => {
    setMoveBusy(true);
    setMoveError(null);
    setConfirmMove(false);
    try {
      const report = await runVisitMigration(dryRun, (partial) => setMoveReport(partial));
      setMoveReport(report);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Could not move service history.');
    } finally {
      setMoveBusy(false);
    }
  };

  const handleDuplicates = async (dryRun: boolean) => {
    setDupBusy(true);
    setDupError(null);
    setConfirmDup(false);
    try {
      const report = await runDuplicateCarMerge(dryRun, (partial) => setDupReport(partial));
      setDupReport(report);
      if (!dryRun) onSuccess?.(`Merged ${report.ok} cars onto one profile each.`);
    } catch (err) {
      setDupError(err instanceof Error ? err.message : 'Could not merge cars on two profiles.');
    } finally {
      setDupBusy(false);
    }
  };

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
      <div>
        <CardNoticeRow>
          <CardNotice tone="info" summary="Which button to use">
            <strong className="text-slate-300">Pull changes</strong> fetches everything since the
            last successful sync — that is the one you want almost always.{' '}
            <strong className="text-slate-300">Full refresh</strong> rebuilds the entire
            directory from PBS, so use it only when something is genuinely missing.
          </CardNotice>
          <CardNotice tone="info" summary="What a pull updates">
            Customer and vehicle records, Operations appointment counts, advisor performance,
            technician efficiency, service reminders, vehicle inventory and the dispatch board.
            Only <strong className="text-slate-300">{PBS_SYNC_DEALERSHIP_NAME}</strong> is
            touched — no other store's data is read or written.
          </CardNotice>
        </CardNoticeRow>
      </div>

      <div className="card-base p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database size={16} style={{ color: 'var(--color-text-secondary)' }} />
              <h3 className="crm-section-title">{dealershipName}</h3>
            </div>
            <p className="crm-label">PBS PartnerHUB</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSync(false)}
              disabled={syncing || fullRefreshing || !canPullFromPbs}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? 'Pulling changes…' : 'Pull changes'}
            </button>
            <button
              type="button"
              onClick={() => handleSync(true)}
              disabled={syncing || fullRefreshing || !canPullFromPbs}
              className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fullRefreshing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              {fullRefreshing ? 'Refreshing…' : 'Full refresh'}
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

        {!canPullFromPbs && !statusLoading && statusHealthy ? (
          <p className="crm-label">Pulling is off until the PBS connection is set up.</p>
        ) : null}

        {/*
          Linking customers to their PBS vehicle from repair orders — preview.

          Most customers were never linked to a PBS vehicle, so their repair
          orders never reached them and they showed thin spreadsheet rows. The
          sync now links them by VIN. This shows what that would do for a
          month, before any refresh does it for real. It writes nothing.
        */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-row-divider)' }}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw size={14} style={{ color: 'var(--color-text-secondary)' }} />
                Put every repair order in its car’s file
              </h4>
              <p className="crm-label mt-0.5">
                One profile per VIN. Preview a month first — it changes nothing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="link-month">
                Month to preview
              </label>
              <input
                id="link-month"
                type="month"
                value={linkMonth}
                onChange={(e) => setLinkMonth(e.target.value)}
                className="input-field min-h-[44px] px-2 text-sm"
              />
              <button
                type="button"
                onClick={handleLinkPreview}
                disabled={linkBusy || !canPullFromPbs || !linkMonth}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {linkBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                {linkBusy ? 'Checking…' : 'Preview'}
              </button>
            </div>
          </div>

          {linkError ? (
            <p className="text-sm mt-3" style={{ color: 'var(--color-badge-error-text)' }}>
              {cleanErrorText(linkError)}
            </p>
          ) : null}

          {linkPreview ? (
            <div className="mt-3 space-y-3">
              <div className="card-base rounded-lg divide-y" style={{ borderColor: 'var(--color-row-divider)' }}>
                {(
                  [
                    [`Repair orders opened (${linkPreview.open.toLocaleString()} still open)`, linkPreview.repairOrders],
                    ['Already in a file', linkPreview.inAFileToday],
                    ['Would join their car’s existing profile', linkPreview.toExistingProfiles],
                    ['Would go into a new profile for their car', linkPreview.toNewProfiles],
                    ['New profiles that would be created', linkPreview.newProfiles],
                    ['Duplicate profiles found (flagged, not removed)', linkPreview.duplicatesFlagged],
                  ] as Array<[string, number]>
                ).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <p className="crm-label">
                {linkPreview.leftOver === 0
                  ? 'Every repair order lands in a file — none left over.'
                  : `${linkPreview.leftOver.toLocaleString()} repair order(s) would still have no file — that should be 0; tell Claude.`}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 card-base rounded-lg px-3 py-2">
                <span className="text-sm">
                  Matching is{' '}
                  <strong>{linkPreview.enabled ? 'on' : 'off'}</strong>
                  <span className="crm-label block">
                    {linkPreview.enabled
                      ? 'Every repair order, open or paid, goes into its car’s file as it arrives. Run a Full refresh to fill in past history.'
                      : 'Nothing changes until you turn it on.'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => (linkPreview.enabled ? handleLinkSwitch(false) : setConfirmLinkOn(true))}
                  disabled={linkSwitchBusy}
                  className={linkPreview.enabled ? 'btn-secondary' : 'btn-primary'}
                >
                  {linkSwitchBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {linkPreview.enabled ? 'Turn off' : 'Turn on matching'}
                </button>
              </div>
              <ConfirmModal
                open={confirmLinkOn}
                title="Turn on repair-order matching?"
                description="From the next sync, every repair order — open or paid — goes into the profile for its car's VIN, and a profile is created for any car that doesn't have one. Each car keeps its own profile. Profiles found to be a second copy of the same car are flagged for merging, never removed. Run a Full refresh afterwards to fill in past history."
                confirmLabel="Turn on"
                onConfirm={() => handleLinkSwitch(true)}
                onCancel={() => setConfirmLinkOn(false)}
              />
              {linkPreview.examples.length > 0 ? (
                <div>
                  <p className="crm-label mb-1.5">Examples (first {linkPreview.examples.length})</p>
                  <ul className="card-base rounded-lg divide-y" style={{ borderColor: 'var(--color-row-divider)' }}>
                    {linkPreview.examples.map((ex) => (
                      <li key={ex.owner + ex.vehicle} className="flex items-center gap-2 px-3 py-2">
                        <span className="text-sm flex-1 min-w-0 truncate">
                          {ex.owner}
                          <span className="crm-label block truncate">
                            {ex.action === 'new' ? 'New profile · ' : 'Existing profile · '}
                            {ex.vehicle}
                          </span>
                        </span>
                        <span className="crm-label shrink-0 tabular-nums">
                          {ex.repairOrders} RO{ex.repairOrders === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/*
          Moving service history out of the customer records.

          Every visit used to sit inside its customer, so opening the app
          downloaded every customer's whole history before it showed anything.
          This moves each customer's visits into their own collection. It is
          always shown as a dry run first, and the real run is behind a
          confirmation: it archives, copies, verifies, and only then clears
          each customer's old list, and holds back any customer that does not
          verify.
        */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-row-divider)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Database size={14} style={{ color: 'var(--color-text-secondary)' }} />
                Service history storage
              </h4>
              <p className="crm-label mt-0.5">
                {moveBusy
                  ? moveReport
                    ? `Checked ${moveReport.scanned.toLocaleString()} customer records…`
                    : 'Starting…'
                  : 'Move visit history out of customer records so the app opens faster.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleMoveHistory(true)}
                disabled={moveBusy}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {moveBusy && moveReport?.dryRun !== false ? <Loader2 size={14} className="animate-spin" /> : null}
                Check what will move
              </button>
              {moveReport?.dryRun && moveReport.customers > 0 && !moveBusy ? (
                <button type="button" onClick={() => setConfirmMove(true)} className="btn-primary">
                  Move {moveReport.customers.toLocaleString()} customers
                </button>
              ) : null}
            </div>
          </div>

          {moveError ? (
            <p className="text-sm mt-3" style={{ color: 'var(--color-badge-error-text)' }}>
              {cleanErrorText(moveError)}
            </p>
          ) : null}

          {moveReport && !moveBusy ? (
            <div className="mt-3 space-y-3">
              <div className="card-base rounded-lg divide-y" style={{ borderColor: 'var(--color-row-divider)' }}>
                {(
                  moveReport.dryRun
                    ? [
                        ['Customers with history to move', moveReport.customers],
                        ['Visits in those records', moveReport.visits],
                        ['Would be copied', moveReport.copied],
                        ['Already stored by the sync', moveReport.alreadyStored],
                      ]
                    : [
                        ['Customers moved and verified', moveReport.migrated],
                        ['Visits copied', moveReport.copied],
                        ['Already stored by the sync', moveReport.alreadyStored],
                        ['Held back, left untouched', moveReport.heldBack.length],
                      ]
                ).map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{(value as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {moveReport.dryRun ? (
                <p className="crm-label">
                  {moveReport.customers === 0
                    ? 'Nothing left to move — every customer is already on the new storage.'
                    : 'Nothing has been changed. This is what a real run would do.'}
                </p>
              ) : moveReport.heldBack.length > 0 ? (
                <CardNoticeRow>
                  <CardNotice
                    tone="warn"
                    summary={`${moveReport.heldBack.length} customer${moveReport.heldBack.length === 1 ? '' : 's'} held back`}
                  >
                    These were left exactly as they were — their visits are still in the original
                    record. Usually it means the record changed during the run (the sync was writing
                    to it). Run it again and they will be picked up.
                    {' '}
                    {moveReport.heldBack
                      .slice(0, 5)
                      .map((r) => `${r.customerId} (${r.status.replace(/-/g, ' ')})`)
                      .join(', ')}
                    {moveReport.heldBack.length > 5 ? '…' : ''}
                  </CardNotice>
                </CardNoticeRow>
              ) : (
                <p className="crm-label">
                  Every customer moved and verified. The original lists are archived on the server.
                </p>
              )}
            </div>
          ) : null}

          <ConfirmModal
            open={confirmMove}
            title="Move service history?"
            description={`This moves ${moveReport?.visits.toLocaleString() ?? 0} visits for ${moveReport?.customers.toLocaleString() ?? 0} customers into their own storage. Each customer's original list is archived first, and only cleared once every visit is confirmed copied. Any customer that does not confirm is left untouched.`}
            confirmLabel="Move history"
            onConfirm={() => handleMoveHistory(false)}
            onCancel={() => setConfirmMove(false)}
          />
        </div>

        {/*
          One profile per car.

          The PBS sync made a second profile for cars it could not match to an
          old spreadsheet import. Jaryn's rule: the customer who came in most
          recently keeps the car, and every visit goes with it. Preview first;
          the real run backs each car up, merges it in one step, and reads it
          back. The other profile is hidden, never deleted.
        */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-row-divider)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Car size={14} style={{ color: 'var(--color-text-secondary)' }} />
                Cars on two profiles
              </h4>
              <p className="crm-label mt-0.5">
                {dupBusy
                  ? dupReport
                    ? `${dupReport.dryRun ? 'Checked' : 'Merged'} ${dupReport.done.toLocaleString()} of ${dupReport.cars.toLocaleString()} cars…`
                    : 'Looking for cars on two profiles…'
                  : 'One profile per car. Whoever came in last keeps it, with every visit.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleDuplicates(true)}
                disabled={dupBusy}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dupBusy && dupReport?.dryRun !== false ? <Loader2 size={14} className="animate-spin" /> : null}
                Preview
              </button>
              {dupReport?.dryRun && dupReport.ok > 0 && !dupBusy ? (
                <button type="button" onClick={() => setConfirmDup(true)} className="btn-primary">
                  Merge {dupReport.ok.toLocaleString()} cars
                </button>
              ) : null}
            </div>
          </div>

          {dupError ? (
            <p className="text-sm mt-3" style={{ color: 'var(--color-badge-error-text)' }}>
              {cleanErrorText(dupError)}
            </p>
          ) : null}

          {dupReport && !dupBusy ? (
            <div className="mt-3 space-y-3">
              <div className="card-base rounded-lg divide-y" style={{ borderColor: 'var(--color-row-divider)' }}>
                {(
                  dupReport.dryRun
                    ? [
                        ['Cars to merge', dupReport.ok],
                        ['"Customer" records getting the real name', dupReport.namesFilled],
                        ['Phone numbers filled in', dupReport.phonesFilled],
                        ['Visits copied to the kept profile', dupReport.visitsCopied],
                      ]
                    : [
                        ['Cars merged and checked', dupReport.ok - dupReport.unverified.length],
                        ['Visits copied to the kept profile', dupReport.visitsCopied],
                        ['Merged, check did not match', dupReport.unverified.length],
                      ]
                ).map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{(value as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {dupReport.changedHands.length + dupReport.heldBack.length + dupReport.failed.length > 0 ? (
                <CardNoticeRow>
                  {dupReport.changedHands.length > 0 ? (
                    <CardNotice tone="info" summary={`${dupReport.changedHands.length} changed hands`}>
                      The customer who came in last keeps the car. The earlier owner's profile is hidden, not
                      deleted.{' '}
                      {dupReport.changedHands
                        .map(
                          (r) =>
                            `${(r.mergedNames ?? []).map((n) => tidyPersonName(n) || 'No name').join(', ')} → ${tidyPersonName(r.ownerName ?? '') || 'No name'}`
                        )
                        .join('; ')}
                    </CardNotice>
                  ) : null}
                  {dupReport.heldBack.length > 0 ? (
                    <CardNotice tone="warn" summary={`${dupReport.heldBack.length} held back`}>
                      These records disagree about which car it is, so they are left as they are for you to check.{' '}
                      {dupReport.heldBack.map((h) => `…${h.tail}: ${h.reason}`).join('; ')}
                    </CardNotice>
                  ) : null}
                  {dupReport.failed.length > 0 ? (
                    <CardNotice tone="warn" summary={`${dupReport.failed.length} failed`}>
                      Left exactly as they were. Run it again to retry.{' '}
                      {dupReport.failed
                        .slice(0, 5)
                        .map((r) => `…${r.tail}: ${r.reason}`)
                        .join('; ')}
                      {dupReport.failed.length > 5 ? '…' : ''}
                    </CardNotice>
                  ) : null}
                </CardNoticeRow>
              ) : null}

              <p className="crm-label">
                {dupReport.dryRun
                  ? dupReport.ok === 0
                    ? 'No cars are on two profiles.'
                    : 'Nothing has been changed. This is what Merge would do.'
                  : 'Done. Every profile was backed up before it was changed.'}
              </p>
            </div>
          ) : null}

          <ConfirmModal
            open={confirmDup}
            title="Merge cars on two profiles?"
            description={`This merges ${dupReport?.ok.toLocaleString() ?? 0} cars. For each one, the customer who came in last keeps the car and every visit. The other profile is backed up, then hidden — not deleted. A car that fails is left untouched.`}
            confirmLabel="Merge cars"
            onConfirm={() => handleDuplicates(false)}
            onCancel={() => setConfirmDup(false)}
          />
        </div>

        {/*
          What PBS will and will not serve these credentials.

          Being wired is not the same as being granted: two of the operations
          this app already calls come back 401. PBS publishes its catalogue but
          not who may use what, so the only way to know is to ask each one and
          read the status back.
        */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-row-divider)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <KeyRound size={14} style={{ color: 'var(--color-text-secondary)' }} />
                PBS permissions
              </h4>
              <p className="crm-label mt-0.5">
                {capsProgress || 'Which PartnerHUB operations this store is allowed to call.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCheckPermissions}
              disabled={capsBusy || !canPullFromPbs}
              className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {capsBusy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {capsBusy ? 'Checking…' : 'Check permissions'}
            </button>
          </div>

          {capsError ? (
            <p className="text-sm mt-3" style={{ color: 'var(--color-badge-error-text)' }}>
              {cleanErrorText(capsError)}
            </p>
          ) : null}

          {caps && caps.length > 0 ? (
            <div className="mt-3 space-y-3">
              <CardNoticeRow>
                <CardNotice
                  tone="info"
                  summary={`${caps.filter((c) => c.granted).length} of ${caps.length} granted`}
                >
                  Read operations only, asked once each. A granted operation we do not use yet is
                  something you could build on without asking PBS for anything; a refused one is a
                  support request.
                </CardNotice>
              </CardNoticeRow>

              {(
                [
                  ['Granted, not used yet', caps.filter((c) => c.granted && !c.inUse)],
                  ['Granted, already used', caps.filter((c) => c.granted && c.inUse)],
                  ['Refused by PBS', caps.filter((c) => c.denied)],
                  ['No answer', caps.filter((c) => !c.granted && !c.denied)],
                ] as Array<[string, typeof caps]>
              )
                .filter(([, rows]) => rows.length > 0)
                .map(([label, rows]) => (
                  <div key={label}>
                    <p className="crm-label mb-1.5">
                      {label} ({rows.length})
                    </p>
                    <ul
                      className="card-base rounded-lg divide-y"
                      style={{ borderColor: 'var(--color-row-divider)' }}
                    >
                      {rows.map((row) => (
                        <li key={row.operation} className="flex items-center gap-2 px-3 py-2">
                          {row.granted ? (
                            <CheckCircle2
                              size={13}
                              className="shrink-0"
                              style={{ color: 'var(--color-badge-success-text)' }}
                            />
                          ) : row.denied ? (
                            <XCircle
                              size={13}
                              className="shrink-0"
                              style={{ color: 'var(--color-badge-error-text)' }}
                            />
                          ) : (
                            <AlertTriangle
                              size={13}
                              className="shrink-0"
                              style={{ color: 'var(--color-badge-warn-text)' }}
                            />
                          )}
                          <span className="text-sm flex-1 min-w-0 truncate font-mono">
                            {row.operation}
                          </span>
                          <span
                            className="crm-label shrink-0 tabular-nums"
                            style={
                              row.denied ? { color: 'var(--color-badge-error-text)' } : undefined
                            }
                          >
                            {row.note || (row.status === null ? '—' : row.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-xs font-semibold text-slate-500 ">PBS credentials</p>
            <p className={cn('text-xs font-bold mt-1', configured ? 'text-emerald-300' : 'text-rose-300')}>
              {configured ? 'Configured' : 'Not configured'}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-xs font-semibold text-slate-500 ">Server writes</p>
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
              <p className="text-xs text-amber-400/90 mt-1 line-clamp-3">{firestoreError}</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-xs font-semibold text-slate-500 ">Auto-sync</p>
            <p
              className={cn(
                'text-xs font-bold mt-1',
                cronStatus?.cronReady ? 'text-emerald-300' : 'text-amber-300'
              )}
            >
              {cronStatus?.cronReady ? 'Scheduled (6:00 AM & 4:45 PM Pacific)' : 'Not ready'}
            </p>
            {cronStatus?.cronReady && nextScheduledAt ? (
              <p className="text-xs text-slate-600 mt-1">Next pull {formatWhen(nextScheduledAt)}</p>
            ) : null}
            {cronStatus?.lastRunAt ? (
              <p className="text-xs text-slate-600 mt-1">
                Last scheduled run {formatWhen(cronStatus.lastRunAt)}
                {cronStatus.lastRunOk === false ? ' · failed' : ''}
              </p>
            ) : cronStatus?.cronReady ? (
              <p className="text-xs text-slate-600 mt-1">No scheduled run logged yet</p>
            ) : cronStatus?.missingForCron?.length ? (
              <p className="text-xs text-amber-400/90 mt-1 line-clamp-3">
                Missing: {cronStatus.missingForCron.join(', ')}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <p className="text-xs font-semibold text-slate-500 ">Last sync</p>
            <p className="text-xs font-bold text-slate-200 mt-1">
              {lastState?.lastSyncAt ? formatWhen(lastState.lastSyncAt) : 'Never'}
            </p>
            {lastState?.lastSuccessfulSyncAt ? (
              <p className="text-xs text-slate-600 mt-1">
                Pull changes since {formatWhen(lastState.lastSuccessfulSyncAt)}
              </p>
            ) : null}
            {lastState?.syncInProgress ? (
              <p className="text-xs text-brand-primary mt-1 flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                Sync in progress…
              </p>
            ) : lastState?.lastSyncOk === false ? (
              <p className="text-xs text-rose-400 mt-1 line-clamp-2">{cleanErrorText(lastState.lastError)}</p>
            ) : lastState?.summary ? (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{lastState.summary}</p>
            ) : null}
          </div>
        </div>

        {!statusHealthy && !statusLoading ? (
          <div className="rounded-lg border border-surface-border p-3 space-y-2">
            {firestoreQuotaExceeded ? (
              <>
                <p className="text-sm font-semibold">Database limit reached for today</p>
                <p className="crm-label">
                  Syncing will work again when the daily limit resets, usually at midnight Pacific.
                </p>
                <CardNotice tone="info" summary="Details">
                  The Firebase read/write quota is exceeded; the PBS connection itself is fine. Check{' '}
                  <a
                    href={firebaseUsageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    Firebase Console → Usage
                  </a>{' '}
                  for limits and billing. The Blaze (pay-as-you-go) plan removes the hard daily cap.
                </CardNotice>
              </>
            ) : needsEnvSetup ? (
              <>
                <p className="text-sm font-semibold">PartnerHUB connection not set up</p>
                <p className="crm-label">
                  Syncing is off until an administrator connects this store's PBS account.
                </p>
                <CardNotice tone="info" summary="Setup details">
                  {missingPbsVars.length ? (
                    <span className="block">
                      Missing server settings: <code>{missingPbsVars.join(', ')}</code>.
                    </span>
                  ) : null}
                  <span className="block mt-1">
                    {diagnostics?.serviceAccountMessage ||
                      'Set FIREBASE_SERVICE_ACCOUNT_JSON to the whole downloaded Firebase service-account file (not just the private key).'}
                  </span>
                  {cronStatus && !cronStatus.cronReady ? (
                    <span className="block mt-1">The 6:00 AM automatic sync also needs these before it will run.</span>
                  ) : null}
                  <span className="block mt-1">
                    After saving them in Netlify → Environment variables, start a new production deploy; saving
                    alone does not update the live site.
                  </span>
                </CardNotice>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Can't reach the database right now</p>
                <p className="crm-label">This is usually temporary. Try again in a few minutes.</p>
                {firestoreError ? (
                  <CardNotice tone="info" summary="Details">
                    {firestoreError}
                  </CardNotice>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <p className="crm-label">Sync history is under Admin → Audit logs.</p>
    </div>
  );
}

export default PbsSyncPanel;
