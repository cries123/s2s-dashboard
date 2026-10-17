/**
 * What the AI is shown, and the check that it did not make anything up.
 *
 * Every AI feature here only rewords — it never decides a number. The check
 * that enforces that: any number in what the AI wrote must already be in what
 * it was given. An invented mileage, price, percentage or count fails, and the
 * caller retries or falls back to text the app writes itself. (The appointment
 * show rate that read 7% is the reason this matters: a number people learn to
 * distrust takes the whole screen down with it.)
 *
 * No names, phone numbers or VINs go into these texts — only the work and the
 * dealership's own totals.
 *
 * Deliberately free of imports so the tests can bundle it on its own.
 */

/** Numbers in a text, normalised: "$27,167.50" -> "27167.5", "64%" -> "64", "1.0" -> "1". */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? '').matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,/g, '');
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(String(n));
  }
  return out;
}

/** Numbers the AI wrote that appear nowhere in what it was given. Empty = faithful. */
export function unsupportedNumbers(output: string, sources: readonly string[]): string[] {
  const allowed = new Set(sources.flatMap((s) => numbersIn(s)));
  return [...new Set(numbersIn(output).filter((n) => !allowed.has(n)))];
}

// --- repair orders --------------------------------------------------------------------

export interface VisitLineLike {
  lineNumber?: number;
  concern?: string;
  cause?: string;
  correction?: string;
  labourLines?: Array<{ description?: string; opCode?: string }>;
  partLines?: Array<{ description?: string }>;
}

export interface VisitLike {
  date?: string;
  mileage?: number;
  requests?: string;
  lines?: VisitLineLike[];
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * One repair order as plain text, job line by job line: the customer's concern,
 * the technician's cause and correction, what was done and what parts went in.
 * Prices and op codes are left out — they are on the repair order already and
 * are not the story.
 */
export function visitStoryText(visit: VisitLike): string {
  const lines = Array.isArray(visit.lines) ? visit.lines : [];
  if (lines.length === 0) {
    const requests = clean(visit.requests);
    return requests ? `Work requested: ${requests}` : '';
  }
  return lines
    .map((line, i) => {
      const parts = [`Job ${line.lineNumber ?? i + 1}`];
      if (clean(line.concern)) parts.push(`Concern: ${clean(line.concern)}`);
      if (clean(line.cause)) parts.push(`Cause (technician): ${clean(line.cause)}`);
      if (clean(line.correction)) parts.push(`Correction (technician): ${clean(line.correction)}`);
      const work = (line.labourLines || []).map((l) => clean(l.description)).filter(Boolean);
      if (work.length) parts.push(`Labor: ${[...new Set(work)].join('; ')}`);
      const parts_ = (line.partLines || []).map((p) => clean(p.description)).filter(Boolean);
      if (parts_.length) parts.push(`Parts: ${[...new Set(parts_)].join('; ')}`);
      return parts.join('\n');
    })
    .join('\n\n');
}

/**
 * A car's visits as one line each, newest first — date, mileage, and what was
 * asked for and done. Capped so a long history stays a short prompt.
 */
export function historyText(visits: readonly VisitLike[], max = 40): string {
  return [...visits]
    .filter((v) => clean(v.date))
    .sort((a, b) => clean(b.date).localeCompare(clean(a.date)))
    .slice(0, max)
    .map((v) => {
      const lines = Array.isArray(v.lines) ? v.lines : [];
      const did = lines.length
        ? lines
            .map((l) => clean(l.correction) || clean(l.concern) || (l.labourLines || []).map((x) => clean(x.description)).filter(Boolean).join('; '))
            .filter(Boolean)
            .join(' | ')
        : clean(v.requests);
      const miles = v.mileage && v.mileage > 0 ? ` · ${v.mileage.toLocaleString('en-US')} mi` : '';
      return `${clean(v.date).slice(0, 10)}${miles} · ${did.slice(0, 300) || 'no detail recorded'}`;
    })
    .join('\n');
}

// --- the morning briefing ---------------------------------------------------------------

export interface BriefingFacts {
  /** "Friday, October 17" */
  todayLabel: string;
  month: string;
  laborGross?: string;
  laborGoal?: string;
  laborTrending?: string;
  laborPctOfGoal?: string;
  hoursSold?: string;
  elr?: string;
  appointmentsMtd?: string;
  appointmentsTrending?: string;
  workingDaysLeft?: string;
  /** The last day that had appointments, e.g. "Thursday". */
  lastDayLabel?: string;
  lastDayShowed?: string;
  lastDayBooked?: string;
  lastDayNoShows?: string;
  monthShowUpRate?: string;
  todayAppointments?: string;
  /** When the labor numbers were last pulled from PBS, e.g. "6:04 AM". */
  laborAsOf?: string;
}

const LABELS: Record<keyof BriefingFacts, string> = {
  todayLabel: 'Today',
  month: 'Month',
  laborGross: 'Labor gross so far this month',
  laborGoal: 'Labor gross goal for the month',
  laborTrending: 'Labor gross trending to (end of month)',
  laborPctOfGoal: 'Trending as a share of goal',
  hoursSold: 'Hours sold so far this month',
  elr: 'Effective labor rate',
  appointmentsMtd: 'Appointments so far this month',
  appointmentsTrending: 'Appointments trending to (end of month)',
  workingDaysLeft: 'Working days left in the month',
  lastDayLabel: 'Last day with appointments',
  lastDayShowed: 'Customers who showed up that day',
  lastDayBooked: 'Appointments due that day',
  lastDayNoShows: 'No-shows that day',
  monthShowUpRate: 'Show-up rate this month',
  todayAppointments: 'Appointments on the schedule today',
  laborAsOf: 'Labor numbers last pulled from PBS at',
};

/** The facts as "label: value" lines — exactly what the AI sees. */
export function briefingFactsText(f: BriefingFacts): string {
  return (Object.keys(LABELS) as Array<keyof BriefingFacts>)
    .filter((k) => f[k] != null && String(f[k]).trim() !== '')
    .map((k) => `${LABELS[k]}: ${f[k]}`)
    .join('\n');
}

/** The same briefing without AI — what shows when there is no key, or the AI strays. */
export function templateBriefing(f: BriefingFacts): string {
  const s: string[] = [];
  if (f.laborGross) {
    s.push(
      `Labor gross is ${f.laborGross} so far in ${f.month}` +
        (f.laborTrending ? `, trending to ${f.laborTrending}` : '') +
        (f.laborGoal ? ` against a ${f.laborGoal} goal` : '') +
        (f.laborPctOfGoal ? ` (${f.laborPctOfGoal})` : '') +
        '.'
    );
  }
  if (f.lastDayLabel && f.lastDayBooked) {
    s.push(
      `${f.lastDayLabel}, ${f.lastDayShowed ?? '0'} of ${f.lastDayBooked} appointments showed up` +
        (f.lastDayNoShows && f.lastDayNoShows !== '0' ? ` and ${f.lastDayNoShows} didn't` : '') +
        '.'
    );
  }
  if (f.todayAppointments) s.push(`${f.todayAppointments} appointments are on the schedule today.`);
  if (f.appointmentsMtd) {
    s.push(
      `${f.appointmentsMtd} appointments so far this month` +
        (f.appointmentsTrending ? `, trending to ${f.appointmentsTrending}` : '') +
        '.'
    );
  }
  return s.join(' ') || 'No numbers have been pulled for this month yet.';
}
