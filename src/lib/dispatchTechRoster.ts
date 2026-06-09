import { defaultDispatchTechRoster } from '../constants/dispatchTechDefaults';
import type { DispatchRepairOrder, PerformanceAdvisorSlot } from '../types';

export function normalizeTechNumber(techNumber: string): string {
  const trimmed = techNumber.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  return digits || trimmed;
}

/** Active (incomplete) RO count per normalized tech number. */
export function countActiveRosByTech(orders: DispatchRepairOrder[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ro of orders) {
    if (ro.isCompleted) continue;
    const key = normalizeTechNumber(ro.techNumber);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function formatTechLabelWithCount(
  techNumber: string,
  roster: PerformanceAdvisorSlot[] | undefined,
  techRoCounts: Map<string, number>
): string {
  const label = resolveTechDisplayName(techNumber, roster);
  const key = normalizeTechNumber(techNumber);
  const count = key ? techRoCounts.get(key) : undefined;
  if (count && count > 0) return `${label} (${count})`;
  return label;
}

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

/** Dispatch tech list for one store — never falls back to another dealership's roster. */
export function dispatchTechRosterFromSettings(
  settings?: { dispatchTechRoster?: PerformanceAdvisorSlot[] } | null,
  dealershipId?: string
): PerformanceAdvisorSlot[] {
  if (!dealershipId) return [];

  const configured =
    settings?.dispatchTechRoster?.filter((row) => row.id.trim() && row.label.trim()) ?? [];
  if (configured.length > 0) return configured;

  // Built-in DMS roster is Hyundai-only; Ford/Nissan/etc. configure their own in admin.
  return defaultDispatchTechRoster(dealershipId);
}
