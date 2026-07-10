import { pbsIsoToDateString, repairOrderSoNumber } from './pbsMappers.js';
import type {
  PbsDateTimeOffset,
  PbsEmployee,
  PbsOpenRepairOrder,
  PbsTechnicianRow,
  PbsTimeClockActivity,
} from './pbsExtendedTypes.js';
import type { PbsRepairOrderFull, PbsRepairOrderRequestFull } from './pbsPerformanceTypes.js';

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize PBS tech numbers / employee refs for map keys (e.g. "070" → "70"). */
export function normalizeTechKey(key: string): string {
  const trimmed = key.trim().toLowerCase();
  const digits = trimmed.replace(/\D/g, '');
  return digits || trimmed;
}

export function pbsDateTimeOffsetToMs(value?: PbsDateTimeOffset | string): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    if (!value || value.startsWith('0001-01-01')) return null;
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  const dt = value.DateTime;
  if (!dt || dt.startsWith('0001-01-01')) return null;
  const t = Date.parse(dt);
  return Number.isNaN(t) ? null : t;
}

export function pbsClockActivityHours(activity: PbsTimeClockActivity): number {
  const start = pbsDateTimeOffsetToMs(activity.ClockedInUTCOffset);
  const end = pbsDateTimeOffsetToMs(activity.ClockedOutUTCOffset);
  if (start === null || end === null || end <= start) return 0;
  return (end - start) / (1000 * 60 * 60);
}

