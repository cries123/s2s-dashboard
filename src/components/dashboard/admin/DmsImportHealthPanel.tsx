import React from 'react';
import { AlertTriangle, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import { DEALERSHIPS } from '../../../constants';
import type { DealershipSettings, DmsImportFailureEntry } from '../../../types';
import { dmsImportKindLabel } from '../../../lib/dmsImportHealth';
import { fetchPbsSyncStatus, type PbsSyncStatusResponse } from '../../../lib/pbsSyncApi';
import { isPbsSyncDealership } from '../../../lib/pbsSyncScope';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';
import { cn } from '../../../lib/utils';

interface DmsImportHealthPanelProps {
  dealershipSettings: Record<string, Partial<DealershipSettings>>;
}

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function FailureRow({ entry }: { entry: DmsImportFailureEntry }) {
  return (
    <li className="py-2.5 border-b border-white/5 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-rose-400">
          {dmsImportKindLabel(entry.importKind)}
        </span>
        <span className="text-xs text-slate-600 font-mono">{formatWhen(entry.at)}</span>
      </div>
      <p className="text-xs text-white font-medium truncate mt-0.5">{entry.filename}</p>
      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{entry.error}</p>
      {entry.userEmail ? (
        <p className="text-xs text-slate-600 mt-1">{entry.userEmail}</p>
      ) : null}
    </li>
  );
}

/**
 * The automatic PBS sync is the other half of how data gets in, and until now it
 * reported only inside the PBS Sync panel — so "import health" was answering for
 * hand-uploaded PDFs and silent about the job that runs every morning.
 */
function PbsSyncHealth() {
  const [status, setStatus] = React.useState<PbsSyncStatusResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // The endpoint answers for the one store PBS is configured against, so it
    // takes no argument — the caller gates on isPbsSyncDealership instead.
    fetchPbsSyncStatus()
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Sync status unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const state = status?.state;
  const ok = state?.lastSyncOk === true;
  const running = state?.syncInProgress === true;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 md:col-span-2',
        error || (state && !ok)
          ? 'border-rose-500/25 bg-rose-950/15'
          : 'border-white/5 bg-slate-950/40'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <RefreshCw size={14} className={cn('text-brand-primary', running && 'animate-spin')} />
        <span className="text-xs font-semibold text-slate-200">Automatic PBS sync</span>
      </div>

      {error ? (
        <p className="text-xs text-rose-300">{error}</p>
      ) : !status ? (
        <p className="text-xs text-slate-500">Checking…</p>
      ) : !status.configured ? (
        <p className="text-xs text-slate-500">PBS sync is not configured for this store.</p>
      ) : !state?.lastSyncAt ? (
        <p className="text-xs text-slate-500">No sync has run yet.</p>
      ) : (
        <>
          <p className="text-xs font-bold text-white">
            {running ? 'Running now' : ok ? 'Last run succeeded' : 'Last run failed'}
            {state.triggeredBy ? ` · ${state.triggeredBy === 'cron' ? 'scheduled' : 'manual'}` : ''}
          </p>
          <p className="text-xs text-slate-600 mt-1">{formatWhen(state.lastSyncAt)}</p>
          {state.summary ? (
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{state.summary}</p>
          ) : null}
          {!ok && state.lastError ? (
            <p className="text-[11px] text-rose-300 mt-1 line-clamp-3">{state.lastError}</p>
          ) : null}
          {!ok && state.lastSuccessfulSyncAt ? (
            <p className="text-xs text-slate-600 mt-1">
              Last good run {formatWhen(state.lastSuccessfulSyncAt)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function DmsImportHealthPanel({ dealershipSettings }: DmsImportHealthPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="crm-label">How data gets into each store, and whether it is arriving.</p>
        <CardNoticeRow className="mt-2">
          <CardNotice tone="info" summary="What is tracked here">
            Two routes. Staff uploading appointment, performance, technician, forecast or Pot of
            Gold PDFs, and the automatic PBS sync that runs every morning at 6:00 AM Pacific.
            A failure on either shows up here.
          </CardNotice>
        </CardNoticeRow>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {DEALERSHIPS.map((d) => {
          const health = dealershipSettings[d.id]?.dmsImportHealth;
          const last = health?.lastSuccess;
          const failures = health?.recentFailures ?? [];

          return (
            <div key={d.id} className="card-base rounded-lg border border-white/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} className="text-brand-primary" />
                <h3 className="text-sm font-semibold text-white ">{d.name}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isPbsSyncDealership(d.id) && <PbsSyncHealth />}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-300">Last success</span>
                  </div>
                  {last ? (
                    <>
                      <p className="text-xs font-bold text-white">{dmsImportKindLabel(last.importKind)}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-1">{last.filename}</p>
                      <p className="text-xs text-slate-600 mt-2">{formatWhen(last.at)}</p>
                      {last.userEmail ? (
                        <p className="text-xs text-slate-600">{last.userEmail}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">No successful imports recorded yet.</p>
                  )}
                </div>

                <div
                  className={cn(
                    'rounded-xl border p-4',
                    failures.length ? 'border-rose-500/25 bg-rose-950/15' : 'border-white/5 bg-slate-950/40'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-rose-400" />
                    <span className="text-xs font-semibold text-rose-300">
                      Recent failures ({failures.length})
                    </span>
                  </div>
                  {failures.length === 0 ? (
                    <p className="text-xs text-slate-500">No failed parses logged.</p>
                  ) : (
                    <ul className="max-h-40 overflow-y-auto pr-1">
                      {failures.slice(0, 8).map((f, idx) => (
                        <FailureRow key={`${f.at}-${idx}`} entry={f} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DmsImportHealthPanel;
