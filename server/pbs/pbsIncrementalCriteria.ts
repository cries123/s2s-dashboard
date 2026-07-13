import { parsePbsIso } from './pbsMappers.js';
import type { PbsAppointment, PbsRepairOrder, PbsSyncState } from './pbsTypes.js';

const PACIFIC_TZ = 'America/Los_Angeles';
/** Small overlap so records touched at the boundary are not missed. */
const WATERMARK_OVERLAP_MS = 2 * 60 * 1000;

function pacificOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-8';
  const match = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return -480;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

/** PBS PartnerHUB criteria timestamps (Pacific offset, 7-digit fractional seconds). */
export function toPbsPacificCriteriaIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const ymd = date.toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ });
  const time = date.toLocaleTimeString('en-GB', {
    timeZone: PACIFIC_TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  const offsetMinutes = pacificOffsetMinutes(date);
  const sign = offsetMinutes <= 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${ymd}T${time}.${ms}0000${sign}${oh}:${om}`;
}

export function pbsWatermarkWithOverlap(iso: string, overlapMs = WATERMARK_OVERLAP_MS): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t - overlapMs).toISOString();
}

/**
 * Incremental watermark = last successful pull time.
 * Full refresh ignores the watermark. A failed prior sync does not force a full rebuild.
 */
export function resolveIncrementalWatermark(
  priorState: PbsSyncState | null | undefined,
  fullRefresh: boolean
): string | undefined {
  if (fullRefresh) return undefined;
  const base =
    priorState?.lastSuccessfulSyncAt ||
    (priorState?.lastSyncOk ? priorState.lastSyncAt : undefined);
  if (!base) return undefined;
  return pbsWatermarkWithOverlap(base);
}

export function yearsAgoPacificCriteria(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return toPbsPacificCriteriaIso(d.toISOString());
}

export function repairOrderKey(ro: PbsRepairOrder): string {
  return String(
    ro.RepairOrderId || ro.RawRepairOrderNumber || ro.RepairOrderNumber || ''
  ).trim();
}

export function dedupeRepairOrders(repairOrders: PbsRepairOrder[]): PbsRepairOrder[] {
  const merged = new Map<string, PbsRepairOrder>();
  for (const ro of repairOrders) {
    const key = repairOrderKey(ro);
    if (!key) continue;
    merged.set(key, ro);
  }
  return [...merged.values()];
}

export function appointmentKey(appt: PbsAppointment): string {
  return String(
    appt.AppointmentId || appt.Id || appt.RawAppointmentNumber || appt.AppointmentNumber || ''
  ).trim();
}

export function dedupeAppointments(appointments: PbsAppointment[]): PbsAppointment[] {
  const merged = new Map<string, PbsAppointment>();
  for (const appt of appointments) {
    const key = appointmentKey(appt);
    if (!key) continue;
    merged.set(key, appt);
  }
  return [...merged.values()];
}

export function repairOrderActivityMs(ro: PbsRepairOrder): number | null {
  const candidates = [ro.DateCashiered, ro.DateOpened, ro.LastUpdate];
  let latest: number | null = null;
  for (const iso of candidates) {
    const d = parsePbsIso(iso);
    if (!d) continue;
    const t = d.getTime();
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

/** True when the RO was touched since the incremental watermark. */
export function repairOrderChangedSince(ro: PbsRepairOrder, watermarkIso: string): boolean {
  const watermark = Date.parse(watermarkIso);
  if (Number.isNaN(watermark)) return true;
  const activity = repairOrderActivityMs(ro);
  return activity !== null && activity >= watermark;
}

/** Only log cashiered visits on incremental pulls (completed service visits). */
export function shouldLogRepairOrderVisit(ro: PbsRepairOrder, watermarkIso?: string): boolean {
  const cashiered = ro.DateCashiered;
  if (!cashiered || cashiered.startsWith('0001-01-01')) return false;
  if (!watermarkIso) return true;
  const cashieredAt = parsePbsIso(cashiered);
  const watermark = Date.parse(watermarkIso);
  if (!cashieredAt || Number.isNaN(watermark)) return true;
  return cashieredAt.getTime() >= watermark;
}
