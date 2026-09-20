import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Users, CalendarClock, DollarSign } from 'lucide-react';
import type { Customer } from '../../../types';
import { PageHeader } from '../../layout/PageHeader';
import { KpiStrip } from '../../ui/KpiStrip';
import { EmptyState } from '../../ui/EmptyState';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';
import { computeSalesToService, type ConversionBucket } from '../../../lib/salesToService';
import { isHouseAccountCustomer } from '../../../lib/houseAccounts';

interface SalesToServiceProps {
  customers: Customer[];
}

/** How long a customer gets to come back before the cohort is judged. */
const HORIZONS = [
  { days: 90, label: 'First 90 days' },
  { days: 180, label: 'First 6 months' },
  { days: 365, label: 'First year' },
  { days: 0, label: 'Ever' },
];

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function RateBar({ percent }: { percent: number | null }) {
  const width = Math.min(100, Math.max(0, percent ?? 0));
  return (
    <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
      <div className="h-full rounded-full bg-brand-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

function BucketTable({
  title,
  caption,
  buckets,
  labelFor,
}: {
  title: string;
  caption: string;
  buckets: ConversionBucket[];
  labelFor: (key: string) => string;
}) {
  if (!buckets.length) return null;
  return (
    <section className="card-base p-5">
      <h2 className="crm-section-title">{title}</h2>
      <p className="crm-label mt-0.5">{caption}</p>

      <ul className="mt-4 divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
        {buckets.map((b) => (
          <li key={b.key} className="py-3 flex items-center gap-4">
            <div className="w-28 sm:w-36 shrink-0 min-w-0">
              <p className="text-sm font-medium truncate">{labelFor(b.key)}</p>
              <p className="crm-label tabular-nums">
                {b.converted} of {b.sold} sold
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <RateBar percent={b.conversionRate} />
            </div>
            <p className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
              {b.conversionRate === null ? '—' : `${b.conversionRate}%`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The headline question this product exists to answer: of the people the sales
 * floor sold to, how many did the service drive ever see.
 */
export default function SalesToService({ customers }: SalesToServiceProps) {
  const [horizonDays, setHorizonDays] = useState<number>(365);

  const result = useMemo(
    () =>
      computeSalesToService(customers ?? [], {
        withinDays: horizonDays > 0 ? horizonDays : undefined,
        isExcluded: (c) => isHouseAccountCustomer(c),
      }),
    [customers, horizonDays]
  );

  const horizonLabel = HORIZONS.find((h) => h.days === horizonDays)?.label ?? '';
  const recentMonths = useMemo(() => result.byMonthSold.slice(-12).reverse(), [result.byMonthSold]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Sales to service"
        description="Of the customers we sold to, how many came back for service."
        breadcrumbs={[{ label: 'Reports' }, { label: 'Sales to service' }]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {HORIZONS.map((h) => (
            <button
              key={h.days}
              type="button"
              onClick={() => setHorizonDays(h.days)}
              className={
                horizonDays === h.days
                  ? 'shrink-0 px-3 py-1.5 rounded-md text-sm whitespace-nowrap bg-brand-primary text-white min-h-[36px]'
                  : 'shrink-0 px-3 py-1.5 rounded-md text-sm whitespace-nowrap hover:bg-[var(--color-surface-hover)] min-h-[36px]'
              }
              style={horizonDays === h.days ? undefined : { color: 'var(--color-text-secondary)' }}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <CardNoticeRow>
        <CardNotice tone="info" summary="How this is counted">
          A customer converts when they have a repair order dated on or after their sold date,
          within {horizonDays > 0 ? `${horizonDays} days of the sale` : 'any time since'}. Visits
          before the sale are ignored — those belong to the previous owner. Dealership-owned
          records are excluded.
        </CardNotice>
        {result.revenueDataCoverage !== null && result.revenueDataCoverage < 90 && (
          <CardNotice tone="warn" summary={`Revenue covers ${result.revenueDataCoverage}% of visits`}>
            Only {result.revenueDataCoverage}% of the counted repair orders carry labour or parts
            pricing — most of the imported history has none. Conversion and timing are sound;
            treat the revenue figures as a floor, not a total.
          </CardNotice>
        )}
      </CardNoticeRow>

      {result.sold === 0 ? (
        <EmptyState
          title="No sold customers in range"
          description="Nothing here has a sold date yet, so there is no cohort to measure."
        />
      ) : (
        <>
          <KpiStrip
            tiles={[
              { label: 'Sold customers', value: result.sold.toLocaleString(), tone: 'info' },
              {
                label: `Came in for service`,
                value: result.conversionRate === null ? '—' : `${result.conversionRate}%`,
                tone: 'success',
              },
              {
                label: 'Median time to first visit',
                value:
                  result.medianDaysToFirstVisit === null
                    ? '—'
                    : `${result.medianDaysToFirstVisit} days`,
              },
              {
                label: 'Service $ per sold customer',
                value: `$${result.revenuePerSoldCustomer.toLocaleString()}`,
              },
            ]}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="card-base px-4 py-3.5">
              <p className="crm-label flex items-center gap-1.5">
                <Users size={13} className="text-brand-primary" /> Converted
              </p>
              <p className="crm-kpi-value mt-1">{result.converted.toLocaleString()}</p>
              <p className="crm-label mt-1">of {result.sold.toLocaleString()} sold · {horizonLabel.toLowerCase()}</p>
            </div>
            <div className="card-base px-4 py-3.5">
              <p className="crm-label flex items-center gap-1.5">
                <ArrowRightLeft size={13} className="text-brand-primary" /> Never came in
              </p>
              <p className="crm-kpi-value mt-1">{(result.sold - result.converted).toLocaleString()}</p>
              <p className="crm-label mt-1">customers the drive never saw</p>
            </div>
            <div className="card-base px-4 py-3.5">
              <p className="crm-label flex items-center gap-1.5">
                <DollarSign size={13} className="text-brand-primary" /> Service revenue
              </p>
              <p className="crm-kpi-value mt-1">${result.revenue.toLocaleString()}</p>
              <p className="crm-label mt-1">
                {result.revenueDataCoverage === null
                  ? 'no priced visits'
                  : `from ${result.revenueDataCoverage}% of visits with pricing`}
              </p>
            </div>
          </div>

          <BucketTable
            title="By month sold"
            caption="Each month's cohort, judged on the same window."
            buckets={recentMonths}
            labelFor={monthLabel}
          />

          <BucketTable
            title="By salesperson"
            caption="Who hands over customers the service drive actually sees."
            buckets={result.bySalesperson}
            labelFor={(k) => k}
          />

          <p className="crm-label flex items-center gap-1.5">
            <CalendarClock size={13} />
            Based on {customers.length.toLocaleString()} customer records currently loaded.
          </p>
        </>
      )}
    </div>
  );
}
