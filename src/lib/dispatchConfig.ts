import { DepartmentColumnId } from '../types';

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
} as const;

export const DISPATCH_INTAKE_FLAG_STYLES = {
  waiting: { label: 'W', bg: '#EF4444', text: '#FFFFFF' },
  pdl: { label: 'PDL', bg: '#22C55E', text: '#FFFFFF' },
} as const;

export function dispatchLaneLabel(laneId: DepartmentColumnId): string {
  if (laneId === 'unassigned') return 'Waiting Queue';
  return DISPATCH_PRODUCTION_LANES.find((lane) => lane.id === laneId)?.label ?? laneId;
}
