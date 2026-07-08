import { Timestamp } from "firebase/firestore";

export type Role = 'admin' | 'Manager' | 'Salesperson' | 'Service Advisor' | 'Staff';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'admin' | 'manager' | 'advisor' | 'pending';
export type UserDepartment = 'sales' | 'service';

export type LandingTab =
  | 'service-drive'
  | 'appointments'
  | 'alerts'
  | 'search'
  | 'add'
  | 'dispatch'
  | 'forecast'
  | 'sales-performance'
  | 'pot-of-gold'
  | 'vin-search'
  | 'admin'
  | 'settings';

export type ServiceDriveFilter = 'all' | 'service_due' | 'stale_followup';
export type QueuePriorityProfile = 'balanced' | 'overdue_first' | 'never_contacted_first';
export type CrmDensity = 'compact' | 'standard';

export interface UserPreferences {
  serviceDrive: {
    openOnLogin: boolean;
    defaultLandingTab: LandingTab;
    defaultFilter: ServiceDriveFilter;
    queuePriority: QueuePriorityProfile;
  };
  contactWorkflow: {
    followUpDays: number;
    defaultOutcome: string;
    autoCheckAppointmentSet: boolean;
  };
  dashboardModules: {
    showWeatherWidget: boolean;
    showOperationsKpis: boolean;
    showOperationsProjections: boolean;
    showAdvisorPerformance: boolean;
    showTechEfficiency: boolean;
    showArchiveTools: boolean;
    showForecastTab: boolean;
    showSalesPerformanceTab: boolean;
    showVinSearchTab: boolean;
    showPotOfGoldTab: boolean;
  };
  crmDisplay: {
    density: CrmDensity;
    defaultLanguageFilter: string;
    alertsOnlyDefault: boolean;
  };
}

/** Applied to newly approved staff when no role template overrides. */
export interface StoreWorkspaceDefaults {
  followUpDays?: number;
  crmDensity?: CrmDensity;
  defaultLandingTab?: LandingTab;
  dashboardModules?: Partial<UserPreferences['dashboardModules']>;
}

export type StaffRoleTemplateId = 'service-advisor' | 'bdc' | 'sales';

export interface User {
  uid: string;
  email: string;
  username: string;
  role: Role | UserRole;
  jobTitle: string;
  status: UserStatus;
  dealershipId?: string;
  tenantId?: string;
  department?: UserDepartment;
  isManager?: boolean;
  approved?: boolean;
  preferences?: Partial<UserPreferences>;
  createdAt?: Timestamp;
}

export interface Dealership {
  id: string;
  name: string;
  code: string;
  createdAt: Timestamp;
}

export interface PerformanceAdvisorSlot {
  id: string;
  label: string;
}

export type DispatchProductionLaneId = Exclude<
  DepartmentColumnId,
  'unassigned'
>;

