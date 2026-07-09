/** PBS PartnerHUB shapes for technician, reminders, inventory, and dispatch sync. */

export interface PbsDateTimeOffset {
  DateTime?: string;
  OffsetMinutes?: number;
}

export interface PbsTimeClockActivity {
  TimeClockId?: number;
  UserRef?: string;
  ClockedInUTCOffset?: PbsDateTimeOffset | string;
  ClockedOutUTCOffset?: PbsDateTimeOffset | string;
  IsTech?: boolean;
}

export interface PbsEmployee {
  EmployeeId?: string;
  UserName?: string;
  DisplayName?: string;
  FirstName?: string;
  LastName?: string;
  TechnicianNumber?: string;
  FixedOpsEmployeeNumber?: string;
  Technician?: boolean;
  IsInactive?: boolean;
}

export interface PbsWorkplanReminder {
  ReminderId?: string;
  ContactRef?: string;
  DueDate?: string;
  CompletedDate?: string;
  Status?: string;
  Summary?: string;
  Details?: string;
}

export interface PbsLot {
  LotId?: string;
  Code?: string;
  Description?: string;
  Inactive?: boolean;
}

export interface PbsInventoryVehicle {
  VehicleId?: string;
  VIN?: string;
  ShortVIN?: string;
  StockNumber?: string;
  Status?: string;
  Lot?: string;
  LotDescription?: string;
  LotRef?: string;
  Make?: string;
  Model?: string;
  Year?: string;
  Odometer?: number;
  ListedPrice?: number;
  Inventory?: number;
  IsInactive?: boolean;
  OwnerRef?: string;
  LastUpdate?: string;
}

export interface PbsOpenRepairOrderRequest {
  RequestDescription?: string;
  Tech?: string;
  Skill?: string;
  Status?: string;
  LabourLines?: Array<{ Tech?: string; SoldHours?: number }>;
}

export interface PbsOpenRepairOrder {
  RepairOrderId?: string;
  RepairOrderNumber?: number | string;
  RawRepairOrderNumber?: string;
  DateOpened?: string;
  DateCashiered?: string;
  DatePromised?: string;
  DatePromisedUTC?: string;
  CSR?: string;
  ContactRef?: string;
  VehicleRef?: string;
  Status?: string;
  CustomStatus?: string;
  Shop?: string;
  Tag?: string;
  Transportation?: string;
  TodayPhoneNumber?: string;
  Requests?: PbsOpenRepairOrderRequest[];
}

export interface PbsTechnicianRow {
  techName: string;
  clockedHours: number;
  flaggedHours: number;
  efficiency: number;
}

export interface PbsCustomerIndexMaps {
  byContactRef: Map<string, string>;
  byVehicleRef: Map<string, string>;
  dataById: Map<string, Record<string, unknown>>;
}
