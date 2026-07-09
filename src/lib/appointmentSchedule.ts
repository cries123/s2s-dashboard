import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../types';

export function appointmentScheduleDocId(dealershipId: string, date: string): string {
  return `${dealershipId || 'hyundai'}_${date}`;
}

export const SCHEDULE_GRID_START_MINUTES = 7 * 60;
export const SCHEDULE_GRID_END_MINUTES = 18 * 60;
export const SCHEDULE_PIXELS_PER_HOUR = 56;
export const SCHEDULE_GRID_MIN_START_MINUTES = 6 * 60;
export const SCHEDULE_GRID_MAX_END_MINUTES = 19 * 60;

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
      36,
      (appt.durationMinutes / 60) * SCHEDULE_PIXELS_PER_HOUR - 4
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
