import React from 'react';
import { createPortal } from 'react-dom';
import { X, Wrench, Printer } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { ServiceVisit, ServiceVisitLine } from '../../../types';

interface ServiceVisitDetailModalProps {
  visit: ServiceVisit;
  customerName?: string;
  vehicleLabel?: string;
  onOpenCustomer?: () => void;
  onClose: () => void;
}

function resolveVisitLines(visit: ServiceVisit): ServiceVisitLine[] {
  if (Array.isArray(visit.lines) && visit.lines.length > 0) return visit.lines;
  const requests = typeof visit.requests === 'string' ? visit.requests.trim() : '';
  if (requests) {
    // Legacy visits only stored a combined request string — show each as a line.
    return requests
      .split(/;\s*/)
      .filter(Boolean)
      .map((concern, idx) => ({ lineNumber: idx + 1, concern }));
  }
  return [];
}

function formatVisitDate(date: string) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(value?: number) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadgeClass(status?: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('cashier') || s.includes('closed') || s.includes('complete')) return 'badge-success';
  if (s.includes('open') || s.includes('progress')) return 'badge-info';
  return 'badge-warning';
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">{value || '—'}</p>
    </div>
  );
}

function CccBlock({ label, value, accent }: { label: string; value?: string; accent: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="flex gap-3">
      <div className={cn('w-1 rounded-full shrink-0', accent)} />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
        <p className="text-sm leading-relaxed text-slate-900 dark:text-slate-200 whitespace-pre-wrap mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export function ServiceVisitDetailModal({
  visit,
  customerName,
  vehicleLabel,
  onOpenCustomer,
  onClose,
}: ServiceVisitDetailModalProps) {
  const lines = resolveVisitLines(visit);
  const totalLaborHours = lines.reduce(
    (sum, line) =>
      sum + (line.labourLines || []).reduce((s, l) => s + (Number(l.soldHours) || 0), 0),
    0
  );
  const totalParts = lines.reduce(
    (sum, line) => sum + (line.partLines || []).length,
    0
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={`Repair order ${visit.soNumber}`}
        className="relative w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-2xl animate-zoom-in"
      >
        {/* Document header */}
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-950/60 px-5 sm:px-8 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center text-brand-primary shrink-0">
                <Wrench size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    REPAIR ORDER <span className="text-brand-primary">#{visit.soNumber}</span>
                  </h2>
                  <span className={cn('badge text-[10px] uppercase', statusBadgeClass(visit.status))}>
                    {visit.status || 'Completed'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{formatVisitDate(visit.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors"
                title="Print"
              >
                <Printer size={16} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Close repair order"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
            {customerName && onOpenCustomer ? (
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Customer</p>
                <button
                  type="button"
                  onClick={onOpenCustomer}
                  className="text-sm font-semibold text-brand-primary mt-0.5 truncate text-left hover:underline"
                  title="Open customer profile"
                >
                  {customerName}
                </button>
              </div>
            ) : (
              <InfoCell label="Customer" value={customerName || '—'} />
            )}
            <InfoCell label="Vehicle" value={vehicleLabel || '—'} />
            <InfoCell
              label="Mileage"
              value={visit.mileage > 0 ? `${visit.mileage.toLocaleString()} mi` : '—'}
            />
            <InfoCell label="Service advisor" value={visit.advisor || '—'} />
          </div>
        </div>

        {/* Job lines */}
        <div className="overflow-y-auto px-5 sm:px-8 py-6 space-y-5">
          {lines.length === 0 ? (
            <p className="crm-label text-center py-10">
              No line detail stored for this repair order. Run Pull changes in Admin → PBS Sync to
              load full concern / cause / correction detail.
            </p>
          ) : (
            lines.map((line) => (
              <section
                key={line.lineNumber}
                className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-950/40 overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-slate-900/[0.03] dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-brand-primary/15 border border-brand-primary/30 text-brand-primary text-xs font-black flex items-center justify-center">
                      {line.lineNumber}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      Job line {line.lineNumber}
                      {line.requestCode ? (
                        <span className="ml-2 font-mono text-slate-500">{line.requestCode}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {line.tech && (
                      <span className="badge badge-info text-[10px]">Tech {line.tech}</span>
                    )}
                    {line.status && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        {line.status}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-4 sm:px-5 py-4 space-y-4">
                  <CccBlock label="Concern" value={line.concern} accent="bg-rose-500/70" />
                  <CccBlock label="Cause" value={line.cause} accent="bg-amber-500/70" />
                  <CccBlock label="Correction" value={line.correction} accent="bg-emerald-500/70" />

                  {!line.concern && !line.cause && !line.correction && (
                    <p className="crm-label">No concern / cause / correction recorded.</p>
                  )}

                  {line.labourLines && line.labourLines.length > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                      <p className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-900/[0.03] dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-700/50">
                        Labor operations
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[9px] uppercase tracking-widest text-slate-500">
                            <th className="text-left px-3 py-2 font-bold">Op code</th>
                            <th className="text-left px-3 py-2 font-bold">Description</th>
                            <th className="text-right px-3 py-2 font-bold">Hours</th>
                            <th className="text-right px-3 py-2 font-bold">Tech</th>
                            <th className="text-right px-3 py-2 font-bold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {line.labourLines.map((labour, idx) => (
                            <tr key={idx} className="text-slate-900 dark:text-slate-200">
                              <td className="px-3 py-2 font-mono text-brand-primary">{labour.opCode || '—'}</td>
                              <td className="px-3 py-2">{labour.description || '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {labour.soldHours !== undefined ? Number(labour.soldHours).toFixed(1) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right">{labour.tech || '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(labour.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {line.partLines && line.partLines.length > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                      <p className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-900/[0.03] dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-700/50">
                        Parts
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[9px] uppercase tracking-widest text-slate-500">
                            <th className="text-left px-3 py-2 font-bold">Part #</th>
                            <th className="text-left px-3 py-2 font-bold">Description</th>
                            <th className="text-right px-3 py-2 font-bold">Qty</th>
                            <th className="text-right px-3 py-2 font-bold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {line.partLines.map((part, idx) => (
                            <tr key={idx} className="text-slate-900 dark:text-slate-200">
                              <td className="px-3 py-2 font-mono text-brand-primary">{part.partNumber || '—'}</td>
                              <td className="px-3 py-2">{part.description || '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{part.qty ?? '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(part.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Footer summary */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-950/60 px-5 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
            {lines.length} job line{lines.length === 1 ? '' : 's'}
            {totalLaborHours > 0 ? ` · ${totalLaborHours.toFixed(1)} hrs sold` : ''}
            {totalParts > 0 ? ` · ${totalParts} part${totalParts === 1 ? '' : 's'}` : ''}
          </p>
          <p className="text-[10px] text-slate-600">Data from PBS PartnerHUB</p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
