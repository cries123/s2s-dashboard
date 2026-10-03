/**
 * Appointment show rate — did the people who booked actually turn up?
 *
 * An appointment counts as shown when that customer has a repair order that
 * **opened** on the appointment date. The opened date is the day the car came
 * in; a visit's `date` is the day it was cashiered, which is usually later and
 * for bigger jobs much later. Matching on the cashier date scored every car not
 * paid for the same day as a no-show, which read as a 7% show rate when the
 * truth was closer to the opposite.
 *
 * Two things are deliberately not counted rather than guessed at:
 *
 *   - an appointment whose name matches no customer record, and
 *   - an appointment for a customer with no visit history at all, whose car was
 *     never linked to PBS. There is no evidence either way for those, and
 *     scoring them as no-shows invents a problem out of a gap in the data.
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
  recentVisits?: Array<{ date?: string; openedDate?: string }> | null;
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
  /** Appointments for a known customer who has no service history to judge against. */
  noVisitHistory: number;
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
  // customer name -> the days they had a car in the shop
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
      // The day it opened is the day they turned up. Older records predate that
      // field, so fall back to the cashier date rather than ignoring them.
      const arrived = v?.openedDate || v?.date;
      if (arrived) dates.add(String(arrived).slice(0, 10));
    }
    visitsByName.set(key, dates);
  }

  const byDate = new Map<string, { scheduled: number; showed: number }>();
  const byAdvisor = new Map<string, { scheduled: number; showed: number }>();
  const byWeekday = new Map<string, { scheduled: number; showed: number }>();

  let scheduled = 0;
  let showed = 0;
  let unmatchedNames = 0;
  let noVisitHistory = 0;

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

    // Nothing on record for this customer, so there is nothing to judge against.
    const seen = visitsByName.get(key);
    if (!seen || seen.size === 0) {
      noVisitHistory += 1;
      continue;
    }

    const didShow = seen.has(date);
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
    noVisitHistory,
    byDate: toBuckets(byDate),
    byAdvisor: toBuckets(byAdvisor).sort((a, b) => b.scheduled - a.scheduled),
    byWeekday: weekdayBuckets,
  };
}
