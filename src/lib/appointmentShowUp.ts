/**
 * Appointment show-up rate — of the people on the schedule, how many came in.
 *
 * PBS answers this itself. When a customer arrives and the advisor turns the
 * appointment into a repair order, PBS changes the appointment's status from
 * "Open" to "Transfer". Checked against the live schedule on 2026-10-15: every
 * appointment still to come was Open and none was Transfer, while past days ran
 * 84–87% Transfer, month after month.
 *
 * The version removed on 2026-10-02 guessed instead — it matched appointment
 * names to visits in customer files — and read 7%.
 *
 *   Transfer             showed
 *   Open, day has passed no-show — unless the sync found a repair order opened
 *                        for that car the same day (`arrived`): the advisor wrote
 *                        a fresh repair order instead of converting the appointment
 *   Open, today or later not judged yet; they may still come in
 *   Void / cancelled     left out — nobody was expected
 *
 * Deliberately free of imports so the tests can bundle it on its own.
 */

export type ShowUpOutcome = 'showed' | 'noShow' | 'upcoming' | 'cancelled' | 'unknown';

export interface ShowUpSlot {
  status?: string;
  /** Set by the sync: an Open appointment whose car had a repair order opened that day. */
  arrived?: boolean;
  customerName?: string;
  advisor?: string;
  vehicleLabel?: string;
  startMinutes?: number;
}

export interface ShowUpDay {
  /** YYYY-MM-DD */
  date: string;
  appointments: ShowUpSlot[];
}

export interface NoShowEntry {
  date: string;
  customerName: string;
  advisor: string;
  vehicleLabel: string;
  startMinutes?: number;
}

export interface ShowUpSummary {
  /** Appointments that were not cancelled. */
  booked: number;
  showed: number;
  noShow: number;
  /** Today's and later appointments still Open — not judged yet. */
  upcoming: number;
  cancelled: number;
  /** A status PBS has not been seen to use; counted nowhere else. */
  unknown: number;
  /** Of `showed`, the ones caught by a same-day repair order rather than a Transfer. */
  showedByRepairOrder: number;
  /** showed ÷ (showed + no-show), 0–100 rounded. Null until a day has passed. */
  rate: number | null;
  /** Newest first. */
  noShows: NoShowEntry[];
  /** Days that had a schedule stored. */
  days: number;
}

export function showUpOutcome(slot: ShowUpSlot, date: string, today: string): ShowUpOutcome {
  const status = String(slot?.status ?? '').trim().toLowerCase();
  if (status.includes('void') || status.includes('cancel') || status.includes('delete')) return 'cancelled';
  if (status.includes('transfer')) return 'showed';
  if (status === '' || status === 'open') {
    if (slot?.arrived) return 'showed';
    return date < today ? 'noShow' : 'upcoming';
  }
  return 'unknown';
}

export function summarizeShowUp(days: readonly ShowUpDay[], today: string): ShowUpSummary {
  const out: ShowUpSummary = {
    booked: 0,
    showed: 0,
    noShow: 0,
    upcoming: 0,
    cancelled: 0,
    unknown: 0,
    showedByRepairOrder: 0,
    rate: null,
    noShows: [],
    days: 0,
  };

  for (const day of days ?? []) {
    const date = String(day?.date ?? '').slice(0, 10);
    if (!date) continue;
    out.days += 1;
    for (const slot of Array.isArray(day.appointments) ? day.appointments : []) {
      const outcome = showUpOutcome(slot, date, today);
      if (outcome === 'cancelled') {
        out.cancelled += 1;
        continue;
      }
      out.booked += 1;
      if (outcome === 'showed') {
        out.showed += 1;
        if (!String(slot.status ?? '').toLowerCase().includes('transfer')) out.showedByRepairOrder += 1;
      } else if (outcome === 'noShow') {
        out.noShow += 1;
        out.noShows.push({
          date,
          customerName: String(slot.customerName ?? '').trim() || 'Unknown customer',
          advisor: String(slot.advisor ?? '').trim(),
          vehicleLabel: String(slot.vehicleLabel ?? '').trim(),
          startMinutes: slot.startMinutes,
        });
      } else if (outcome === 'upcoming') {
        out.upcoming += 1;
      } else {
        out.unknown += 1;
      }
    }
  }

  const judged = out.showed + out.noShow;
  out.rate = judged > 0 ? Math.round((out.showed / judged) * 100) : null;
  out.noShows.sort((a, b) => b.date.localeCompare(a.date) || (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
  return out;
}

/** The month before a 'YYYY-MM' key. */
export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
