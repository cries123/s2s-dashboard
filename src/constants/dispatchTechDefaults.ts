import type { PerformanceAdvisorSlot } from '../types';

/** Hyundai Santa Maria — default dispatch tech roster (DMS tech # → name). */
export const HYUNDAI_DISPATCH_TECH_ROSTER: PerformanceAdvisorSlot[] = [
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

export function defaultDispatchTechRoster(dealershipId: string): PerformanceAdvisorSlot[] {
  if (dealershipId === 'hyundai') return HYUNDAI_DISPATCH_TECH_ROSTER;
  return [];
}
