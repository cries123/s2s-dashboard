import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, ExternalLink, ListChecks, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../layout/PageHeader';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';
import DpmMonitor from './DpmMonitor';
import { cn } from '../../../lib/utils';
import {
  browserSupportsExtension,
  getWebDcsStatus,
  openWebDcs,
  pingExtension,
  runWebDcsCases,
  runWebDcsCheck,
} from '../../../lib/webdcs/client';
import {
  WEBDCS_HOME_URL,
  type DcmCase,
  type WebDcsCasesRunResult,
  type WebDcsFailure,
  type WebDcsRunResult,
  type WebDcsSessionState,
} from '../../../lib/webdcs/protocol';
import {
  describeError,
  describeState,
  dueRelative,
  formatCaseCount,
  formatCheckedAt,
} from '../../../lib/webdcs/presentation';

const DUE_TONE: Record<ReturnType<typeof dueRelative>['tone'], string> = {
  overdue: 'text-rose-400',
  today: 'text-amber-400',
  soon: 'text-amber-300',
  later: 'text-text-secondary',
  none: 'text-text-secondary',
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type PanelState = WebDcsSessionState | 'checking' | 'extension_missing';

function isFailure(r: WebDcsRunResult | WebDcsCasesRunResult | null): r is WebDcsFailure {
  return r !== null && r.ok === false;
}

const TONE_DOT: Record<'ready' | 'waiting' | 'off', string> = {
  ready: 'bg-emerald-400',
  waiting: 'bg-amber-400',
  off: 'bg-slate-500',
};

/**
 * WebDCS assistant. First module: how many DCM cases are waiting on us.
 *
 * The user signs in to WebDCS themselves, in their own tab. This page only
 * asks the extension what it can see once they have.
 */
export default function WebDcsPanel() {
  const supported = useMemo(() => browserSupportsExtension(), []);
  const [state, setState] = useState<PanelState>(supported ? 'checking' : 'extension_missing');
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WebDcsRunResult | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  // Case details are loaded only on request: names and VINs are the most
  // sensitive thing this page touches, so the default stays at a count.
  const [details, setDetails] = useState<WebDcsCasesRunResult | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!supported) return;
    setState('checking');
    const ping = await pingExtension();
    if (!ping.ok) {
      setExtensionVersion(null);
      setState('extension_missing');
      return;
    }
    setExtensionVersion(ping.version);
    const status = await getWebDcsStatus();
    setState(status.ok ? status.state : 'unknown');
  }, [supported]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // While the user is signing in, poll gently so the button enables itself
  // the moment WebDCS is ready — no "click connect again" step.
  useEffect(() => {
    if (!supported || state === 'ready' || state === 'extension_missing' || running) return;
    const id = setInterval(() => void refreshStatus(), 5000);
    return () => clearInterval(id);
  }, [supported, state, running, refreshStatus]);

  const handleOpen = async () => {
    if (state === 'extension_missing' || !supported) {
      window.open(WEBDCS_HOME_URL, '_blank', 'noopener');
      return;
    }
    await openWebDcs();
    setTimeout(() => void refreshStatus(), 1500);
  };

  const handleLoadDetails = async () => {
    setLoadingDetails(true);
    try {
      const r = await runWebDcsCases();
      setDetails(r);
      if (isFailure(r) && r.error.code === 'EXTENSION_NOT_INSTALLED') setState('extension_missing');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setShowDiagnostic(false);
    setDetails(null);
    try {
      const r = await runWebDcsCheck('dcm');
      setResult(r);
      if (isFailure(r)) {
        const c = r.error.code;
        if (c === 'AUTH_REQUIRED') setState('login');
        else if (c === 'TWO_FACTOR_REQUIRED') setState('2fa');
        else if (c === 'SESSION_EXPIRED') setState('expired');
        else if (c === 'NO_WEBDCS_TAB') setState('no_tab');
        else if (c === 'EXTENSION_NOT_INSTALLED') setState('extension_missing');
      }
    } finally {
      setRunning(false);
    }
  };

  const presented = describeState(state);
  const canRun = presented.canRun && !running;
  const failed = isFailure(result) ? result : null;
  const failure = failed ? describeError(failed.error.code) : null;
  const detailsFailed = details && details.ok === false ? details : null;
  const detailsFailure = detailsFailed ? describeError(detailsFailed.error.code) : null;
  const cases: DcmCase[] = details && details.ok ? details.cases : [];
  const today = todayIso();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="WebDCS"
        description="Read from your own signed-in WebDCS tab. Nothing here handles your password or 2FA."
        breadcrumbs={[{ label: 'Manager' }, { label: 'WebDCS' }]}
        actions={
          extensionVersion ? (
            <span className="badge badge-info inline-flex items-center gap-1.5">
              <ShieldCheck size={12} /> Assistant v{extensionVersion}
            </span>
          ) : undefined
        }
      />

      {/* Connection */}
      <section className="card-base p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="crm-label">Status</p>
            <p className="flex items-center gap-2 text-lg font-semibold mt-0.5">
              <span className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', TONE_DOT[presented.tone])} />
              {presented.label}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleOpen} className="btn-secondary min-h-[44px]">
              <ExternalLink size={15} /> {state === 'no_tab' || state === 'extension_missing' ? 'Open WebDCS' : 'Go to WebDCS tab'}
            </button>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={!supported || state === 'checking'}
              className="btn-secondary min-h-[44px]"
              aria-label="Re-check connection"
            >
              <RefreshCw size={15} className={cn(state === 'checking' && 'animate-spin')} />
            </button>
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={!canRun}
              className="btn-primary min-h-[44px] disabled:opacity-50"
            >
              {running ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
              {running ? 'Checking…' : result ? 'Check again' : 'Run WebDCS check'}
            </button>
          </div>
        </div>

        <CardNoticeRow className="mt-4">
          {state === 'extension_missing' && (
            <CardNotice tone="warn" summary={supported ? 'Extension not installed' : 'Needs Chrome or Edge on a computer'}>
              {supported
                ? 'Install the S2S WebDCS Assistant from the webdcs-extension folder (chrome://extensions → Developer mode → Load unpacked), then reload this page.'
                : 'The WebDCS check runs through a browser extension, which phone browsers cannot load. Open this page in Chrome or Edge on a computer.'}
            </CardNotice>
          )}
          <CardNotice tone="info" summary="How this works">
            Open WebDCS and sign in as you normally would, including 2FA. Once the home page is up, this
            status turns to ready. Running a check opens the notification bell in that tab, reads how many
            DCM cases are waiting for a response, closes it again, and shows the number here. Only the count
            and a technical log come back — never your session, your cookies, or case details.
          </CardNotice>
        </CardNoticeRow>
      </section>

      {/* Result */}
      {result && (
        <section
          className={cn(
            'card-base p-5 border-l-4',
            result.ok ? (result.dcmCasesWaiting > 0 ? 'border-l-amber-400' : 'border-l-emerald-400') : 'border-l-rose-400'
          )}
        >
          <p className="crm-label">DCM cases</p>
          {result.ok ? (
            <>
              <p className="text-2xl font-semibold mt-1">{formatCaseCount(result.dcmCasesWaiting)}</p>
              <p className="crm-label mt-1">
                Last checked {formatCheckedAt(result.checkedAt)}
                {typeof result.evidence?.reason === 'string' ? ` · ${result.evidence.reason}` : ` · read via ${result.strategy}`}
              </p>
              {/* Every row the notification carried, so the headline is never a black box. */}
              {Array.isArray(result.evidence?.labelled) && result.evidence.labelled.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {(result.evidence.labelled as Array<{ label: string; count: number }>).map((row) => (
                    <li
                      key={row.label}
                      className="inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                      style={{ borderColor: 'var(--color-surface-border)' }}
                    >
                      <span className="text-text-secondary">{row.label}</span>
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="text-xl font-semibold mt-1">{failure?.title}</p>
              <p className="text-sm text-text-secondary mt-1">{failure?.hint}</p>
              <p className="crm-label mt-2">
                {failed?.error.code} · {formatCheckedAt(result.checkedAt)}
              </p>
              {failure?.needsWebDcsAction && (
                <button type="button" onClick={handleOpen} className="btn-secondary mt-3">
                  <ExternalLink size={14} /> Go to WebDCS tab
                </button>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {result.ok && (
              <button
                type="button"
                onClick={() => void handleLoadDetails()}
                disabled={loadingDetails || !presented.canRun}
                className="btn-primary text-sm py-1.5 disabled:opacity-50"
              >
                {loadingDetails ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />}
                {loadingDetails ? 'Reading the DCM Dashboard…' : details ? 'Reload case details' : 'Load case details'}
              </button>
            )}
            {result.log && result.log.length > 0 && (
              <button type="button" onClick={() => setShowLog((v) => !v)} className="btn-secondary text-sm py-1.5">
                {showLog ? 'Hide log' : `Show log (${result.log.length})`}
              </button>
            )}
            {failed && failed.diagnostic !== undefined && failure?.wantsDiagnostic && (
              <button type="button" onClick={() => setShowDiagnostic((v) => !v)} className="btn-secondary text-sm py-1.5">
                {showDiagnostic ? 'Hide diagnostic' : 'Show diagnostic'}
              </button>
            )}
          </div>

          {showLog && result.log && (
            <pre
              className="mt-3 text-xs leading-relaxed rounded-lg p-3 overflow-x-auto max-h-64 font-mono"
              style={{ backgroundColor: 'var(--color-surface-base)', color: 'var(--color-text-secondary)' }}
            >
              {result.log.join('\n')}
            </pre>
          )}

          {/* ---- Case details, from the DCM Dashboard tab ---- */}
          {detailsFailed && detailsFailure && (
            <div className="mt-4 rounded-lg border-l-4 border-l-rose-400 p-3" style={{ backgroundColor: 'var(--color-surface-base)' }}>
              <p className="font-semibold">{detailsFailure.title}</p>
              <p className="text-sm text-text-secondary mt-0.5">{detailsFailure.hint}</p>
              <p className="crm-label mt-1">{detailsFailed.error.code}</p>
            </div>
          )}

          {details && details.ok && (
            <div className="mt-4">
              <p className="crm-label">
                {cases.length === 0
                  ? 'No cases are waiting on the dealer.'
                  : `${cases.length} case${cases.length === 1 ? '' : 's'} waiting · soonest due first · read ${formatCheckedAt(details.checkedAt)}`}
              </p>

              {/* Phones: one card per case. */}
              {cases.length > 0 && (
                <ul className="md:hidden mt-2 divide-y rounded-lg border" style={{ borderColor: 'var(--color-surface-border)' }}>
                  {cases.map((c) => {
                    const due = dueRelative(c.dueDateIso, today);
                    return (
                      <li key={c.caseNumber} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{c.customerName || '—'}</p>
                            <p className="crm-label truncate">{c.model || '—'}</p>
                            <p className="crm-label font-mono truncate">{c.vin || '—'}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm tabular-nums">{c.dueDate || '—'}</p>
                            <p className={cn('crm-label', DUE_TONE[due.tone])}>{due.label}</p>
                          </div>
                        </div>
                        <p className="crm-label mt-2 flex items-center justify-between gap-2">
                          <span className="font-mono">#{c.caseNumber}</span>
                          <span className="truncate">{c.status}</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Desktop: the table. */}
              {cases.length > 0 && (
                <div className="hidden md:block mt-2 overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Due</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>VIN</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.map((c) => {
                        const due = dueRelative(c.dueDateIso, today);
                        return (
                          <tr key={c.caseNumber}>
                            <td className="font-mono tabular-nums">{c.caseNumber}</td>
                            <td className="whitespace-nowrap">
                              <span className="tabular-nums">{c.dueDate || '—'}</span>
                              {due.label && <span className={cn('ml-2 text-xs', DUE_TONE[due.tone])}>{due.label}</span>}
                            </td>
                            <td className="font-medium">{c.customerName || '—'}</td>
                            <td>{c.model || '—'}</td>
                            <td className="font-mono text-xs">{c.vin || '—'}</td>
                            <td className="text-text-secondary">{c.status || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {details.sections.length > 0 && (
                <p className="crm-label mt-2">
                  Sections read:{' '}
                  {details.sections.map((s) => `${s.label || 'untitled'} (${s.rows})`).join(' · ')}
                </p>
              )}
            </div>
          )}

          {showDiagnostic && failed && failed.diagnostic !== undefined && (
            <div className="mt-3">
              <p className="crm-label mb-1">
                Page structure around the notification area — tags, ids and classes only, no text. Copy this
                when reporting the problem.
              </p>
              <pre
                className="text-xs leading-relaxed rounded-lg p-3 overflow-auto max-h-80 font-mono"
                style={{ backgroundColor: 'var(--color-surface-base)', color: 'var(--color-text-secondary)' }}
              >
                {JSON.stringify(failed?.diagnostic, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}

      {/* DPM is its own application on its own host; the same extension reads it. */}
      <DpmMonitor canRun={presented.canRun || state === 'unknown'} />
    </div>
  );
}