export function employeeDisplayName(emp: PbsEmployee): string {
  const display = (emp.DisplayName || '').trim();
  if (display) return display;
  const first = (emp.FirstName || '').trim();
  const last = (emp.LastName || '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return (emp.UserName || '').trim() || 'Technician';
}

export function employeeTechKey(emp: PbsEmployee): string {
  const tech = (emp.TechnicianNumber || emp.FixedOpsEmployeeNumber || '').trim();
  if (tech) return normalizeTechKey(tech);
  const id = (emp.EmployeeId || '').trim();
  return id ? normalizeTechKey(id) : '';
}

function sumRequestFlaggedHours(req: PbsRepairOrderRequestFull): Map<string, number> {
  const byTech = new Map<string, number>();
  const requestTech = (req.Tech || '').trim();

  for (const line of req.LabourLines || []) {
    const tech = (line.Tech || requestTech || '').trim();
    if (!tech) continue;
    const hours = num(line.SoldHours);
    if (hours <= 0) continue;
    const key = normalizeTechKey(tech);
    byTech.set(key, (byTech.get(key) || 0) + hours);
  }

  if (byTech.size === 0 && requestTech) {
    const sold = (req.LabourLines || []).reduce((sum, line) => sum + num(line.SoldHours), 0);
    if (sold > 0) byTech.set(normalizeTechKey(requestTech), sold);
  }

  return byTech;
}

export function aggregateFlaggedHoursByTech(repairOrders: PbsRepairOrderFull[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const ro of repairOrders) {
    const status = (ro.Status || '').toLowerCase();
    if (status.includes('void') || status.includes('cancel')) continue;

    for (const req of ro.Requests || []) {
      const reqStatus = (req.Status || '').toLowerCase();
      if (reqStatus.includes('void') || reqStatus.includes('cancel')) continue;

      for (const [tech, hours] of sumRequestFlaggedHours(req)) {
        const key = normalizeTechKey(tech);
        if (!key) continue;
        totals.set(key, (totals.get(key) || 0) + hours);
      }
    }
  }

  return totals;
}

export function aggregateTechnicianPerformance(
  activities: PbsTimeClockActivity[],
  employees: PbsEmployee[],
  flaggedByTech: Map<string, number>,
  monthStart: string,
  monthEnd: string,
  techLabelByKey: Map<string, string> = new Map()
): { technicians: PbsTechnicianRow[]; reportStartDate: string; reportEndDate: string } {
  const employeeById = new Map<string, PbsEmployee>();
  const employeeByTechNumber = new Map<string, PbsEmployee>();

  for (const emp of employees) {
    if (emp.IsInactive) continue;
    const id = normalizeTechKey((emp.EmployeeId || '').trim());
    if (id) employeeById.set(id, emp);

    const techNum = employeeTechKey(emp);
    if (techNum) employeeByTechNumber.set(techNum, emp);
  }

  const clockedByTech = new Map<string, number>();

  for (const activity of activities) {
    if (activity.IsTech === false) continue;
    const hours = pbsClockActivityHours(activity);
    if (hours <= 0) continue;

    const userRef = normalizeTechKey((activity.UserRef || '').trim());
    const emp = userRef ? employeeById.get(userRef) : undefined;
    const techKey = emp ? employeeTechKey(emp) : userRef;
    if (!techKey) continue;

    clockedByTech.set(techKey, (clockedByTech.get(techKey) || 0) + hours);
  }

  const normalizedFlagged = new Map<string, number>();
  for (const [tech, hours] of flaggedByTech) {
    const key = normalizeTechKey(tech);
    if (!key) continue;
    normalizedFlagged.set(key, (normalizedFlagged.get(key) || 0) + hours);
  }

  const techKeys = new Set<string>([...clockedByTech.keys(), ...normalizedFlagged.keys()]);

  const technicians: PbsTechnicianRow[] = [];

  for (const key of techKeys) {
    const emp = employeeByTechNumber.get(key) || employeeById.get(key);
    const rosterLabel = techLabelByKey.get(key);
    const techName = emp ? employeeDisplayName(emp) : rosterLabel || key;
    const clockedHours = Math.round((clockedByTech.get(key) || 0) * 100) / 100;
    const flaggedHours = Math.round((normalizedFlagged.get(key) || 0) * 100) / 100;
    const efficiency =
      clockedHours > 0 ? Math.round((flaggedHours / clockedHours) * 100) : flaggedHours > 0 ? 100 : 0;

    if (clockedHours <= 0 && flaggedHours <= 0) continue;

    technicians.push({ techName, clockedHours, flaggedHours, efficiency });
  }

  technicians.sort((a, b) => b.flaggedHours - a.flaggedHours || a.techName.localeCompare(b.techName));

  return {
    technicians,
    reportStartDate: monthStart,
    reportEndDate: monthEnd,
  };
}

export function isOpenPbsRepairOrder(ro: PbsOpenRepairOrder): boolean {
  const status = (ro.Status || '').toLowerCase();
  if (status.includes('void') || status.includes('cancel')) return false;
  const cash = ro.DateCashiered;
  if (cash && !cash.startsWith('0001-01-01')) return false;
  return Boolean(repairOrderSoNumber(ro));
}

export function isActivePbsWorkplanReminder(reminder: { CompletedDate?: string; Status?: string }): boolean {
  const completed = reminder.CompletedDate;
  if (completed && !completed.startsWith('0001-01-01')) return false;
  const status = (reminder.Status || '').toLowerCase();
  if (status.includes('complete') || status.includes('done') || status.includes('cancel')) return false;
  return true;
}

export function mapPbsReminderDueDate(dueDate?: string): string | null {
  return pbsIsoToDateString(dueDate);
}

export function isInventoryPbsVehicle(vehicle: {
  Status?: string;
  Inventory?: number;
  IsInactive?: boolean;
}): boolean {
  if (vehicle.IsInactive) return false;
  const status = (vehicle.Status || '').toLowerCase();
  if (status.includes('sold') || status.includes('delivered') || status.includes('inactive')) return false;
  if (typeof vehicle.Inventory === 'number' && vehicle.Inventory > 0) return true;
  return (
    status.includes('stock') ||
    status.includes('inventory') ||
    status.includes('available') ||
    status.includes('lot')
  );
}
