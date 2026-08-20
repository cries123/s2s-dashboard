import type { DispatchRepairOrder } from '../types';
import { sortDispatchOrdersByRoNumber } from './dispatchRoSort';

function searchableFields(ro: DispatchRepairOrder): string[] {
  return [
    ro.roNumber,
    ro.roNumber.replace(/\D/g, ''),
    ro.tagNumber,
    ro.customerName,
    ro.customerLastName,
    ro.vinLastEight,
    ro.techNumber,
    ro.stockNumber,
    ro.model,
    ro.phoneNumber,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
}

/** Whether a repair order matches a free-text dispatch search query. */
export function dispatchRoMatchesQuery(ro: DispatchRepairOrder, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return false;

  const qDigits = q.replace(/\D/g, '');
  const roDigits = ro.roNumber.replace(/\D/g, '');

  if (qDigits && roDigits.includes(qDigits)) return true;

  return searchableFields(ro).some((field) => field.includes(q));
}

/** Return matching repair orders sorted by RO number (active and completed). */
export function searchDispatchOrders(
  orders: DispatchRepairOrder[],
  query: string
): DispatchRepairOrder[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return sortDispatchOrdersByRoNumber(orders.filter((ro) => dispatchRoMatchesQuery(ro, trimmed)));
}
