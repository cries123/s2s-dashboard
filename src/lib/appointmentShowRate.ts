/**
 * Appointment show rate — did the people who booked actually turn up?
 *
 * PBS gives every appointment a free-form `status` string, but nothing in this
 * codebase establishes which values mean "arrived" versus "booked", so relying
 * on it would be guessing. Instead an appointment counts as shown when that
 * customer has a repair order dated the same day. Visit dates are data we know
 * we have, and an RO on the day is the thing that actually matters.
 *
 * Names arrive in different orders from the two sources — "MENDOZA, JOSE" on an
 * appointment, "Jose Mendoza" on the customer record — so matching is done on a
 * sorted set of name tokens.
 */

export interface ShowRateAppointment {
  /** Local date, YYYY-MM-DD. */
  date: string;
  customerName: string;
  advisor?: string;
  category?: string;
  isWaiter?: boolean;
}

export interface ShowRateCustomer {
  firstName?: string;
  lastName?: string;
  recentVisits?: Array<{ date?: string }> | null;
}

export interface ShowRateBucket {
  key: string;
  scheduled: number;
  showed: number;
  /** 0–100, rounded. Null when nothing was scheduled. */
  showRate: number | null;
}

export interface ShowRateResult {
  scheduled: number;
  showed: number;
  noShow: number;
  showRate: number | null;
  /** Appointments we could not judge because the name matched no customer record. */
  unmatchedNames: number;
  byDate: ShowRateBucket[];
  byAdvisor: ShowRateBucket[];
  byWeekday: ShowRateBucket[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "MENDOZA, JOSE" and "Jose Mendoza" both become "jose|mendoza". */
export function nameKey(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .sort()
    .join('|');
}

function rate(showed: number, scheduled: number): number | null {
  return scheduled > 0 ? Math.round((showed / scheduled) * 100) : null;
}

function toBuckets(m: Map<string, { scheduled: number; showed: number }>): ShowRateBucket[] {
  return [...m.entries()]
    .map(([key, v]) => ({ key, scheduled: v.scheduled, showed: v.showed, showRate: rate(v.showed, v.scheduled) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function computeShowRate(
  appointments: ShowRateAppointment[],
  customers: ShowRateCustomer[]
): ShowRateResult {
  // customer name -> the set of dates they have a repair order on
  const visitsByName = new Map<string, Set<string>>();
  // A name we know about at all, so an unmatched appointment can be told apart
  // from a customer who simply did not come in.
  const knownNames = new Set<string>();

  for (const c of customers ?? []) {
    const key = nameKey(`${c.firstName ?? ''} ${c.lastName ?? ''}`);
    if (!key) continue;
    knownNames.add(key);
    const dates = visitsByName.get(key) ?? new Set<string>();
    for (const v of c.recentVisits ?? []) {
      if (v?.date) dates.add(String(v.date).slice(0, 10));
    }
    visitsByName.set(key, dates);
  }

  const byDate = new Map<string, { scheduled: number; showed: number }>();
  const byAdvisor = new Map<string, { scheduled: number; showed: number }>();
  const byWeekday = new Map<string, { scheduled: number; showed: number }>();

  let scheduled = 0;
  let showed = 0;
  let unmatchedNames = 0;

  const bump = (
    m: Map<string, { scheduled: number; showed: number }>,
    key: string,
    didShow: boolean
  ) => {
    const cur = m.get(key) ?? { scheduled: 0, showed: 0 };
    cur.scheduled += 1;
    if (didShow) cur.showed += 1;
    m.set(key, cur);
  };

  for (const appt of appointments ?? []) {
    const date = String(appt?.date ?? '').slice(0, 10);
    if (!date) continue;
    const key = nameKey(appt.customerName);

    // An appointment whose name matches nobody cannot be judged either way.
    // Counting it as a no-show would invent a problem out of a data gap.
    if (!key || !knownNames.has(key)) {
      unmatchedNames += 1;
      continue;
    }

    const didShow = visitsByName.get(key)?.has(date) ?? false;
    scheduled += 1;
    if (didShow) showed += 1;

    bump(byDate, date, didShow);
    bump(byAdvisor, appt.advisor?.trim() || 'Unassigned', didShow);

    const d = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(d.getTime())) bump(byWeekday, WEEKDAYS[d.getDay()], didShow);
  }

  const weekdayBuckets = toBuckets(byWeekday).sort(
    (a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key)
  );

  return {
    scheduled,
    showed,
    noShow: scheduled - showed,
    showRate: rate(showed, scheduled),
    unmatchedNames,
    byDate: toBuckets(byDate),
    byAdvisor: toBuckets(byAdvisor).sort((a, b) => b.scheduled - a.scheduled),
    byWeekday: weekdayBuckets,
  };
}
