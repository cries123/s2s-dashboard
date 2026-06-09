import {
  defaultDispatchTechRoster,
  dispatchTechRosterForDealership,
  rosterIncludesFordDmsTech,
  rosterIncludesHyundaiTech,
} from '../constants/dispatchTechDefaults';
import type { DispatchRepairOrder, PerformanceAdvisorSlot } from '../types';

export function normalizeTechNumber(techNumber: string): string {
  const trimmed = techNumber.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  return digits || trimmed;
}

export function techLastName(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : parts[0] ?? label;
}

export interface TechWorkloadRow {
  techId: string;
  lastName: string;
  count: number;
}

/** Roster techs with active RO counts — sorted busiest first. */
export function buildTechWorkloadSummary(
  roster: PerformanceAdvisorSlot[],
  techRoCounts: Map<string, number>
): TechWorkloadRow[] {
  return roster
    .map((row) => ({
      techId: row.id,
      lastName: techLastName(row.label),
      count: techRoCounts.get(normalizeTechNumber(row.id)) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.lastName.localeCompare(b.lastName));
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

/**
 * Dispatch tech list for one store.
 * Ford and Hyundai always use isolated built-in rosters — saved settings cannot cross-contaminate.
 */
export function dispatchTechRosterFromSettings(
  settings?: { dispatchTechRoster?: PerformanceAdvisorSlot[] } | null,
  dealershipId?: string
): PerformanceAdvisorSlot[] {
  if (!dealershipId) return [];

  if (dealershipId === 'ford' || dealershipId === 'hyundai') {
    return dispatchTechRosterForDealership(dealershipId);
  }

  const configured =
    settings?.dispatchTechRoster?.filter((row) => row.id.trim() && row.label.trim()) ?? [];
  if (configured.length > 0) {
    if (rosterIncludesFordDmsTech(configured) || rosterIncludesHyundaiTech(configured)) {
      return [];
    }
    return configured;
  }

  return defaultDispatchTechRoster(dealershipId);
}

/** Whether a saved settings roster is contaminated with another store's tech list. */
export function isCrossDealershipDispatchRoster(
  roster: PerformanceAdvisorSlot[],
  dealershipId: string
): boolean {
  if (dealershipId === 'hyundai') return rosterIncludesFordDmsTech(roster);
  if (dealershipId === 'ford') return rosterIncludesHyundaiTech(roster);
  return rosterIncludesFordDmsTech(roster) || rosterIncludesHyundaiTech(roster);
}
