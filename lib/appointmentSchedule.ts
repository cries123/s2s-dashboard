import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../types';

export function appointmentScheduleDocId(dealershipId: string, date: string): string {
  return `${dealershipId || 'hyundai'}_${date}`;
}

export const SCHEDULE_GRID_START_MINUTES = 7 * 60;
export const SCHEDULE_GRID_END_MINUTES = 17 * 60;
export const SCHEDULE_LUNCH_START_MINUTES = 12 * 60;
export const SCHEDULE_LUNCH_END_MINUTES = 13 * 60;
export const SCHEDULE_PIXELS_PER_HOUR = 68;
export const SCHEDULE_GRID_MIN_START_MINUTES = 6 * 60;
export const SCHEDULE_GRID_MAX_END_MINUTES = 18 * 60;

export interface ScheduleGridBounds {
  startMinutes: number;
  endMinutes: number;
  heightPx: number;
}

export function resolveScheduleGridBounds(
  appointments: ScheduledAppointmentSlot[]
): ScheduleGridBounds {
  let startMinutes = SCHEDULE_GRID_START_MINUTES;
  let endMinutes = SCHEDULE_GRID_END_MINUTES;

  for (const appt of appointments) {
    const end = appt.startMinutes + Math.max(appt.durationMinutes, 30);
    startMinutes = Math.min(startMinutes, appt.startMinutes);
    endMinutes = Math.max(endMinutes, end);
  }

  startMinutes = Math.floor(startMinutes / 60) * 60;
  endMinutes = Math.ceil(endMinutes / 60) * 60;
  startMinutes = Math.max(
    SCHEDULE_GRID_MIN_START_MINUTES,
    Math.min(startMinutes, SCHEDULE_GRID_START_MINUTES)
  );
  if (appointments.some((appt) => appt.startMinutes < startMinutes)) {
    startMinutes = Math.floor(
      Math.min(...appointments.map((appt) => appt.startMinutes)) / 60
    ) * 60;
    startMinutes = Math.max(SCHEDULE_GRID_MIN_START_MINUTES, startMinutes);
  }
  endMinutes = Math.min(
    SCHEDULE_GRID_MAX_END_MINUTES,
    Math.max(endMinutes, SCHEDULE_GRID_END_MINUTES)
  );

  const heightPx = ((endMinutes - startMinutes) / 60) * SCHEDULE_PIXELS_PER_HOUR;
  return { startMinutes, endMinutes, heightPx };
}

export function minutesToSchedulePx(minutes: number, gridStartMinutes: number): number {
  return ((minutes - gridStartMinutes) / 60) * SCHEDULE_PIXELS_PER_HOUR;
}

export function scheduleLunchBand(gridStartMinutes: number): { top: number; height: number } | null {
  if (
    SCHEDULE_LUNCH_END_MINUTES <= gridStartMinutes ||
    SCHEDULE_LUNCH_START_MINUTES >= SCHEDULE_GRID_MAX_END_MINUTES
  ) {
    return null;
  }
  const top = minutesToSchedulePx(
    Math.max(SCHEDULE_LUNCH_START_MINUTES, gridStartMinutes),
    gridStartMinutes
  );
  const endPx = minutesToSchedulePx(SCHEDULE_LUNCH_END_MINUTES, gridStartMinutes);
  return { top, height: Math.max(0, endPx - top) };
}

export interface PositionedScheduleSlot extends ScheduledAppointmentSlot {
  top: number;
  height: number;
  lane: number;
  laneCount: number;
}

/** Place appointments in non-overlapping lanes within a technician column. */
export function layoutColumnAppointments(
  appointments: ScheduledAppointmentSlot[],
  columnId: string,
  gridStartMinutes: number
): PositionedScheduleSlot[] {
  const columnAppts = appointments
    .filter((appt) => (appt.techNumber || '').trim() === columnId)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.appointmentNumber.localeCompare(b.appointmentNumber));

  const positioned: PositionedScheduleSlot[] = columnAppts.map((appt) => {
    const top = ((appt.startMinutes - gridStartMinutes) / 60) * SCHEDULE_PIXELS_PER_HOUR;
    const height = Math.max(
      32,
      (appt.durationMinutes / 60) * SCHEDULE_PIXELS_PER_HOUR - 3
    );
    return {
      ...appt,
      top: Math.max(0, top),
      height,
      lane: 0,
      laneCount: 1,
    };
  });

  const lanes: PositionedScheduleSlot[][] = [];

  for (const appt of positioned) {
    let placed = false;
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
      const overlaps = lanes[laneIndex].some(
        (other) =>
          appt.top < other.top + other.height - 2 && appt.top + appt.height > other.top + 2
      );
      if (!overlaps) {
        appt.lane = laneIndex;
        lanes[laneIndex].push(appt);
        placed = true;
        break;
      }
    }
    if (!placed) {
      appt.lane = lanes.length;
      lanes.push([appt]);
    }
  }

  const laneCount = Math.max(1, lanes.length);
  for (const appt of positioned) {
    appt.laneCount = laneCount;
  }

  return positioned;
}

