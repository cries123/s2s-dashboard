import React, { useMemo, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { glanceDate, visitGlance, type GlanceVisit } from '../../../lib/visitGlance';
import { summarizeHistory } from '../../../lib/aiAssistApi';

interface HistoryAtAGlanceProps {
  customerId: string;
  visits: readonly GlanceVisit[];
  loading?: boolean;
}

/**
 * The top of a customer's service history: the counts, worked out by the app,
 * and — only when someone asks — an AI summary of the visits listed below it.
 * The summary is made fresh each time and never saved.
 */
export function HistoryAtAGlance({ customerId, visits, loading }: HistoryAtAGlanceProps) {
  const g = useMemo(() => visitGlance(visits), [visits]);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading && visits.length === 0) return null;
  if (g.visits === 0) return null;

  const facts = [
    `${g.visits} visit${g.visits === 1 ? '' : 's'}${g.sinceYear ? ` since ${g.sinceYear}` : ''}`,
    g.lastDate ? `Last visit ${glanceDate(g.lastDate)}${g.lastMileage ? ` · ${g.lastMileage.toLocaleString()} mi` : ''}` : null,
    g.lastOilDate
      ? `Last oil change ${glanceDate(g.lastOilDate)}${g.lastOilMileage ? ` · ${g.lastOilMileage.toLocaleString()} mi` : ''}`
      : 'No oil change on record',
    g.open > 0 ? `${g.open} open repair order${g.open === 1 ? '' : 's'}` : null,
  ].filter(Boolean) as string[];

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await summarizeHistory(customerId);
      setSummary(res.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not summarize the history.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-base px-4 py-3 space-y-2.5">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {facts.map((f, i) => (
          <li key={i} className={i === 0 ? 'font-semibold' : 'text-text-secondary'}>
            {f}
          </li>
        ))}
      </ul>

      {summary ? (
        <div className="rounded-md border px-3 py-2.5" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="text-brand-primary shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed flex-1">{summary}</p>
            <button
              type="button"
              onClick={() => setSummary(null)}
              className="icon-btn tap-expand shrink-0"
              aria-label="Hide the summary"
            >
              <X size={14} />
            </button>
          </div>
          <p className="crm-label mt-1.5">AI summary of the visits below · not saved</p>
        </div>
      ) : (
        <button type="button" onClick={ask} disabled={busy} className="btn-secondary text-sm">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {busy ? 'Summarizing…' : 'Summarize history'}
        </button>
      )}
      {error && (
        <p className="text-xs" role="status" style={{ color: 'var(--color-badge-error-text)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default HistoryAtAGlance;
