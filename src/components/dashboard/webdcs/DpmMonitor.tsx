import React, { useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';
import { cn } from '../../../lib/utils';
import { runWebDcsDpm } from '../../../lib/webdcs/client';
import {
  dpmViewKey,
  type DpmMetricVerdict,
  type WebDcsDpmResult,
  type WebDcsDpmRunResult,
} from '../../../lib/webdcs/protocol';
import { describeError, formatCheckedAt } from '../../../lib/webdcs/presentation';

interface DpmMonitorProps {
  /** Whether a signed-in tab is available at all; the read button waits on it. */
  canRun: boolean;
}

function Verdict({ v }: { v: DpmMetricVerdict | null }) {
  if (!v) return null;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm">{v.label}</span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className={cn('font-semibold', v.pass ? 'text-emerald-400' : 'text-rose-400')}>
          {v.value === null ? '—' : `${v.value}%`}
        </span>
        <span className="crm-label">vs {v.objective}%</span>
        <span className={cn('text-xs font-semibold', v.pass ? 'text-emerald-400' : 'text-rose-400')}>
          {v.pass ? 'PASS' : 'FAIL'}
        </span>
      </span>
    </li>
  );
}

/**
 * DPM monitor. Reads whichever DPM view is open and files the result under
 * the view it detected, so walking WOPR → Diagnostic → Service builds up the
 * whole picture. Red/blue is HMA's own marking, read from the page; the one
 * rule applied here is the user's: eMPI must be at least 50%.
 */
export default function DpmMonitor({ canRun }: DpmMonitorProps) {
  const [reads, setReads] = useState<Record<string, WebDcsDpmResult>>({});
  const [lastError, setLastError] = useState<WebDcsDpmRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDiag, setShowDiag] = useState(false);

  const handleRead = async () => {
    setLoading(true);
    setShowDiag(false);
    try {
      const r = await runWebDcsDpm();
      if (r.ok) {
        setLastError(null);
        setReads((prev) => ({ ...prev, [dpmViewKey(r.view)]: r }));
      } else {
        setLastError(r);
      }
    } finally {
      setLoading(false);
    }
  };

  const failure = lastError && lastError.ok === false ? lastError : null;
  const failureText = failure ? describeError(failure.error.code) : null;
  const views = Object.entries(reads);

  return (
    <section className="card-base p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="crm-section-title flex items-center gap-2">
            <Gauge size={16} className="text-brand-primary" />
            DPM monitor
          </h2>
          <p className="crm-label mt-0.5">
            Reads the metric cards on whichever DPM view is open — red and blue are HMA's own marks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRead()}
          disabled={loading || !canRun}
          className="btn-primary min-h-[44px] disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Gauge size={15} />}
          {loading ? 'Reading DPM…' : 'Read this DPM view'}
        </button>
      </div>

      <CardNoticeRow className="mt-3">
        <CardNotice tone="info" summary="How to use it">
          Open DPM from the dealer portal. Go to <strong>After Sales → Warranty → WOPR</strong> and click
          Read; switch to <strong>Diagnostic</strong> and click Read; then the view with the{' '}
          <strong>Service Lane Technology</strong> card and click Read. Each read is filed under the
          view it found, so all three stay on screen together. Clicking through DPM for you is the
          next step once the tabs have been seen once.
        </CardNotice>
      </CardNoticeRow>

      {failure && failureText && (
        <div className="mt-4 rounded-lg border-l-4 border-l-rose-400 p-3" style={{ backgroundColor: 'var(--color-surface-base)' }}>
          <p className="font-semibold">{failureText.title}</p>
          <p className="text-sm text-text-secondary mt-0.5">{failure.error.message}</p>
          <p className="crm-label mt-1">{failure.error.code}</p>
          {failure.diagnostic !== undefined && (
            <>
              <button type="button" onClick={() => setShowDiag((v) => !v)} className="btn-secondary text-sm py-1.5 mt-2">
                {showDiag ? 'Hide diagnostic' : 'Show diagnostic'}
              </button>
              {showDiag && (
                <pre
                  className="mt-2 text-xs leading-relaxed rounded-lg p-3 overflow-auto max-h-64 font-mono"
                  style={{ backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-secondary)' }}
                >
                  {JSON.stringify(failure.diagnostic, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      )}

      {views.length > 0 && (
        <div className="mt-4 space-y-4">
          {views.map(([key, r]) => {
            const sl = r.summary.serviceLane;
            const red = r.summary.red;
            return (
              <div key={key} className="rounded-lg border p-4" style={{ borderColor: 'var(--color-surface-border)' }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{key}</p>
                  <p className="crm-label">
                    {r.summary.total} card{r.summary.total === 1 ? '' : 's'}
                    {r.reportingMonth ? ` · reporting ${r.reportingMonth}` : ''}
                    {r.dataUpdated ? ` · ${r.dataUpdated}` : ''} · read {formatCheckedAt(r.checkedAt)}
                  </p>
                </div>

                {sl && (
                  <div className="mt-3">
                    <p className="crm-label flex items-center justify-between">
                      <span>Service Lane Technology</span>
                      {sl.status && (
                        <span className={cn('font-semibold', /fail/i.test(sl.status) ? 'text-rose-400' : 'text-emerald-400')}>
                          {sl.status}
                        </span>
                      )}
                    </p>
                    <ul className="divide-y mt-1" style={{ borderColor: 'var(--color-surface-border)' }}>
                      <Verdict v={sl.empi} />
                      <Verdict v={sl.appointment} />
                      <Verdict v={sl.laneCheckIn} />
                    </ul>
                  </div>
                )}

                <div className="mt-3">
                  <p className={cn('crm-label', red.length ? 'text-rose-400' : 'text-emerald-400')}>
                    {red.length === 0 ? 'Nothing in the red' : `${red.length} in the red`}
                  </p>
                  {red.length > 0 && (
                    <ul className="divide-y mt-1" style={{ borderColor: 'var(--color-surface-border)' }}>
                      {red.map((c) => (
                        <li key={c.title} className="py-1.5 flex items-center justify-between gap-3">
                          <span className="text-sm min-w-0 truncate">{c.title}</span>
                          <span className="shrink-0 tabular-nums">
                            <span className="font-semibold text-rose-400">{c.value}</span>
                            {c.target && <span className="crm-label ml-2">target {c.target}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.summary.blue.length > 0 && (
                    <p className="crm-label mt-2">On target: {r.summary.blue.join(' · ')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
