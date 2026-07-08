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
  visitsMerged: number;
  appointmentDaysUpdated: number;
  appointmentsProcessed: number;
}

export interface PbsSyncState {
  lastSyncAt: string;
  lastSyncOk: boolean;
  lastError?: string;
  counts?: PbsSyncCounts;
  triggeredBy?: 'cron' | 'manual';
}

export interface PbsSyncResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  counts: PbsSyncCounts;
  error?: string;
}
