import type { DepartmentColumnId, DispatchRepairOrder } from '../types';
import { DISPATCH_PRODUCTION_LANES } from './dispatchConfig';

export type DispatchStatus = DispatchRepairOrder['status'];

export interface DispatchMetrics {
  activeCount: number;
  queueCount: number;
  overnightCount: number;
  writtenToday: number;
  completedToday: number;
  statusCounts: Record<DispatchStatus, number>;
  avgQueueWaitMinutes: number;
  avgLaneWaitMinutes: Partial<Record<DepartmentColumnId, number>>;
}

function minutesSince(isoOrDate: string): number {
  const t = new Date(isoOrDate).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (Date.now() - t) / 60_000);
}

export function computeDispatchMetrics(
  orders: DispatchRepairOrder[],
  currentSystemDate: string,
  isOvernight: (ro: DispatchRepairOrder) => boolean
): DispatchMetrics {
  const active = orders.filter((o) => !o.isCompleted);
  const writtenToday = orders.filter((o) => o.dateCreated === currentSystemDate).length;
  const completedToday = orders.filter(
    (o) =>
      o.isCompleted &&
      o.lastUpdated &&
      new Date(o.lastUpdated).toLocaleDateString('en-CA') === currentSystemDate
  ).length;

  const statusCounts: Record<DispatchStatus, number> = { WIP: 0, PRT: 0, POO: 0, WFA: 0, SBL: 0 };
  active.forEach((o) => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  });

  const queue = active.filter((o) => o.department === 'unassigned');
  const queueWaits = queue.map((o) => minutesSince(o.lastUpdated || o.dateCreated));
  const avgQueueWaitMinutes = queueWaits.length
    ? queueWaits.reduce((sum, value) => sum + value, 0) / queueWaits.length
    : 0;

  const avgLaneWaitMinutes: Partial<Record<DepartmentColumnId, number>> = {};
  for (const lane of DISPATCH_PRODUCTION_LANES) {
    const inLane = active.filter((o) => o.department === lane.id);
    if (inLane.length === 0) continue;
    avgLaneWaitMinutes[lane.id] =
      inLane.map((o) => minutesSince(o.lastUpdated)).reduce((sum, value) => sum + value, 0) /
      inLane.length;
  }

  return {
    activeCount: active.length,
    queueCount: queue.length,
    overnightCount: active.filter(isOvernight).length,
    writtenToday,
    completedToday,
    statusCounts,
    avgQueueWaitMinutes,
    avgLaneWaitMinutes,
  };
}

export function formatWaitMinutes(minutes: number): string {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
