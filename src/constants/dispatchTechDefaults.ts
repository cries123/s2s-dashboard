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

export function defaultDispatchTechRoster(dealershipId: string): PerformanceAdvisorSlot[] {
  if (dealershipId === 'ford') return FORD_DISPATCH_TECH_ROSTER;
  if (dealershipId === 'hyundai') return HYUNDAI_DISPATCH_TECH_ROSTER;
  return [];
}

export function isFordDispatchTechRoster(roster: PerformanceAdvisorSlot[]): boolean {
  if (roster.length !== FORD_DISPATCH_TECH_ROSTER.length) return false;
  return roster.every(
    (row, index) =>
      row.id === FORD_DISPATCH_TECH_ROSTER[index].id &&
      row.label === FORD_DISPATCH_TECH_ROSTER[index].label
  );
}
