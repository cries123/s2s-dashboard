import type { DispatchRepairOrder } from '../types';
import { DISPATCH_PRODUCTION_LANES } from './dispatchConfig';
import type { DispatchProductionLane } from './dispatchConfig';

export interface DispatchActivitySummary {
  createdToday: number;
  activeCount: number;
  avgMinutesInLane: number | null;
  laneAverages: Partial<Record<DispatchProductionLane, number>>;
}

function parseIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function computeDispatchActivitySummary(
  orders: DispatchRepairOrder[],
  businessDatePst: string,
  nowMs: number = Date.now()
): DispatchActivitySummary {
  const scoped = orders.filter((o) => !o.isCompleted);
  const createdToday = scoped.filter((o) => o.dateCreated === businessDatePst).length;

  const laneTotals: Partial<Record<DispatchProductionLane, { sum: number; count: number }>> = {};
  let totalMinutes = 0;
  let totalWithTime = 0;

  for (const ro of scoped) {
    if (ro.department === 'unassigned') continue;
    const startMs = parseIsoMs(ro.lastUpdated) ?? parseIsoMs(ro.dateCreated + 'T08:00:00');
    if (startMs == null) continue;
    const minutes = Math.max(0, (nowMs - startMs) / 60_000);
    totalMinutes += minutes;
    totalWithTime += 1;

    const lane = ro.department as DispatchProductionLane;
    if (DISPATCH_PRODUCTION_LANES.some((l) => l.id === lane)) {
      const bucket = laneTotals[lane] ?? { sum: 0, count: 0 };
      bucket.sum += minutes;
      bucket.count += 1;
      laneTotals[lane] = bucket;
    }
  }

  const laneAverages: Partial<Record<DispatchProductionLane, number>> = {};
  for (const [lane, { sum, count }] of Object.entries(laneTotals)) {
    if (count > 0) {
      laneAverages[lane as DispatchProductionLane] = Math.round(sum / count);
    }
  }

  return {
    createdToday,
    activeCount: scoped.length,
    avgMinutesInLane: totalWithTime > 0 ? Math.round(totalMinutes / totalWithTime) : null,
    laneAverages,
  };
}
