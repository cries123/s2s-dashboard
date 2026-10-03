import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import type { DealershipSettings } from '../../../types';
import { fetchPbsSyncStatus, type PbsSyncStatusResponse } from '../../../lib/pbsSyncApi';
import { PBS_SYNC_DEALERSHIP_NAME } from '../../../lib/pbsSyncScope';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';

interface DmsImportHealthPanelProps {
  dealershipSettings: Record<string, Partial<DealershipSettings>>;
}

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/** "2 hours ago", "8 days ago" — the thing you actually want to know here. */
function ago(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function hoursSince(iso?: string): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 3_600_000;
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className="list-row min-h-0 py-2.5">
      <span className="flex-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        className="text-sm text-right font-medium"
        style={
          tone === 'danger'
            ? { color: 'var(--color-badge-error-text)' }
            : tone === 'warning'
              ? { color: 'var(--color-badge-warn-text)' }
              : undefined
        }
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The automatic PBS pull, and nothing else.
 *
 * This page used to double as a log of hand-uploaded PDF imports, which buried
 * the one thing worth watching: whether the overnight pull is still running.
 * A pull that silently stops looks identical to a quiet night unless the page
 * says how long it has been.
 */
export function DmsImportHealthPanel({ dealershipSettings }: DmsImportHealthPanelProps) {
  const [status, setStatus] = React.useState<PbsSyncStatusResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPbsSyncStatus()
      .then((res) => {
        if (!cancelled) {
          setStatus(res);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Sync status unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const state = status?.state;
  const heartbeat = (dealershipSettings?.hyundai as { pbsCronHeartbeat?: { lastInvokedAt?: string; lastOutcome?: string } } | undefined)
    ?.pbsCronHeartbeat;
  const ok = state?.lastSyncOk === true;
  const running = state?.syncInProgress === true;
  const lastGood = state?.lastSuccessfulSyncAt ?? (ok ? state?.lastSyncAt : undefined);
  const staleHours = hoursSince(lastGood);
  const stale = staleHours !== null && staleHours >= 26;

  return (
    <div className="space-y-4">
      <CardNoticeRow>
        <CardNotice tone="info" summary="What this watches">
          The automatic pull from PBS PartnerHUB for {PBS_SYNC_DEALERSHIP_NAME}, which runs every
          morning at 6:00 AM Pacific. If a morning is missed, the next hourly check catches up.
        </CardNotice>
      </CardNoticeRow>

      {stale && !running ? (
        <div
          role="alert"
          className="card-base p-4 flex items-start gap-3"
          style={{ boxShadow: 'inset 3px 0 0 var(--color-badge-error-text)' }}
        >
          <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--color-badge-error-text)' }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">No successful pull in {Math.floor(staleHours! / 24)} days</p>
            <p className="crm-label mt-0.5">
              Last good pull {ago(lastGood)}. Open Admin → PBS sync and press Pull changes, and check that the
              scheduled job is still running.
            </p>
          </div>
        </div>
      ) : null}

      <section className="card-base overflow-hidden">
        <header className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--color-row-divider)' }}>
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#d8edff', color: '#014486' }}
            aria-hidden="true"
          >
            <RefreshCw size={15} className={running ? 'animate-spin' : undefined} />
          </span>
          <h2 className="flex-1 text-sm font-semibold">{PBS_SYNC_DEALERSHIP_NAME}</h2>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="link-text text-sm min-h-[44px] px-2"
          >
            Refresh
          </button>
        </header>

        {loading ? (
          <p className="crm-label px-4 py-6 text-center">Checking…</p>
        ) : error ? (
          <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-badge-error-text)' }}>
            {error}
          </p>
        ) : !status?.configured ? (
          <p className="crm-label px-4 py-6 text-center">PBS is not connected for this store.</p>
        ) : (
          <>
            <Row
              label="Status"
              value={
                running ? (
                  'Running now'
                ) : ok ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-500" /> Last pull succeeded
                  </span>
                ) : (
                  'Last pull failed'
                )
              }
              tone={!running && !ok ? 'danger' : undefined}
            />
            <Row
              label="Last successful pull"
              value={lastGood ? `${ago(lastGood)} · ${formatWhen(lastGood)}` : 'Never'}
              tone={stale ? 'danger' : undefined}
            />
            <Row label="Started by" value={state?.triggeredBy === 'cron' ? 'Schedule' : state?.triggeredBy === 'manual' ? state.triggeredByUsername || 'Someone at the store' : '—'} />
            <Row
              label="Scheduler last checked in"
              value={
                heartbeat?.lastInvokedAt
                  ? `${ago(heartbeat.lastInvokedAt)}${heartbeat.lastOutcome === 'pulled' ? ' · pulled' : ''}`
                  : 'No check-in recorded yet'
              }
              tone={
                heartbeat?.lastInvokedAt && (hoursSince(heartbeat.lastInvokedAt) ?? 0) > 3 ? 'warning' : undefined
              }
            />
            <Row label="Next window" value={status.nextScheduledWindow || 'Daily at 6:00 AM Pacific'} />
            {state?.summary ? (
              <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-row-divider)' }}>
                <p className="crm-label">What the last pull brought in</p>
                <p className="text-sm mt-0.5 leading-snug">{state.summary}</p>
              </div>
            ) : null}
            {!ok && state?.lastError ? (
              <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-row-divider)' }}>
                <p className="crm-label">Error</p>
                <p className="text-sm mt-0.5 leading-snug" style={{ color: 'var(--color-badge-error-text)' }}>
                  {state.lastError}
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>

      <p className="crm-label flex items-center gap-1.5">
        <Clock size={13} /> Full history is under Admin → Audit logs.
      </p>
    </div>
  );
}

export default DmsImportHealthPanel;
