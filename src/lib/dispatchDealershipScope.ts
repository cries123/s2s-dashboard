import type { DispatchRepairOrder } from '../types';

/** Keep dispatch board data scoped to the active dealership. */
export function filterDispatchOrdersForDealership(
  orders: DispatchRepairOrder[],
  dealershipId: string
): DispatchRepairOrder[] {
  return orders.filter((order) => order.dealershipId === dealershipId);
}

export function isDispatchOrderForDealership(
  order: Pick<DispatchRepairOrder, 'dealershipId'>,
  dealershipId: string
): boolean {
  return order.dealershipId === dealershipId;
}
