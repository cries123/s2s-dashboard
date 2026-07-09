import type { PerformanceAdvisorSlot } from '../types';

/** Santa Maria Ford/Lincoln — dispatch tech roster (DealerBuilt DMS tech # → name). */
export const FORD_DISPATCH_TECH_ROSTER: PerformanceAdvisorSlot[] = [
  { id: '8508', label: 'Nathan Aguilar' },
  { id: '7178', label: 'Tim Borjas' },
  { id: '8478', label: 'Remi Carodine' },
  { id: '8444', label: 'Alexis Casillas' },
  { id: '8384', label: 'Uciel Lopez' },
  { id: '7670', label: 'Armando Gomez' },
  { id: '8490', label: 'Jose Grimaldo' },
  { id: '8498', label: 'Roland Heridia' },
  { id: '8402', label: 'Jaime Hernandez' },
  { id: '8408', label: 'Fernie Legaspi' },
  { id: '8339', label: 'Daniel Lopez' },
  { id: '8304', label: 'Carl Lozano' },
  { id: '7149', label: 'Todd Moro' },
  { id: '7674', label: 'Chris Owens' },
  { id: '8461', label: 'Juan Reyes' },
  { id: '8509', label: 'Justin Sights' },
  { id: '8468', label: 'Joseph Valdez' },
  { id: '8500', label: 'Travis Wheelock' },
  { id: '8485', label: 'Charles Villaros' },
  { id: '8519', label: 'Devin' },
];

/** Hyundai Santa Maria — dispatch tech roster (PBS; separate from Ford DMS list). */
export const HYUNDAI_DISPATCH_TECH_ROSTER: PerformanceAdvisorSlot[] = [
  { id: 'daniel', label: 'Daniel' },
  { id: 'jon', label: 'Jon' },
  { id: 'matthew', label: 'Matthew' },
  { id: 'jacinto', label: 'Jacinto' },
  { id: 'ethan', label: 'Ethan' },
  { id: 'trevor', label: 'Trevor' },
];

const FORD_DMS_TECH_IDS = new Set(FORD_DISPATCH_TECH_ROSTER.map((row) => row.id));
const HYUNDAI_TECH_IDS = new Set(HYUNDAI_DISPATCH_TECH_ROSTER.map((row) => row.id));

const DEALERSHIP_DISPATCH_ROSTERS: Record<string, PerformanceAdvisorSlot[]> = {
  ford: FORD_DISPATCH_TECH_ROSTER,
  hyundai: HYUNDAI_DISPATCH_TECH_ROSTER,
};

function normalizeTechId(techId: string): string {
  const trimmed = techId.trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits || trimmed;
}

/** True when a saved roster contains any Ford DealerBuilt DMS tech #. */
export function rosterIncludesFordDmsTech(roster: PerformanceAdvisorSlot[]): boolean {
  return roster.some((row) => FORD_DMS_TECH_IDS.has(normalizeTechId(row.id)));
}

/** True when a saved roster contains Hyundai PBS tech ids. */
export function rosterIncludesHyundaiTech(roster: PerformanceAdvisorSlot[]): boolean {
  return roster.some((row) => HYUNDAI_TECH_IDS.has(row.id.trim().toLowerCase()));
}

export function defaultDispatchTechRoster(dealershipId: string): PerformanceAdvisorSlot[] {
  return DEALERSHIP_DISPATCH_ROSTERS[dealershipId] ?? [];
}

/** Canonical dispatch roster for a store — never mixes Ford/Hyundai lists. */
export function dispatchTechRosterForDealership(dealershipId: string): PerformanceAdvisorSlot[] {
  return defaultDispatchTechRoster(dealershipId);
}
