import type { DepartmentColumnId, DispatchLifecycleStatus, DispatchRepairOrder, DispatchStatus } from '../types';
import { DISPATCH_PRODUCTION_LANES } from './dispatchConfig';
import { getDispatchDatePst } from './dispatchPst';

export type DispatchMoveTarget = DepartmentColumnId | 'overnight';

const LEGACY_DEPARTMENT_MAP: Record<string, DepartmentColumnId> = {
  mobile_repair: 'down_in_shop',
};

const PRODUCTION_LANE_IDS = new Set<string>(
  DISPATCH_PRODUCTION_LANES.map((lane) => lane.id).filter((id) => id !== 'down_in_shop')
);

const KNOWN_DEPARTMENTS: DepartmentColumnId[] = [
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

/** Normalize stored date values to PST YYYY-MM-DD for stable comparisons. */
export function normalizeDispatchDateKey(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const isoDay = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return getDispatchDatePst(parsed);
}

export function normalizeDispatchStatus(status: string | undefined): DispatchStatus {
  if (status === 'POO' || status === 'WFA' || status === 'SBL' || status === 'PRT') return status;
  return 'WIP';
}

function migrateDepartment(
  department: string | undefined,
  currentLaneId?: string
): DepartmentColumnId {
  const candidates = [department, currentLaneId].filter(Boolean) as string[];

  for (const raw of candidates) {
    const key = raw.trim();
    if (!key) continue;

    if (LEGACY_DEPARTMENT_MAP[key]) return LEGACY_DEPARTMENT_MAP[key];

    const normalized = key.toLowerCase().replace(/[\s-/]+/g, '_');
    if (LEGACY_DEPARTMENT_MAP[normalized]) return LEGACY_DEPARTMENT_MAP[normalized];
    if (KNOWN_DEPARTMENTS.includes(normalized as DepartmentColumnId)) {
      return normalized as DepartmentColumnId;
    }
    if (KNOWN_DEPARTMENTS.includes(key as DepartmentColumnId)) {
      return key as DepartmentColumnId;
    }
  }

  // Never demote an assigned lane to the waiting queue on read — preserve in Down in Shop.
  if (candidates.length > 0) {
    return 'down_in_shop';
  }

  return 'unassigned';
}

export function normalizeDispatchOrder(
  data: Omit<DispatchRepairOrder, 'id'>,
  id: string
): DispatchRepairOrder {
  const department = migrateDepartment(data.department, data.currentLaneId);
  return {
    ...data,
    id,
    department,
    currentLaneId: department,
    dealershipId: data.dealershipId,
    status: normalizeDispatchStatus(data.status),
    lifecycleStatus: data.lifecycleStatus ?? 'active',
    isWaiting: !!data.isWaiting,
    isPdl: !!data.isPdl,
  };
}

export function isPriorCalendarDayRo(
  ro: DispatchRepairOrder,
  businessDatePst: string
): boolean {
  const created = normalizeDispatchDateKey(ro.dateCreated);
  return created !== null && created < businessDatePst;
}

/** Visual overnight indicator — prior-day ticket or explicit overnight lifecycle. */
export function isOvernightRo(ro: DispatchRepairOrder, businessDatePst: string): boolean {
  return ro.lifecycleStatus === 'overnight' || isPriorCalendarDayRo(ro, businessDatePst);
}

function shouldRefreshDateOnLaneAssign(
  ro: DispatchRepairOrder,
  target: DepartmentColumnId,
  businessDatePst: string
): boolean {
  if (target === 'unassigned') return false;
  return (
    ro.lifecycleStatus === 'overnight' ||
    isPriorCalendarDayRo(ro, businessDatePst) ||
    ro.department === 'unassigned' ||
    ro.department === 'down_in_shop'
  );
}

/** Build Firestore patch for click-to-move or overnight transitions. */
export function buildDispatchMoveUpdate(
  ro: DispatchRepairOrder,
  target: DispatchMoveTarget,
  businessDatePst: string
): Partial<DispatchRepairOrder> {
  const lastUpdated = new Date().toISOString();

  if (target === 'overnight') {
    return buildOvernightDownInShopPatch();
  }

  if (target === 'unassigned') {
    return {
      lifecycleStatus: 'active' satisfies DispatchLifecycleStatus,
      department: 'unassigned',
      currentLaneId: 'unassigned',
      lastUpdated,
    };
  }

  const refreshDate = shouldRefreshDateOnLaneAssign(ro, target, businessDatePst);
  return {
    lifecycleStatus: 'active' satisfies DispatchLifecycleStatus,
    department: target,
    currentLaneId: target,
    lastUpdated,
    ...(refreshDate ? { dateCreated: businessDatePst } : {}),
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

/**
 * Tickets eligible for the midnight PST sweep: active, incomplete, still in a production lane.
 * Timing is enforced by the caller — never run this outside the midnight window.
 */
export function shouldSweepOvernightCarryover(ro: DispatchRepairOrder): boolean {
  return (
    !ro.isCompleted &&
    (ro.lifecycleStatus ?? 'active') === 'active' &&
    PRODUCTION_LANE_IDS.has(ro.department)
  );
}
