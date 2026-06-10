import { Timestamp } from "firebase/firestore";

export type Role = 'admin' | 'Manager' | 'Salesperson' | 'Service Advisor' | 'Staff';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  uid: string;
  email: string;
  username: string;
  role: Role;
  jobTitle: string;
  status: UserStatus;
  dealershipId?: string;
  isManager?: boolean;
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
  updatedAt: Timestamp;
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

