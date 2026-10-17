import React from 'react';
import { ExternalLink, Loader2, ShieldAlert } from 'lucide-react';
import type { VinRecall, VinRecallReport as Report } from '../../../lib/recallApi';
import { tidyCase } from '../../ui/Panel';

const POWERTRAIN_LABEL = { ice: '', hev: 'Hybrid', phev: 'Plug-in Hybrid', ev: 'Electric' } as const;

function shortDate(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ recall }: { recall: VinRecall }) {
  if (recall.done && !recall.done.open) {
    return <span className="badge badge-success">Done · RO #{recall.done.soNumber} · {shortDate(recall.done.date)}</span>;
  }
  if (recall.done?.open) return <span className="badge badge-info">In progress · open RO #{recall.done.soNumber}</span>;
  return <span className="badge badge-warning">Not on our repair orders</span>;
}

/**
 * The recalls NHTSA lists for this car's model — the right model, hybrid and
 * electric included — each checked against the car's own repair orders by
 * Hyundai's campaign number.
 *
 * It never says "no recalls" about a VIN. NHTSA publishes by model; some
 * recalls cover only part of a model year or cars with certain equipment, so
 * the exact-VIN answer is one tap away on NHTSA's own lookup.
 */
export function VinRecallReport({ report, loading, error }: { report: Report | null; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <section className="card-base px-4 py-4 flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 size={15} className="animate-spin" /> Checking recalls…
      </section>
    );
  }
  if (error) {
    return (
      <section className="card-base px-4 py-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--color-badge-warn-text)' }}>Recalls couldn't be checked</p>
        <p className="crm-label mt-1">{error}</p>
      </section>
    );
  }
  if (!report) return null;

  const v = report.vehicle;
  const carName = [v.year, tidyCase(v.make), v.model, POWERTRAIN_LABEL[v.powertrain]].filter(Boolean).join(' ');
  const open = report.recalls.filter((r) => !r.done || r.done.open);
  const done = report.recalls.length - open.length;
  const baseOnly = report.recalls.some((r) => r.baseModelOnly);

  return (
    <section className="card-base overflow-hidden">
      <header className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-row-divider)' }}>
        <h2 className="crm-section-title flex items-center gap-2">
          <ShieldAlert size={16} className="text-brand-primary" /> Recalls for {carName}
        </h2>
        <p className="crm-label mt-0.5">
          From NHTSA, checked against this car's repair orders
          {report.history.visits > 0 ? ` (${report.history.visits} visits)` : ' — no repair orders on file for this VIN'}
        </p>
        {report.recalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {open.length > 0 && <span className="badge badge-warning">{open.length} not done here</span>}
            {done > 0 && <span className="badge badge-success">{done} done here</span>}
          </div>
        )}
      </header>

      {baseOnly && (
        <p className="px-4 py-2.5 text-xs border-b" style={{ borderColor: 'var(--color-row-divider)', color: 'var(--color-badge-warn-text)' }}>
          NHTSA has nothing filed under the {POWERTRAIN_LABEL[v.powertrain].toLowerCase()} {v.model} for {v.year}, so these are the{' '}
          {v.model}'s. NHTSA doesn't say whether they cover the {POWERTRAIN_LABEL[v.powertrain].toLowerCase()}.
        </p>
      )}

      {report.recalls.length === 0 ? (
        <p className="px-4 py-4 text-sm">No recalls have been filed with NHTSA for the {carName}.</p>
      ) : (
        <ul>
          {report.recalls.map((r) => (
            <li key={r.nhtsaCampaign} className="list-row items-start">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {r.hyundaiCodes.length ? `Hyundai #${r.hyundaiCodes[0]}` : 'Recall'}
                  <span className="crm-label font-normal"> · NHTSA {r.nhtsaCampaign.replace(/000$/, '')} · {shortDate(r.reportDate)}</span>
                </p>
                <p className="text-sm mt-0.5">{tidyCase(r.component.split(':').slice(-2).join(': '))}</p>
                {(r.parkIt || r.parkOutside) && (
                  <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-badge-error-text)' }}>
                    {r.parkIt ? "NHTSA: don't drive until repaired" : 'NHTSA: park outside until repaired'}
                  </p>
                )}
                <details className="mt-1">
                  <summary className="text-xs link-text cursor-pointer">What it is</summary>
                  <p className="text-xs leading-relaxed mt-1 text-text-secondary">{r.summary}</p>
                  {r.remedy && <p className="text-xs leading-relaxed mt-1 text-text-secondary">{r.remedy}</p>}
                </details>
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge recall={r} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="px-4 py-3 text-xs border-t text-text-secondary" style={{ borderColor: 'var(--color-row-divider)' }}>
        NHTSA lists recalls by model. Some cover only part of a model year, or cars with certain equipment.{' '}
        <a href={report.nhtsaVinLookupUrl} target="_blank" rel="noopener noreferrer" className="link-text inline-flex items-center gap-1">
          Check this exact VIN on NHTSA <ExternalLink size={11} />
        </a>
      </p>
    </section>
  );
}

export default VinRecallReport;
