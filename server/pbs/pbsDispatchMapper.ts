import { pbsIsoToDateString, repairOrderSoNumber, vinLast8FromVin } from './pbsMappers.js';
import type { DepartmentColumnId, DispatchStatus } from '../../src/types.js';
import type { PbsCustomerIndexMaps, PbsOpenRepairOrder } from './pbsExtendedTypes.js';
import { isOpenPbsRepairOrder } from './pbsTechnicianAggregator.js';
import { normalizePbsRef } from './pbsAppointmentSchedule.js';

export function mapPbsDispatchStatus(status?: string, customStatus?: string): DispatchStatus {
  const combined = `${status || ''} ${customStatus || ''}`.toLowerCase();
  if (combined.includes('poo') || (combined.includes('part') && combined.includes('order'))) return 'POO';
  if (
    combined.includes('wfa') ||
    combined.includes('auth') ||
    combined.includes('approval') ||
    combined.includes('waiting')
  ) {
    return 'WFA';
  }
  return 'WIP';
}

export function mapPbsDepartment(skill?: string, shop?: string): DepartmentColumnId {
  const text = `${skill || ''} ${shop || ''}`.toLowerCase();
  if (text.includes('lube') || text.includes('express')) return 'lube';
  if (text.includes('quick')) return 'quick_service';
  if (text.includes('a/c') || text.includes('ac ') || text.includes('electrical')) return 'ac_electrical';
  if (text.includes('drive')) return 'drivability';
  if (text.includes('heavy')) return 'heavyline';
  if (text.includes('diesel')) return 'diesel';
  if (text.includes('trans')) return 'trans';
  return 'unassigned';
}

function pickPrimaryTech(ro: PbsOpenRepairOrder): string {
  for (const req of ro.Requests || []) {
    const tech = (req.Tech || '').trim();
    if (tech) return tech;
    for (const line of req.LabourLines || []) {
      const lineTech = (line.Tech || '').trim();
      if (lineTech) return lineTech;
    }
  }
  return '';
}

function pickPrimarySkill(ro: PbsOpenRepairOrder): string {
  for (const req of ro.Requests || []) {
    const skill = (req.Skill || '').trim();
    if (skill) return skill;
  }
  return '';
}

function pickConcern(ro: PbsOpenRepairOrder): string | undefined {
  const parts = (ro.Requests || [])
    .map((req) => req.RequestDescription?.trim())
    .filter(Boolean) as string[];
  if (!parts.length) return undefined;
  return parts.join('; ').slice(0, 500);
}

function resolveCustomerFromIndex(
  index: PbsCustomerIndexMaps,
  ro: PbsOpenRepairOrder
): { customerId?: string; customer?: Record<string, unknown> } {
  const contactRef = normalizePbsRef(ro.ContactRef);
  if (contactRef) {
    const id = index.byContactRef.get(contactRef);
    if (id) return { customerId: id, customer: index.dataById.get(id) };
  }
  const vehicleRef = normalizePbsRef(ro.VehicleRef);
  if (vehicleRef) {
    const id = index.byVehicleRef.get(vehicleRef);
    if (id) return { customerId: id, customer: index.dataById.get(id) };
  }
  return {};
}

export function mapPbsOpenRepairOrderToDispatch(
  ro: PbsOpenRepairOrder,
  dealershipId: string,
  syncedAt: string,
  index: PbsCustomerIndexMaps
): Record<string, unknown> | null {
  if (!isOpenPbsRepairOrder(ro)) return null;

  const repairOrderId = (ro.RepairOrderId || '').trim();
  const roNumber = repairOrderSoNumber(ro);
  if (!repairOrderId || !roNumber) return null;

  const { customerId, customer } = resolveCustomerFromIndex(index, ro);
  const techNumber = pickPrimaryTech(ro) || '0';
  const department = mapPbsDepartment(pickPrimarySkill(ro), ro.Shop);
  const dateCreated = pbsIsoToDateString(ro.DateOpened) || syncedAt.slice(0, 10);
  const promiseIso = ro.DatePromisedUTC || ro.DatePromised;
  const promiseTimeAt =
    promiseIso && !promiseIso.startsWith('0001-01-01') ? promiseIso : undefined;

  const firstName = customer ? String(customer.firstName || '').trim() : '';
  const lastName = customer ? String(customer.lastName || '').trim() : '';
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
  const vin = customer ? String(customer.vin || '') : '';
  const vinLastEight = customer
    ? String(customer.vinLast8 || vinLast8FromVin(vin))
    : undefined;

  const transportation = (ro.Transportation || '').toLowerCase();
  const isWaiting = transportation.includes('wait');

  const accountName = customerName;
  const isInternal =
    accountName?.toLowerCase().includes('hyundai of santa maria') ||
    lastName.toLowerCase().includes('hyundai of santa maria');

  return {
    roNumber,
    techNumber,
    department,
    currentLaneId: department,
    lifecycleStatus: 'active',
    status: mapPbsDispatchStatus(ro.Status, ro.CustomStatus),
    isCompleted: false,
    dateCreated,
    lastUpdated: syncedAt,
    dealershipId,
    customerId,
    customerLastName: lastName || undefined,
    customerName,
    phoneNumber: customer ? String(customer.phone || ro.TodayPhoneNumber || '').trim() || undefined : ro.TodayPhoneNumber?.trim() || undefined,
    accountName,
    isInternal: isInternal || undefined,
    tagNumber: ro.Tag?.trim() || undefined,
    year: customer ? String(customer.year || '').trim() || undefined : undefined,
    model: customer ? String(customer.model || '').trim() || undefined : undefined,
    vinLastEight: vinLastEight || undefined,
    departmentName: ro.Shop?.trim() || undefined,
    isWaiting: isWaiting || undefined,
    promiseTimeAt,
    concern: pickConcern(ro),
    source: 'pbs-sync',
    pbsRepairOrderId: repairOrderId,
    pbsSyncedAt: syncedAt,
  };
}
