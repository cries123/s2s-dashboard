import React, { useMemo, useState } from 'react';
import { CalendarCheck, ChevronDown, ChevronUp } from 'lucide-react';
import type { Customer } from '../../../types';
import { useAppointmentRange } from '../../../hooks/useAppointmentRange';
import { computeShowRate } from '../../../lib/appointmentShowRate';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';
import { cn } from '../../../lib/utils';

interface ShowRateCardProps {
  dealershipId: string;
  customers: Customer[];
  /** Period being viewed in Operations, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  periodLabel: string;
}

function toneFor(percent: number | null): string {
  if (percent === null) return '';
  if (percent >= 85) return 'text-emerald-400';
  if (percent >= 70) return 'text-amber-400';
  return 'text-rose-400';
}

/**
 * How many booked appointments actually turned into a repair order.
 *
 * Collapsed by default — it sits under the numbers people open Operations for,
 * and opens to the advisor and weekday splits, which is where the answer to
 * "why" usually is.
 */
export function ShowRateCard({
  dealershipId,
  customers,
  startDate,
  endDate,
  periodLabel,
}: ShowRateCardProps) {
  const [open, setOpen] = useState(false);
  const { appointments, loading, error } = useAppointmentRange(dealershipId, startDate, endDate);

  const result = useMemo(
    () => computeShowRate(appointments.map((a) => ({
      date: a.date,
      customerName: a.customerName,
      advisor: a.advisor,
      category: a.category,
      isWaiter: a.isWaiter,
    })), customers ?? []),
    [appointments, customers]
  );

  const headline = result.showRate === null ? '—' : `${result.showRate}%`;

  return (
    <section className="card-base overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        <span className="min-w-0">
          <span className="crm-section-title flex items-center gap-2">
            <CalendarCheck size={16} className="text-brand-primary" />
            Appointment show rate
          </span>
          <span className="crm-label block mt-0.5 truncate">
            {loading
              ? 'Loading the schedule…'
              : error
                ? 'Schedule unavailable'
                : `${result.showed} of ${result.scheduled} kept · ${periodLabel}`}
          </span>
        </span>
        <span className="flex items-center gap-3 shrink-0">
          <span className={cn('text-xl font-semibold tabular-nums', toneFor(result.showRate))}>
            {loading ? '' : headline}
          </span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: 'var(--color-surface-border)' }}>
          {error ? (
            <p className="text-sm text-text-secondary">{error}</p>
          ) : loading ? (
            <p className="text-sm text-text-secondary">Reading the appointment schedule…</p>
          ) : result.scheduled === 0 ? (
            <p className="text-sm text-text-secondary">
              No appointments in this period could be matched to a customer record.
            </p>
          ) : (
            <>
              <CardNoticeRow>
                <CardNotice tone="info" summary="How a show is counted">
                  An appointment counts as kept when that customer has a repair order dated the
                  same day. PBS does send an appointment status, but nothing here establishes
                  which of its values mean "arrived", so the repair order is used instead.
                </CardNotice>
                {result.unmatchedNames > 0 && (
                  <CardNotice
                    tone="warn"
                    summary={`${result.unmatchedNames} not counted`}
                  >
                    {result.unmatchedNames} appointment
                    {result.unmatchedNames === 1 ? '' : 's'} named someone with no customer record,
                    so there is no way to tell whether they came in. They are left out of the rate
                    rather than counted against it.
                  </CardNotice>
                )}
              </CardNoticeRow>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Booked', value: result.scheduled },
                  { label: 'Kept', value: result.showed },
                  { label: 'No-shows', value: result.noShow },
                ].map((t) => (
                  <div key={t.label} className="rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)' }}>
                    <p className="crm-label">{t.label}</p>
                    <p className="text-lg font-semibold tabular-nums mt-0.5">{t.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {result.byAdvisor.length > 0 && (
                <div>
                  <p className="crm-label mb-2">By advisor</p>
                  <ul className="divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
                    {result.byAdvisor.slice(0, 8).map((b) => (
                      <li key={b.key} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-sm truncate">{b.key}</span>
                        <span className="crm-label tabular-nums shrink-0">
                          {b.showed}/{b.scheduled}
                          <span className={cn('ml-2 font-semibold', toneFor(b.showRate))}>
                            {b.showRate === null ? '—' : `${b.showRate}%`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.byWeekday.length > 1 && (
                <div>
                  <p className="crm-label mb-2">By day of week</p>
                  <ul className="divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
                    {result.byWeekday.map((b) => (
                      <li key={b.key} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-sm">{b.key}</span>
                        <span className="crm-label tabular-nums shrink-0">
                          {b.showed}/{b.scheduled}
                          <span className={cn('ml-2 font-semibold', toneFor(b.showRate))}>
                            {b.showRate === null ? '—' : `${b.showRate}%`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default ShowRateCard;
