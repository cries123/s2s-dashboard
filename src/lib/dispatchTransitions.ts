import type { DepartmentColumnId, DispatchLifecycleStatus, DispatchRepairOrder } from '../types';

export type DispatchMoveTarget = DepartmentColumnId | 'overnight';

export function normalizeDispatchOrder(
  data: Omit<DispatchRepairOrder, 'id'>,
  id: string
): DispatchRepairOrder {
  const department = (data.department || data.currentLaneId || 'unassigned') as DepartmentColumnId;
  return {
    ...data,
    id,
    department,
    currentLaneId: department,
    lifecycleStatus: data.lifecycleStatus ?? 'active',
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
    return {
      lifecycleStatus: 'overnight',
      department: 'unassigned',
      currentLaneId: 'unassigned',
      lastUpdated,
    };
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

export function buildOvernightQueuePatch(): Partial<DispatchRepairOrder> {
  const lastUpdated = new Date().toISOString();
  return {
    lifecycleStatus: 'overnight',
    department: 'unassigned',
    currentLaneId: 'unassigned',
    lastUpdated,
  };
}
