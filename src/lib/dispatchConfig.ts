import { DepartmentColumnId, DispatchLaneCustomization, DispatchStatus } from '../types';

/** Production lanes only (excludes unassigned queue). */
export type DispatchProductionLane = Exclude<DepartmentColumnId, 'unassigned'>;

export const DISPATCH_PRODUCTION_LANES: {
  id: DispatchProductionLane;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'lube', label: 'Lube', shortLabel: 'Lube' },
  { id: 'quick_service', label: 'Quick/Sus', shortLabel: 'Quick' },
  { id: 'ac_electrical', label: 'AC/Elec', shortLabel: 'AC' },
  { id: 'drivability', label: 'Drivability', shortLabel: 'Drive' },
  { id: 'heavyline', label: 'Heavy', shortLabel: 'Heavy' },
  { id: 'diesel', label: 'Diesel', shortLabel: 'Diesel' },
  { id: 'trans', label: 'Trans', shortLabel: 'Trans' },
  { id: 'down_in_shop', label: 'Down in Shop', shortLabel: 'Down' },
];

export const DEFAULT_DISPATCH_LANE_CAPACITY: Record<DispatchProductionLane, number> = {
  lube: 8,
  quick_service: 10,
  ac_electrical: 6,
  drivability: 5,
  heavyline: 5,
  diesel: 4,
  trans: 4,
  down_in_shop: 12,
};

export function mergeLaneCapacity(
  configured?: Partial<Record<DispatchProductionLane, number>>
): Record<DispatchProductionLane, number> {
  return { ...DEFAULT_DISPATCH_LANE_CAPACITY, ...configured };
}

export const DISPATCH_STATUS_COLORS = {
  WIP: { label: 'In Progress', hex: '#F97316', text: '#FFFFFF' },
  POO: { label: 'In Parts', hex: '#3B82F6', text: '#FFFFFF' },
  WFA: { label: 'Waiting Advisor', hex: '#9333EA', text: '#FFFFFF' },
  SBL: { label: 'Sublet', hex: '#14B8A6', text: '#FFFFFF' },
  DIS: { label: 'Down in Shop', hex: '#64748B', text: '#FFFFFF' },
} as const;

/** Status options shown at intake — tickets start in the queue, not down in shop. */
export const DISPATCH_INTAKE_STATUS_OPTIONS = ['WIP', 'POO', 'WFA', 'SBL'] as const satisfies readonly DispatchStatus[];

export const DISPATCH_INTAKE_FLAG_STYLES = {
  waiting: { label: 'W', bg: '#EF4444', text: '#FFFFFF' },
  pdl: { label: 'PDL', bg: '#22C55E', text: '#FFFFFF' },
} as const;

export function getOrderedDispatchLanes(
  customization?: DispatchLaneCustomization | null
): typeof DISPATCH_PRODUCTION_LANES {
  const order = customization?.order?.filter((id) =>
    DISPATCH_PRODUCTION_LANES.some((lane) => lane.id === id)
  );
  if (!order?.length) return DISPATCH_PRODUCTION_LANES;

  const ordered = order
    .map((id) => DISPATCH_PRODUCTION_LANES.find((lane) => lane.id === id))
    .filter((lane): lane is (typeof DISPATCH_PRODUCTION_LANES)[number] => !!lane);

  const remaining = DISPATCH_PRODUCTION_LANES.filter((lane) => !order.includes(lane.id));
  return [...ordered, ...remaining];
}

export function dispatchLaneLabel(
  laneId: DepartmentColumnId,
  customization?: DispatchLaneCustomization | null
): string {
  if (laneId === 'unassigned') return 'Waiting Queue';
  const custom = customization?.labels?.[laneId as DispatchProductionLane];
  if (custom?.trim()) return custom.trim();
  return DISPATCH_PRODUCTION_LANES.find((lane) => lane.id === laneId)?.label ?? laneId;
}
