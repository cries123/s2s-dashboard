/** PBS PartnerHUB automated sync is scoped to one store only. */
export const PBS_AUTOMATED_SYNC_DEALERSHIP_ID = 'hyundai' as const;
export const PBS_AUTOMATED_SYNC_DEALERSHIP_NAME = 'Hyundai of Santa Maria';

export function isPbsAutomatedSyncDealership(dealershipId: string | undefined | null): boolean {
  return (dealershipId || '').trim().toLowerCase() === PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
}

export function resolvePbsAutomatedSyncDealershipId(
  dealershipId: string | undefined | null
): typeof PBS_AUTOMATED_SYNC_DEALERSHIP_ID | null {
  return isPbsAutomatedSyncDealership(dealershipId)
    ? PBS_AUTOMATED_SYNC_DEALERSHIP_ID
    : null;
}

export function pbsAutomatedSyncScopeError(dealershipId?: string | null): string {
  return `PBS automated sync is only enabled for ${PBS_AUTOMATED_SYNC_DEALERSHIP_NAME} (dealershipId: ${PBS_AUTOMATED_SYNC_DEALERSHIP_ID}). Other stores use separate DMS workflows and are not modified.`;
}

export function customerBelongsToPbsSyncDealership(
  customer: { dealershipId?: string | null },
  dealershipId: string = PBS_AUTOMATED_SYNC_DEALERSHIP_ID
): boolean {
  const owner = (customer.dealershipId || 'hyundai').trim().toLowerCase();
  if (dealershipId === 'hyundai') {
    return !customer.dealershipId || owner === 'hyundai';
  }
  return owner === dealershipId;
}