export function scheduleHourLabelsForRange(
  startMinutes: number,
  endMinutes: number
): { minutes: number; label: string }[] {
  const labels: { minutes: number; label: string }[] = [];
  for (let m = startMinutes; m < endMinutes; m += 60) {
    labels.push({ minutes: m, label: formatScheduleTime(m) });
  }
  return labels;
}

export function formatScheduleTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const periodPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = periodPm ? 'PM' : 'AM';
  if (minute === 0) {
    return `${hour12} ${suffix}`;
  }
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** Compact time for appointment card headers — e.g. "8:45 AM". */
export function formatScheduleTimeDetail(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
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
      label: 'Open',
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

export const SCHEDULE_HOURS_PER_TECH_PER_DAY = 8;

export type ScheduleCapacityStatus = 'light' | 'good' | 'near-capacity';

export interface ScheduleCapacitySummary {
  /** Distinct techs with at least one appointment today — a live proxy for "on the schedule". */
  techCount: number;
  capacityMinutes: number;
  /** Includes unassigned/open appointments — real demand even before a tech is picked. */
  scheduledMinutes: number;
  utilizationPercent: number;
  status: ScheduleCapacityStatus;
}

/**
 * Operational capacity for a day: techs on the schedule × 8h vs. total
 * scheduled minutes. techCount comes from appointments themselves (same
 * source as the tech columns on the board) rather than a separate roster
 * size, so it reflects who actually has work today.
 */
export function computeScheduleCapacity(
  appointments: ScheduledAppointmentSlot[],
  techRoster: PerformanceAdvisorSlot[] = []
): ScheduleCapacitySummary {
  const columns = buildScheduleTechColumns(appointments, techRoster);
  const techCount = columns.filter((column) => column.id).length;
  const capacityMinutes = techCount * SCHEDULE_HOURS_PER_TECH_PER_DAY * 60;
  const scheduledMinutes = appointments.reduce(
    (sum, appt) => sum + Math.max(0, appt.durationMinutes || 0),
    0
  );
  const utilizationPercent =
    capacityMinutes > 0 ? Math.round((scheduledMinutes / capacityMinutes) * 100) : 0;

  let status: ScheduleCapacityStatus = 'good';
  if (capacityMinutes === 0 || utilizationPercent < 60) {
    status = 'light';
  } else if (utilizationPercent > 95) {
    status = 'near-capacity';
  }

  return { techCount, capacityMinutes, scheduledMinutes, utilizationPercent, status };
}

export const CAPACITY_STATUS_STYLES: Record<
  ScheduleCapacityStatus,
  { label: string; chip: string; fill: string; track: string }
> = {
  light: {
    label: 'Light day',
    chip: 'bg-amber-500/15 text-amber-500',
    fill: 'bg-amber-500',
    track: 'bg-amber-500/15',
  },
  good: {
    label: 'Well booked',
    chip: 'bg-brand-primary/15 text-brand-primary',
    fill: 'bg-brand-primary',
    track: 'bg-brand-primary/15',
  },
  'near-capacity': {
    label: 'At capacity',
    chip: 'bg-rose-500/15 text-rose-500',
    fill: 'bg-rose-500',
    track: 'bg-rose-500/15',
  },
};

/** e.g. 645 -> "10h 45m", 480 -> "8h", 45 -> "45m". */
export function formatScheduleDurationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function categoryScheduleColor(category: ScheduledAppointmentSlot['category']): string {
  return categoryScheduleCardClass(category);
}

/** Solid PBS-style appointment block colors. */
export function categoryScheduleCardClass(category: ScheduledAppointmentSlot['category']): string {
  switch (category) {
    case 'oilChange':
      return 'bg-emerald-600 border-emerald-800 text-white shadow-sm shadow-emerald-950/40';
    case 'recall':
      return 'bg-amber-700 border-amber-900 text-amber-50 shadow-sm shadow-amber-950/40';
    case 'diagnosis':
      return 'bg-sky-600 border-sky-800 text-white shadow-sm shadow-sky-950/40';
    default:
      return 'bg-slate-600 border-slate-800 text-slate-100 shadow-sm shadow-slate-950/40';
  }
}

export function categoryScheduleLegendClass(category: ScheduledAppointmentSlot['category']): string {
  switch (category) {
    case 'oilChange':
      return 'bg-emerald-500';
    case 'recall':
      return 'bg-amber-600';
    case 'diagnosis':
      return 'bg-sky-500';
    default:
      return 'bg-slate-500';
  }
}
