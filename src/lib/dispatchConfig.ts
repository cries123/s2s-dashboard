import { DepartmentColumnId } from '../types';

/** Production lanes only (excludes unassigned queue). */
export type DispatchProductionLane = Exclude<DepartmentColumnId, 'unassigned'>;

export const DISPATCH_PRODUCTION_LANES: {
  id: DispatchProductionLane;
  label: string;
}[] = [
  { id: 'lube', label: 'Lube Unit' },
  { id: 'quick_service', label: 'Quick Service' },
  { id: 'ac_electrical', label: 'AC / Electrical' },
  { id: 'heavyline', label: 'Heavyline Core' },
  { id: 'diesel', label: 'Diesel Power' },
  { id: 'trans', label: 'Transmission' },
  { id: 'mobile_repair', label: 'Mobile Fleet' },
];

export const DEFAULT_DISPATCH_LANE_CAPACITY: Record<DispatchProductionLane, number> = {
  lube: 8,
  quick_service: 10,
  ac_electrical: 6,
  heavyline: 5,
  diesel: 4,
  trans: 4,
  mobile_repair: 3,
};

export function mergeLaneCapacity(
  configured?: Partial<Record<DispatchProductionLane, number>>
): Record<DispatchProductionLane, number> {
  return { ...DEFAULT_DISPATCH_LANE_CAPACITY, ...configured };
}

export const DISPATCH_STATUS_COLORS = {
  WIP: { label: 'Work In Progress', hex: '#FACC15', text: '#1E293B' },
  DIS: { label: 'Down In Shop', hex: '#EF4444', text: '#FFFFFF' },
  POO: { label: 'Parts on Order', hex: '#EC4899', text: '#FFFFFF' },
  WFA: { label: 'Waiting for Authorization', hex: '#F97316', text: '#FFFFFF' },
} as const;