/** Live banner message shown to all logged-in users at a dealership. */
export interface DealershipAnnouncement {
  message: string;
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DealershipSettings {
  id: string;
  appointmentTarget: number;
  laborGrossTarget?: number;
  partsSalesTarget?: number;
  /** PBS Systems vs DealerBuilt report layouts */
  dmsProvider?: 'pbs' | 'dealerbuilt';
  /** Allowed service advisors for productivity imports (DealerBuilt) */
  performanceAdvisorRoster?: PerformanceAdvisorSlot[];
  /** Tech number → display name for dispatch board cards */
  dispatchTechRoster?: PerformanceAdvisorSlot[];
  enableDispatchTab?: boolean;
  /** Service bundle menu TV board in sidebar — defaults on for Hyundai only */
  enableBundleMenus?: boolean;
  enablePotOfGoldTab?: boolean;
  enableForecastTab?: boolean;
  enableSalesPerformanceTab?: boolean;
  enableVinSearchTab?: boolean;
  serviceAlertIntervalDays?: number;
  /** Extra days after due date before a customer appears in Service Alerts (0–60). */
  serviceAlertBufferDays?: number;
  enrollmentJoinCode?: string;
  weatherLat?: number;
  weatherLon?: number;
  weatherDisplayCity?: string;
  competitionAdvisors?: { id: string; label: string }[];
  competitionTechnicians?: { id: string; label: string }[];
  potOfGoldUpsellPrices?: { code: string; desc: string; defaultPrice: number }[];
  dispatchLaneCapacity?: Partial<Record<DispatchProductionLaneId, number>>;
  dispatchShowTodayLoad?: boolean;
  dispatchBlockWhenFull?: boolean;
  hiddenDispatchLanes?: DispatchProductionLaneId[];
  /** PST business date (YYYY-MM-DD) when lanes were last auto-swept at midnight. */
  lastDispatchOvernightSweepDate?: string;
  /** Optional banner for logged-in staff (syncs live via dealership settings). */
  announcement?: DealershipAnnouncement | null;
  /** Saved prior-month goals for one-click restore in manager settings. */
  operationsGoalsPriorMonth?: OperationsGoalsSnapshot;
  /** Fixed ops forecast defaults for this store. */
  fixedOpsForecastDefaults?: FixedOpsForecastDefaults;
  /** Dispatch overdue alert tuning. */
  dispatchOverdueRules?: DispatchOverdueRules;
  /** Default promise window and business hours copy. */
  dispatchPromiseDefaults?: DispatchPromiseDefaults;
  /** Tech display / shop TV behavior. */
  dispatchTechDisplayConfig?: DispatchTechDisplayConfig;
  /** Required fields on dispatch intake. */
  dispatchIntakeRequired?: DispatchIntakeRequiredFields;
  /** Per-store lane labels and display order. */
  dispatchLaneCustomization?: DispatchLaneCustomization;
  /** Midnight lane sweep behavior. */
  dispatchMidnightSweep?: DispatchMidnightSweepConfig;
  /** Last successful / failed DMS PDF imports (admin import health). */
  dmsImportHealth?: DmsImportHealth;
  /** Automated PBS PartnerHUB sync status. */
  pbsSyncState?: {
    lastSyncAt: string;
    lastSyncOk: boolean;
    lastError?: string;
    triggeredBy?: 'cron' | 'manual';
    triggeredByEmail?: string;
    triggeredByUsername?: string;
    summary?: string;
    counts?: {
      customersCreated: number;
      customersUpdated: number;
      visitsMerged: number;
      appointmentDaysUpdated: number;
      appointmentsProcessed: number;
    };
    fetched?: {
      contactVehicles: number;
      repairOrders: number;
      appointments: number;
      appointmentMonthStart: string;
      appointmentMonthEnd: string;
    };
  };
  /** Recent PBS sync activity log (newest first). */
  pbsSyncLogs?: PbsSyncLogEntry[];
  /** Defaults merged into new staff preferences on approval. */
  storeWorkspaceDefaults?: StoreWorkspaceDefaults;
  updatedAt: Timestamp;
}

export type DmsImportKind =
  | 'appointments'
  | 'advisor_performance'
  | 'technician_productivity'
  | 'fixed_ops_forecast'
  | 'pot_of_gold'
  | 'other';

export interface DmsImportHealthEntry {
  at: string;
  filename: string;
  importKind: DmsImportKind;
  userEmail?: string;
}

export interface DmsImportFailureEntry extends DmsImportHealthEntry {
  error: string;
}

export interface DmsImportHealth {
  lastSuccess?: DmsImportHealthEntry;
  recentFailures?: DmsImportFailureEntry[];
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
  fetched: {
    contactVehicles: number;
    repairOrders: number;
    appointments: number;
    appointmentMonthStart: string;
    appointmentMonthEnd: string;
  };
  counts: {
    customersCreated: number;
    customersUpdated: number;
    visitsMerged: number;
    appointmentDaysUpdated: number;
    appointmentsProcessed: number;
  };
  error?: string;
  summary: string;
}

export interface OperationsGoalsSnapshot {
  month: string;
  appointmentTarget: number;
  laborGrossTarget: number;
  partsSalesTarget: number;
  savedAt?: string;
}

export type ForecastReportPeriod = 'current_month' | 'next_month';

export interface FixedOpsForecastDefaults {
  reportPeriod?: ForecastReportPeriod;
  includedAdvisorIds?: string[];
}

export type DispatchOverdueAlertDisplay = 'compact' | 'full' | 'both' | 'hidden';

export interface DispatchOverdueRules {
  graceMinutes?: number;
  alertDisplay?: DispatchOverdueAlertDisplay;
}

export interface DispatchPromiseDefaults {
  defaultHoursFromNow?: number;
  businessHoursOpen?: string;
  businessHoursClose?: string;
  businessHoursLabel?: string;
}

export interface DispatchTechDisplayConfig {
  autoOpenOnTv?: boolean;
  refreshIntervalSeconds?: number;
  visibleStatuses?: DispatchStatus[];
}

export interface DispatchIntakeRequiredFields {
  concern?: boolean;
  tag?: boolean;
  techNumber?: boolean;
}

export interface DispatchLaneCustomization {
  labels?: Partial<Record<DispatchProductionLaneId, string>>;
  order?: DispatchProductionLaneId[];
}

export type DispatchMidnightSweepMode = 'auto' | 'confirm' | 'disabled';

export interface DispatchMidnightSweepConfig {
  mode?: DispatchMidnightSweepMode;
}

export interface ImportLog {
  id: string;
  timestamp: Timestamp;
  userId: string;
  username: string;
  filename: string;
  totalRecords: number;
  newProfiles: number;
  matchedProfiles: number;
  visitsLogged: number;
  duplicates: number;
  type: 'pdf' | 'csv';
}

export interface ServiceVisit {
  id: string;
  soNumber: string;
  date: string;
  mileage: number;
  advisor: string;
  requests: string;
  createdAt: Timestamp;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  make: string;
  model: string;
  year?: string;
  vinLast8: string;
  vin?: string;
  mileage?: string;
  soldDate: string;
  language: string;
  enableServiceAlert: boolean;
  serviceAlertTriggered: boolean;
  /** Next service reminder date (YYYY-MM-DD), set to 6 months from enrollment or last contact. */
  serviceReminderDueDate?: string;
  /** Per-customer override — days between service (blank = dealership default). */
  serviceAlertIntervalDays?: number;
  /** Per-customer override — buffer days after due (blank = dealership default). */
  serviceAlertBufferDays?: number;
  /** Manual next alert date — overrides auto schedule until this date (YYYY-MM-DD). */
  serviceAlertOverrideDate?: string;
  /** @deprecated Use serviceAlertOverrideDate */
  serviceAlertHoldUntil?: string;
  lastServiceContact?: Timestamp;
  lastContactOutcome?: string;
  lastContactUserId?: string;
  lastContactUsername?: string;
  lastAcknowledgedCycle?: number;
  lastServiceDate?: string;
  recentVisits?: ServiceVisit[]; // Last few for quick display
  stopAlertInfo?: {
    reason: string;
    notes: string;
    stoppedBy: string;
    stoppedAt: Timestamp;
  };
  soldByUserId?: string | null;
  soldByUsername?: string | null;
  createdAt: Timestamp;
  addedBy: string;
  addedByUsername: string;
  dealershipId?: string;
  notes?: string;
  salesman?: string;
  /** PBS PartnerHUB contact id — used for automated sync matching. */
  pbsContactId?: string;
  /** PBS PartnerHUB vehicle id — used for automated sync matching. */
  pbsVehicleId?: string;
  /** ISO timestamp of last PBS sync touch. */
  pbsSyncedAt?: string;
}

export interface ContactLog {
  id: string;
  timestamp: Timestamp;
  userId: string;
  username: string;
  outcome: string;
  notes: string;
  appointmentSet: boolean;
}

export interface Appointment {
  id: string;
  date: string;
  type: 'Oil Change' | 'Recall' | 'Diag' | 'Service';
  reasons: string[];
  customerId: string;
  mileage?: string | null;
  addedBy: string;
  timestamp: Timestamp;
}

export interface DailyStat {
  id: string;
  date: string;
  count: number;
  dealershipId?: string;
  updatedAt: Timestamp;
  breakdown?: {
    diagnosis: number;
    oilChange: number;
    recall: number;
    misc: number;
  };
  source?: 'pdf' | 'manual' | 'pbs';
  updatedBy?: string;
  pbsSyncedAt?: string;
}

export type DepartmentColumnId = 
  | 'lube' 
  | 'quick_service' 
  | 'ac_electrical' 
  | 'drivability'
  | 'heavyline' 
  | 'diesel' 
  | 'trans' 
  | 'down_in_shop'
  | 'unassigned';

export type DispatchLifecycleStatus = 'active' | 'overnight';

export type DispatchStatus = 'WIP' | 'POO' | 'WFA';

export interface DispatchRepairOrder {
  id: string;
  roNumber: string;
  techNumber: string;
  vinLastEight?: string;
  department: DepartmentColumnId;
  currentLaneId?: DepartmentColumnId;
  lifecycleStatus?: DispatchLifecycleStatus;
  status: DispatchStatus;
  isCompleted: boolean;
  dateCreated: string;
  lastUpdated: string;
  dealershipId: string;
  customerId?: string;
  customerLastName?: string;
  customerName?: string;
  phoneNumber?: string;
  accountName?: string;
  isInternal?: boolean;
  stockNumber?: string;
  tagNumber?: string;
  year?: string;
  model?: string;
  departmentName?: string;
  /** Customer is waiting on-site */
  isWaiting?: boolean;
  /** Pickup & delivery loaner */
  isPdl?: boolean;
  /** Customer promise date/time (ISO 8601) */
  promiseTimeAt?: string;
  /** Customer concern / reason for visit */
  concern?: string;
}

export type SuggestionStatus = 'new' | 'reviewed' | 'resolved';

export interface Suggestion {
  id: string;
  message: string;
  userId: string;
  userEmail: string;
  username: string;
  dealershipId: string;
  dealershipName?: string;
  status: SuggestionStatus;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
}

export interface ArchivePayload {
  // Allows explicit overrides like "2026-05" instead of forcing the current server month
  targetYearMonth: string; 
  dateArchived: string;       // Actual timestamp of action execution
  metricsSnapshot: {
    laborSales: number;
    laborGross: number;
    partsSales: number;
    partsGross: number;
    advisorBreakdown: any[];
    techBreakdown: any[];
  };
}

