import React from 'react';
import { ChevronDown, UserCheck } from 'lucide-react';
import type { ShowUpRateState } from '../../../hooks/useShowUpRate';
import { monthKeyLabel, monthKeyRange } from '../../../lib/operationsMonthKeys';
import { formatPeriodRange } from '../../../lib/reportPeriodLabel';
import { CardMeta } from '../../ui/CardNotice';
import { tidyCase, tidyPersonName } from '../../ui/Panel';

interface ShowUpRateCardProps {
  /** From useShowUpRate — Operations reads it once and shares it with the Appointments tile. */
  showUp: ShowUpRateState;
}

/** How many no-shows to list before "and N more"; the rest are a scroll away in PBS. */
const NO_SHOW_LIST_LIMIT = 60;

function timeLabel(minutes?: number): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Of the people on the schedule, how many came in — straight from PBS, which
 * marks an appointment "Transfer" once it becomes a repair order. The rules are
 * in lib/appointmentShowUp; this shows the month picked on Operations beside the
 * month before it, and who did not come.
 */
export function ShowUpRateCard({ showUp }: ShowUpRateCardProps) {
  const { monthKey, prevKey, current, previous, loading, error } = showUp;
  const range = monthKeyRange(monthKey);
  const delta = current.rate != null && previous.rate != null ? current.rate - previous.rate : null;
  const monthName = monthKeyLabel(monthKey).split(' ')[0];
  const prevName = monthKeyLabel(prevKey).split(' ')[0];

  let body: React.ReactNode;
  if (loading && current.days === 0) {
    body = <div className="h-16 rounded-md animate-pulse" style={{ backgroundColor: 'var(--color-surface-hover)' }} />;
  } else if (error) {
    body = <p className="text-sm text-text-secondary">The appointment schedule could not be loaded. Reload to try again.</p>;
  } else if (current.days === 0) {
    body = (
      <p className="text-sm text-text-secondary">
        No appointment schedule is stored for {monthKeyLabel(monthKey)}.
      </p>
    );
  } else if (current.rate == null) {
    body = <p className="text-sm text-text-secondary">No appointments have come due yet this month.</p>;
  } else {
    body = (
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="crm-kpi-value text-3xl tabular-nums">{current.rate}%</p>
          <p className="crm-label mt-1 tabular-nums">
            {current.showed.toLocaleString()} of {(current.showed + current.noShow).toLocaleString()} came in
          </p>
        </div>
        <div>
          <p className="text-xl font-semibold tabular-nums">{previous.rate != null ? `${previous.rate}%` : '—'}</p>
          <p className="crm-label mt-1">
            {prevName}
            {delta != null && delta !== 0 ? (
              <span
                className="ml-1.5 tabular-nums font-semibold"
                style={{ color: delta > 0 ? 'var(--color-badge-success-text)' : 'var(--color-badge-error-text)' }}
              >
                {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} pt{Math.abs(delta) === 1 ? '' : 's'}
              </span>
            ) : delta === 0 ? (
              <span className="ml-1.5">· same</span>
            ) : null}
          </p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="crm-label">No-shows</dt>
            <dd className="font-semibold tabular-nums">{current.noShow.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="crm-label">Cancelled</dt>
            <dd className="font-semibold tabular-nums">{current.cancelled.toLocaleString()}</dd>
          </div>
          {current.upcoming > 0 && (
            <div>
              <dt className="crm-label">Still to come</dt>
              <dd className="font-semibold tabular-nums">{current.upcoming.toLocaleString()}</dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  const hidden = Math.max(0, current.noShows.length - NO_SHOW_LIST_LIMIT);

  return (
    <section className="card-base overflow-hidden">
      <header className="px-4 py-3 sm:px-5 border-b" style={{ borderColor: 'var(--color-row-divider)' }}>
        <h2 className="crm-section-title flex items-center gap-2">
          <UserCheck size={16} className="text-brand-primary" />
          Show-up rate
        </h2>
        <CardMeta>{formatPeriodRange(range.start, range.end)} · appointments that came in, from PBS</CardMeta>
      </header>

      <div className="px-4 py-4 sm:px-5">{body}</div>

      {current.noShows.length > 0 && (
        <details className="group border-t" style={{ borderColor: 'var(--color-row-divider)' }}>
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-3 px-4 sm:px-5 min-h-[44px] text-sm font-semibold text-brand-primary hover:bg-[var(--color-surface-hover)]">
            {monthName}'s no-shows ({current.noShows.length.toLocaleString()})
            <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="max-h-[420px] overflow-y-auto border-t" style={{ borderColor: 'var(--color-row-divider)' }}>
            {current.noShows.slice(0, NO_SHOW_LIST_LIMIT).map((n, i) => (
              <li key={`${n.date}-${i}`} className="list-row">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{tidyPersonName(n.customerName)}</p>
                  <p className="crm-label mt-0.5 truncate">
                    {[tidyCase(n.vehicleLabel), n.advisor ? tidyCase(n.advisor) : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums">{shortDate(n.date)}</p>
                  <p className="crm-label tabular-nums">{timeLabel(n.startMinutes)}</p>
                </div>
              </li>
            ))}
            {hidden > 0 && (
              <li className="list-row crm-label">and {hidden.toLocaleString()} more</li>
            )}
          </ul>
        </details>
      )}
    </section>
  );
}

export default ShowUpRateCard;
