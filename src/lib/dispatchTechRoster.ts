import type { PerformanceAdvisorSlot } from '../types';

/** Map DMS tech number → display name for dispatch cards. */
export function resolveTechDisplayName(
  techNumber: string,
  roster?: PerformanceAdvisorSlot[]
): string {
  const key = techNumber.trim();
  if (!key) return 'Unassigned';
  const normalized = key.replace(/\D/g, '');
  const match = roster?.find((row) => {
    const rowId = row.id.trim();
    if (rowId === key) return true;
    if (normalized && rowId.replace(/\D/g, '') === normalized) return true;
    return false;
  });
  return match?.label ?? `Tech #${key}`;
}

export function dispatchTechRosterFromSettings(
  settings?: { dispatchTechRoster?: PerformanceAdvisorSlot[] } | null
): PerformanceAdvisorSlot[] {
  return settings?.dispatchTechRoster?.filter((row) => row.id.trim() && row.label.trim()) ?? [];
}
