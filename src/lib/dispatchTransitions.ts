import type { DepartmentColumnId, DispatchLifecycleStatus, DispatchRepairOrder, DispatchStatus } from '../types';
import { DISPATCH_PRODUCTION_LANES } from './dispatchConfig';

export type DispatchMoveTarget = DepartmentColumnId | 'overnight';

const LEGACY_DEPARTMENT_MAP: Record<string, DepartmentColumnId> = {
  mobile_repair: 'down_in_shop',
};

const PRODUCTION_LANE_IDS = new Set(
  DISPATCH_PRODUCTION_LANES.map((lane) => lane.id).filter((id) => id !== 'down_in_shop')
);

export function normalizeDispatchStatus(status: string | undefined): DispatchStatus {
  if (status === 'POO' || status === 'WFA') return status;
  return 'WIP';
}

function migrateDepartment(dept: string | undefined): DepartmentColumnId {
  if (!dept) return 'unassigned';
  if (LEGACY_DEPARTMENT_MAP[dept]) return LEGACY_DEPARTMENT_MAP[dept];
  const known: DepartmentColumnId[] = [
    'lube',
    'quick_service',
    'ac_electrical',
    'drivability',
    'heavyline',
    'diesel',
    'trans',
    'down_in_shop',
    'unassigned',
  ];
  return known.includes(dept as DepartmentColumnId) ? (dept as DepartmentColumnId) : 'unassigned';
}

export function normalizeDispatchOrder(
  data: Omit<DispatchRepairOrder, 'id'>,
  id: string
): DispatchRepairOrder {
  const department = migrateDepartment(data.department || data.currentLaneId);
  return {
    ...data,
    id,
    department,
    currentLaneId: department,
    status: normalizeDispatchStatus(data.status),
    lifecycleStatus: data.lifecycleStatus ?? 'active',
    isWaiting: !!data.isWaiting,
    isPdl: !!data.isPdl,
  };
}

export function isOvernightRo(ro: DispatchRepairOrder, currentSystemDate: string): boolean {
  return ro.lifecycleStatus === 'overnight' || ro.dateCreated < currentSystemDate;
}

/** Build Firestore patch for click-to-move or overnight transitions. */
export function buildDispatchMoveUpdate(
  ro: DispatchRepairOrder,
  target: DispatchMoveTarget,
  currentSystemDate: string
): Partial<DispatchRepairOrder> {
  const lastUpdated = new Date().toISOString();

  if (target === 'overnight') {
    return buildOvernightDownInShopPatch();
  }

  const wasOvernight = isOvernightRo(ro, currentSystemDate);
  return {
    lifecycleStatus: 'active' satisfies DispatchLifecycleStatus,
    department: target,
    currentLaneId: target,
    lastUpdated,
    ...(wasOvernight ? { dateCreated: currentSystemDate } : {}),
  };
}

/** End-of-day carryovers land in Down in Shop until dragged back to a lane. */
export function buildOvernightDownInShopPatch(): Partial<DispatchRepairOrder> {
  const lastUpdated = new Date().toISOString();
  return {
    lifecycleStatus: 'overnight',
    department: 'down_in_shop',
    currentLaneId: 'down_in_shop',
    lastUpdated,
  };
}

/** @deprecated Use buildOvernightDownInShopPatch */
export const buildOvernightQueuePatch = buildOvernightDownInShopPatch;

export function shouldSweepOvernightCarryover(
  ro: DispatchRepairOrder,
  currentSystemDate: string
): boolean {
  return (
    !ro.isCompleted &&
    isOvernightRo(ro, currentSystemDate) &&
    PRODUCTION_LANE_IDS.has(ro.department)
  );
}
