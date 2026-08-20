import React from 'react';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { DEALERSHIPS } from '../../../constants';
import type { DealershipSettings, DmsImportFailureEntry } from '../../../types';
import { dmsImportKindLabel } from '../../../lib/dmsImportHealth';
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
        <span className="text-[10px] font-black uppercase text-rose-400">
          {dmsImportKindLabel(entry.importKind)}
        </span>
        <span className="text-[10px] text-slate-600 font-mono">{formatWhen(entry.at)}</span>
      </div>
      <p className="text-xs text-slate-900 dark:text-white font-medium truncate mt-0.5">{entry.filename}</p>
      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{entry.error}</p>
      {entry.userEmail ? (
        <p className="text-[10px] text-slate-600 mt-1">{entry.userEmail}</p>
      ) : null}
    </li>
  );
}

export function DmsImportHealthPanel({ dealershipSettings }: DmsImportHealthPanelProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
        Tracks DMS PDF imports per store. Successful parses update automatically when staff upload
        appointment, performance, technician, forecast, or Pot of Gold reports.
      </p>
      <div className="grid grid-cols-1 gap-4">
        {DEALERSHIPS.map((d) => {
          const health = dealershipSettings[d.id]?.dmsImportHealth;
          const last = health?.lastSuccess;
          const failures = health?.recentFailures ?? [];

          return (
            <div key={d.id} className="card-base rounded-2xl border border-white/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} className="text-brand-primary" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">{d.name}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-[10px] font-black uppercase text-emerald-300">Last success</span>
                  </div>
                  {last ? (
                    <>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{dmsImportKindLabel(last.importKind)}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-1">{last.filename}</p>
                      <p className="text-[10px] text-slate-600 mt-2">{formatWhen(last.at)}</p>
                      {last.userEmail ? (
                        <p className="text-[10px] text-slate-600">{last.userEmail}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">No successful imports recorded yet.</p>
                  )}
                </div>

                <div
                  className={cn(
                    'rounded-xl border p-4',
                    failures.length ? 'border-rose-500/25 bg-rose-950/15' : 'border-white/5 bg-slate-50 dark:bg-slate-950/40'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-rose-400" />
                    <span className="text-[10px] font-black uppercase text-rose-300">
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
