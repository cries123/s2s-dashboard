import type { DispatchRepairOrder } from '../types';

/** Sort repair orders by RO number (numeric when possible). */
export function compareDispatchRoNumber(a: string, b: string): number {
  const digits = (value: string) => value.replace(/\D/g, '');
  const na = parseInt(digits(a), 10);
  const nb = parseInt(digits(b), 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortDispatchOrdersByRoNumber(orders: DispatchRepairOrder[]): DispatchRepairOrder[] {
  return [...orders].sort((a, b) => compareDispatchRoNumber(a.roNumber, b.roNumber));
}
