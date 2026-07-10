import React from 'react';
import { X, Wrench, Gauge, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type { ServiceVisit, ServiceVisitLine } from '../../../types';

interface ServiceVisitDetailModalProps {
  visit: ServiceVisit;
  customerName?: string;
  onClose: () => void;
}

function resolveVisitLines(visit: ServiceVisit): ServiceVisitLine[] {
  if (visit.lines && visit.lines.length > 0) return visit.lines;
  if (visit.requests?.trim()) {
    return [{ lineNumber: 1, concern: visit.requests.trim() }];
  }
  return [];
}

function formatVisitDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CccField({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="space-y-1">
      <p className="crm-label">{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
        {value}
      </p>
    </div>
  );
}

export function ServiceVisitDetailModal({ visit, customerName, onClose }: ServiceVisitDetailModalProps) {
  const lines = resolveVisitLines(visit);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="badge badge-info text-[10px]">service</span>
              {visit.status && <span className="crm-label uppercase">{visit.status}</span>}
            </div>
            <h3 className="text-xl font-bold text-white">Repair order #{visit.soNumber}</h3>
            <p className="crm-label mt-1">
              {formatVisitDate(visit.date)}
              {visit.advisor ? ` · Advisor ${visit.advisor}` : ''}
              {customerName ? ` · ${customerName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close repair order details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
              <p className="crm-label flex items-center gap-1.5">
                <Gauge size={12} />
                Mileage
              </p>
              <p className="text-lg font-semibold tabular-nums mt-1">
                {visit.mileage > 0 ? `${visit.mileage.toLocaleString()} mi` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
              <p className="crm-label flex items-center gap-1.5">
                <UserIcon size={12} />
                Advisor
              </p>
              <p className="text-lg font-semibold mt-1">{visit.advisor || '—'}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
              <p className="crm-label flex items-center gap-1.5">
                <Wrench size={12} />
                Request lines
              </p>
              <p className="text-lg font-semibold tabular-nums mt-1">{lines.length}</p>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="crm-label text-center py-8">No line detail available for this repair order.</p>
          ) : (
            lines.map((line) => (
              <div
                key={line.lineNumber}
                className="rounded-2xl border border-white/5 bg-slate-950/30 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="crm-label">Line {line.lineNumber}</p>
                    {line.requestCode && (
                      <p className="text-xs font-mono text-slate-400 mt-0.5">{line.requestCode}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {line.tech && <span className="badge text-[10px]">Tech {line.tech}</span>}
                    {line.status && <span className="crm-label uppercase">{line.status}</span>}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <CccField label="Concern" value={line.concern} />
                  <CccField label="Cause" value={line.cause} />
                  <CccField label="Correction" value={line.correction} />

                  {!line.concern && !line.cause && !line.correction && (
                    <p className="crm-label">No concern / cause / correction recorded for this line.</p>
                  )}

                  {line.labourLines && line.labourLines.length > 0 && (
                    <div>
                      <p className="crm-label mb-2">Labor operations</p>
                      <div className="overflow-x-auto rounded-xl border border-white/5">
                        <table className="crm-table text-xs">
                          <thead>
                            <tr>
                              <th>Op code</th>
                              <th>Description</th>
                              <th className="text-right">Hours</th>
                              <th>Tech</th>
                              <th className="text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {line.labourLines.map((labour, idx) => (
                              <tr key={idx}>
                                <td className="font-mono">{labour.opCode || '—'}</td>
                                <td>{labour.description || '—'}</td>
                                <td className="text-right tabular-nums">
                                  {labour.soldHours !== undefined ? labour.soldHours.toFixed(1) : '—'}
                                </td>
                                <td>{labour.tech || '—'}</td>
                                <td className="text-right tabular-nums">{formatCurrency(labour.price)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {line.partLines && line.partLines.length > 0 && (
                    <div>
                      <p className="crm-label mb-2">Parts</p>
                      <div className="overflow-x-auto rounded-xl border border-white/5">
                        <table className="crm-table text-xs">
                          <thead>
                            <tr>
                              <th>Part #</th>
                              <th>Description</th>
                              <th className="text-right">Qty</th>
                              <th className="text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {line.partLines.map((part, idx) => (
                              <tr key={idx}>
                                <td className="font-mono">{part.partNumber || '—'}</td>
                                <td>{part.description || '—'}</td>
                                <td className="text-right tabular-nums">{part.qty ?? '—'}</td>
                                <td className="text-right tabular-nums">{formatCurrency(part.price)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {(!visit.lines || visit.lines.length === 0) && visit.requests && (
            <p className="text-[10px] text-slate-500 text-center">
              Run PBS sync to refresh full line detail, concern, cause, and correction fields.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
