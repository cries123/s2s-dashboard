/** Client mirror of server PBS automated sync scope — Hyundai of Santa Maria only. */
export const PBS_SYNC_DEALERSHIP_ID = 'hyundai' as const;
export const PBS_SYNC_DEALERSHIP_NAME = 'Hyundai of Santa Maria';

export function isPbsSyncDealership(dealershipId: string | undefined | null): boolean {
  return (dealershipId || '').trim().toLowerCase() === PBS_SYNC_DEALERSHIP_ID;
}
