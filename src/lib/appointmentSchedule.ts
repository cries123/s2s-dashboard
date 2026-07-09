import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../types';

export function appointmentScheduleDocId(dealershipId: string, date: string): string {
  return `${dealershipId || 'hyundai'}_${date}`;
}

export const SCHEDULE_GRID_START_MINUTES = 7 * 60;
export const SCHEDULE_GRID_END_MINUTES = 18 * 60;
export const SCHEDULE_PIXELS_PER_HOUR = 52;

export function formatScheduleTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12}${period.toLowerCase()}` : `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function scheduleHourLabels(): { minutes: number; label: string }[] {
  const labels: { minutes: number; label: string }[] = [];
  for (let m = SCHEDULE_GRID_START_MINUTES; m < SCHEDULE_GRID_END_MINUTES; m += 60) {
    labels.push({ minutes: m, label: formatScheduleTime(m) });
  }
  return labels;
}

export interface ScheduleTechColumn {
  id: string;
  label: string;
  count: number;
}

export function buildScheduleTechColumns(
  appointments: ScheduledAppointmentSlot[],
  techRoster: PerformanceAdvisorSlot[] = []
): ScheduleTechColumn[] {
  const counts = new Map<string, number>();

  for (const appt of appointments) {
    const key = appt.techNumber?.trim() || '__unassigned__';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const rosterById = new Map(
    techRoster.map((row) => [row.id.trim().toLowerCase(), row.label])
  );

  const techIds = [...counts.keys()].filter((k) => k !== '__unassigned__');
  techIds.sort((a, b) => {
    const aNum = Number(a.replace(/\D/g, ''));
    const bNum = Number(b.replace(/\D/g, ''));
    if (aNum && bNum) return aNum - bNum;
    return a.localeCompare(b);
  });

  const columns: ScheduleTechColumn[] = [];

  if (counts.has('__unassigned__')) {
    columns.push({
      id: '',
      label: 'Unassigned',
      count: counts.get('__unassigned__') || 0,
    });
  }

  for (const id of techIds) {
    const rosterLabel = rosterById.get(id.toLowerCase());
    columns.push({
      id,
      label: rosterLabel || id,
      count: counts.get(id) || 0,
    });
  }

  return columns;
}

export function categoryScheduleColor(category: ScheduledAppointmentSlot['category']): string {
  switch (category) {
    case 'oilChange':
      return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-100';
    case 'recall':
      return 'bg-amber-500/20 border-amber-500/40 text-amber-100';
    case 'diagnosis':
      return 'bg-cyan-500/20 border-cyan-500/40 text-cyan-100';
    default:
      return 'bg-slate-500/20 border-slate-400/30 text-slate-100';
  }
}
