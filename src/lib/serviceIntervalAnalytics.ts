import type { Customer } from '../types';
import { oilChangeVisits, visitCount } from './customerVisits';

export interface OilChangeIntervalAnalysis {
  hasData: boolean;
  count: number;
  avgDays: number;
  avgMonths: number;
  avgMiles?: number;
  lastDate?: string;
  lastMileage?: number;
  nextDueDateIso?: string;
  nextDueDateLabel?: string;
  nextMileage?: number;
  message?: string;
}

// Oil-change classification lives with the visit summary now, which is where it
// is decided once per visit. Re-exported so existing imports keep working.
export { isOilChangeServiceText, visitIsOilChange } from './visitStore';

function addDaysIso(from: Date, days: number): string {
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + Math.round(days));
  return next.toISOString().slice(0, 10);
}

function formatDueLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Computes average days between oil-change visits (needs at least 2 oil visits). */
export function analyzeOilChangeInterval(customer: Customer): OilChangeIntervalAnalysis {
  if (visitCount(customer) === 0) {
    return { hasData: false, count: 0, avgDays: 0, avgMonths: 0, message: 'No service history on file.' };
  }

  // Oldest first, classified once when the visit was summarised rather than by
  // rescanning every line of every visit here.
  const oilVisits = oilChangeVisits(customer);

  if (oilVisits.length === 0) {
    return {
      hasData: false,
      count: 0,
      avgDays: 0,
      avgMonths: 0,
      message: 'No recorded oil changes found in service history.',
    };
  }

  if (oilVisits.length === 1) {
    return {
      hasData: false,
      count: 1,
      avgDays: 0,
      avgMonths: 0,
      lastDate: oilVisits[0].date,
      lastMileage: oilVisits[0].mileage,
      message: 'Only 1 oil change recorded. Need at least 2 visits to compute average interval.',
    };
  }

  let totalDays = 0;
  let totalMiles = 0;
  let calculationCount = 0;

  for (let i = 1; i < oilVisits.length; i++) {
    const prev = oilVisits[i - 1];
    const curr = oilVisits[i];
    const prevTime = new Date(prev.date).getTime();
    const currTime = new Date(curr.date).getTime();

    if (!Number.isNaN(prevTime) && !Number.isNaN(currTime)) {
      const daysDiff = (currTime - prevTime) / (1000 * 60 * 60 * 24);
      if (daysDiff > 0) {
        totalDays += daysDiff;
        totalMiles += Math.abs(curr.mileage - prev.mileage);
        calculationCount++;
      }
    }
  }

  const lastOilVisit = oilVisits[oilVisits.length - 1];

  if (calculationCount === 0) {
    return {
      hasData: false,
      count: oilVisits.length,
      avgDays: 0,
      avgMonths: 0,
      lastDate: lastOilVisit.date,
      lastMileage: lastOilVisit.mileage,
      message: 'Duplicate or invalid dates in oil change records.',
    };
  }

  const avgDays = totalDays / calculationCount;
  const avgMiles = Math.round(totalMiles / calculationCount);
  const avgMonths = Number((avgDays / 30.4375).toFixed(1));
  const lastDateObj = new Date(`${lastOilVisit.date}T00:00:00`);
  const nextDueDateIso = Number.isNaN(lastDateObj.getTime())
    ? undefined
    : addDaysIso(lastDateObj, avgDays);

  return {
    hasData: true,
    count: oilVisits.length,
    avgDays: Math.round(avgDays),
    avgMonths,
    avgMiles,
    lastDate: lastOilVisit.date,
    lastMileage: lastOilVisit.mileage,
    nextDueDateIso,
    nextDueDateLabel: nextDueDateIso ? formatDueLabel(nextDueDateIso) : undefined,
    nextMileage: lastOilVisit.mileage + avgMiles,
  };
}
