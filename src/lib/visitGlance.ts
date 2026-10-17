import { isOilChangeServiceText, visitDay } from './visitStore';

/**
 * A car's service history in one line — counted by the app, not written by AI,
 * so it is instant, free, and always matches the visit list under it.
 */

export interface GlanceVisit {
  date?: string;
  mileage?: number;
  requests?: string;
  open?: boolean;
  lines?: Array<{ concern?: string; correction?: string; labourLines?: Array<{ description?: string }> }>;
}

export interface VisitGlance {
  visits: number;
  /** Year of the oldest dated visit. */
  sinceYear?: number;
  lastDate?: string;
  lastMileage?: number;
  lastOilDate?: string;
  lastOilMileage?: number;
  /** Repair orders not paid yet — the car may be in the shop. */
  open: number;
}

function visitText(v: GlanceVisit): string {
  const lines = Array.isArray(v.lines) ? v.lines : [];
  return [
    v.requests ?? '',
    ...lines.flatMap((l) => [l.concern ?? '', l.correction ?? '', ...(l.labourLines || []).map((x) => x.description ?? '')]),
  ].join(' ');
}

export function visitGlance(visits: readonly GlanceVisit[]): VisitGlance {
  const dated = visits
    .map((v) => ({ v, day: visitDay(v.date) }))
    .filter((x): x is { v: GlanceVisit; day: string } => Boolean(x.day))
    .sort((a, b) => b.day.localeCompare(a.day));

  const last = dated[0];
  const oil = dated.find((x) => isOilChangeServiceText(visitText(x.v)));
  const oldest = dated[dated.length - 1];

  return {
    visits: visits.length,
    sinceYear: oldest ? Number(oldest.day.slice(0, 4)) : undefined,
    lastDate: last?.day,
    lastMileage: last?.v.mileage && last.v.mileage > 0 ? last.v.mileage : undefined,
    lastOilDate: oil?.day,
    lastOilMileage: oil?.v.mileage && oil.v.mileage > 0 ? oil.v.mileage : undefined,
    open: visits.filter((v) => v.open).length,
  };
}

/** "Mar 4, 2026" */
export function glanceDate(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
