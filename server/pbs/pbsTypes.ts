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
  RequestCode?: string;
  RequestDescription?: string;
  Cause?: string;
  Correction?: string;
  Tech?: string;
  Status?: string;
  LabourLines?: Array<{
    OpCode?: string;
    OpDescription?: string;
    SoldHours?: number;
    ActualHours?: number;
    Tech?: string;
    Price?: number;
  }>;
  PartLines?: Array<{
    PartNumber?: string;
    PartDescription?: string;
    Shipped?: number;
    Requested?: number;
    ExtendedPrice?: number;
  }>;
}

export interface PbsRepairOrder {
  RepairOrderId?: string;
  RepairOrderNumber?: number | string;
  RawRepairOrderNumber?: string;
  DateCashiered?: string;
  DateOpened?: string;
  LastUpdate?: string;
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
  CSR?: string;
  CSRRef?: string;
  Tech?: string;
  TechRef?: string;
  Skill?: string;
  AllowedHours?: number;
  RequestCode?: string;
}

export interface PbsAppointment {
  AppointmentId?: string;
  Id?: string;
  AppointmentNumber?: number | string;
  RawAppointmentNumber?: string;
  AppointmentTime?: string;
  AppointmentTimeUTC?: string;
  PickupTime?: string;
  PickupTimeUTC?: string;
  Status?: string;
  ContactRef?: string;
  VehicleRef?: string;
  MileageIn?: number;
  Advisor?: string;
  AdvisorRef?: string;
  IsWaiter?: boolean;
  Notes?: string;
  RequestLines?: PbsAppointmentRequestLine[];
}

export interface PbsAppointmentContactVehicleInfo {
  AppointmentId?: string;
  AppointmentNumber?: number;
  AppointmentIsWaiter?: boolean;
  AppointmentTime?: string;
  AppointmentPickupTime?: string;
  AppointmentStatus?: string;
  ContactId?: string;
  ContactFirstName?: string;
  ContactLastName?: string;
  VehicleId?: string;
  VehicleYear?: string;
  VehicleMake?: string;
  VehicleModel?: string;
  VehicleTrim?: string;
}

export interface PbsSyncCounts {
  customersCreated: number;
  customersUpdated: number;
  ownerChanges: number;
  visitsMerged: number;
  visitsLogged: number;
  appointmentDaysUpdated: number;
  appointmentsProcessed: number;
  appointmentScheduleDays: number;
  appointmentScheduleSlots: number;
  appointmentScheduleError?: string;
  performanceAdvisors: number;
  performanceRepairOrders: number;
  performancePartsInvoices: number;
  performanceSyncError?: string;
  performanceSyncWarning?: string;
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
  incrementalSince?: string;
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
  /** Watermark for incremental Pull changes — only advances on successful sync. */
  lastSuccessfulSyncAt?: string;
  lastSyncOk: boolean;
  lastError?: string;
  counts?: PbsSyncCounts;
  fetched?: PbsSyncFetched;
  triggeredBy?: 'cron' | 'manual';
  triggeredByEmail?: string;
  triggeredByUsername?: string;
  summary?: string;
  syncInProgress?: boolean;
  syncStartedAt?: string;
}

export interface PbsSyncStartResult {
  accepted: boolean;
  inProgress?: boolean;
  startedAt?: string;
  message: string;
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
