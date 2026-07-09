/** Minimal PBS PartnerHUB shapes used by sync mappers. */

export interface PbsContactVehicle {
  ContactId?: string;
  ContactFirstName?: string;
  ContactLastName?: string;
  ContactMiddleName?: string;
  ContactAddress?: string;
  ContactCity?: string;
  ContactState?: string;
  ContactZipCode?: string;
  ContactBusinessPhone?: string;
  ContactHomePhone?: string;
  ContactCellPhone?: string;
  ContactEmailAddress?: string;
  ContactNotes?: string;
  VehicleId?: string;
  VehicleVIN?: string;
  VehicleMake?: string;
  VehicleModel?: string;
  VehicleYear?: string;
  VehicleOdometer?: number;
  VehicleLastServiceDate?: string;
  VehicleLastServiceMileage?: number;
  VehicleLastSaleDate?: string;
  VehicleLastUpdate?: string;
  ContactLastUpdate?: string;
}

export interface PbsRepairOrderRequest {
  RequestDescription?: string;
}

export interface PbsRepairOrder {
  RepairOrderId?: string;
  RepairOrderNumber?: number | string;
  RawRepairOrderNumber?: string;
  DateCashiered?: string;
  DateOpened?: string;
  CSR?: string;
  ContactRef?: string;
  VehicleRef?: string;
  MileageIn?: number;
  MileageOut?: number;
  Status?: string;
  Requests?: PbsRepairOrderRequest[];
}

export interface PbsAppointmentRequestLine {
  RequestDescription?: string;
}

export interface PbsAppointment {
  AppointmentId?: string;
  AppointmentTime?: string;
  AppointmentTimeUTC?: string;
  Status?: string;
  ContactRef?: string;
  VehicleRef?: string;
  MileageIn?: number;
  RequestLines?: PbsAppointmentRequestLine[];
}

export interface PbsSyncCounts {
  customersCreated: number;
  customersUpdated: number;
  ownerChanges: number;
  visitsMerged: number;
  appointmentDaysUpdated: number;
  appointmentsProcessed: number;
  performanceAdvisors: number;
  performanceRepairOrders: number;
  performancePartsInvoices: number;
  performanceSyncError?: string;
  technicianReports: number;
  timeClockActivities: number;
  technicianSyncError?: string;
  workplanRemindersFetched: number;
  serviceRemindersUpdated: number;
  inventoryLots: number;
  inventoryVehiclesFetched: number;
  inventoryVehiclesWritten: number;
  openRepairOrdersFetched: number;
  dispatchOrdersUpserted: number;
  dispatchOrdersCompleted: number;
  extendedSyncError?: string;
}

export interface PbsSyncFetched {
  contactVehicles: number;
  repairOrders: number;
  appointments: number;
  appointmentMonthStart: string;
  appointmentMonthEnd: string;
  performanceMonthStart?: string;
  performanceMonthEnd?: string;
  performanceRepairOrders?: number;
  performancePartsInvoices?: number;
  timeClockActivities?: number;
  workplanReminders?: number;
  inventoryVehicles?: number;
  openRepairOrders?: number;
}

export interface PbsSyncLogEntry {
  id: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  triggeredBy: 'cron' | 'manual';
  triggeredByEmail?: string;
  triggeredByUsername?: string;
  fullRefresh?: boolean;
  fetched: PbsSyncFetched;
  counts: PbsSyncCounts;
  error?: string;
  summary: string;
}

export interface PbsSyncState {
  lastSyncAt: string;
  lastSyncOk: boolean;
  lastError?: string;
  counts?: PbsSyncCounts;
  fetched?: PbsSyncFetched;
  triggeredBy?: 'cron' | 'manual';
  triggeredByEmail?: string;
  triggeredByUsername?: string;
  summary?: string;
}

export interface PbsSyncResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  counts: PbsSyncCounts;
  fetched: PbsSyncFetched;
  summary: string;
  error?: string;
  logId?: string;
}
