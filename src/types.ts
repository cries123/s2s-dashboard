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
  preferences?: UserPreferences;
}

export type LandingTab =
  | 'service-drive'
  | 'appointments'
  | 'alerts'
  | 'search'
  | 'add'
  | 'dispatch'
  | 'recalls'
  | 'forecast'
  | 'sales-performance'
  | 'pot-of-gold'
  | 'vin-search'
  | 'admin'
  | 'settings';

export type ServiceDriveFilter = 'all' | 'service_due' | 'stale_followup';

export type QueuePriorityProfile = 'balanced' | 'overdue_first' | 'never_contacted_first';

export type CrmDensity = 'compact' | 'standard';

export type LanguageFilter = 'all' | 'english' | 'spanish';

export interface ServiceDrivePreferences {
  openOnLogin: boolean;
  defaultLandingTab: LandingTab;
  defaultFilter: ServiceDriveFilter;
  queuePriority: QueuePriorityProfile;
}

export interface ContactWorkflowPreferences {
  followUpDays: number;
  defaultOutcome: string;
  autoCheckAppointmentSet: boolean;
}

export interface DashboardModulePreferences {
  showWeatherWidget: boolean;
  showOperationsKpis: boolean;
  showOperationsProjections: boolean;
  showAdvisorPerformance: boolean;
  showTechEfficiency: boolean;
  showArchiveTools: boolean;
  showForecastTab: boolean;
  showSalesPerformanceTab: boolean;
  showVinSearchTab: boolean;
  showRecallsTab: boolean;
  showPotOfGoldTab: boolean;
}

export interface CrmDisplayPreferences {
  density: CrmDensity;
  defaultLanguageFilter: LanguageFilter;
  alertsOnlyDefault: boolean;
}

export interface UserPreferences {
  serviceDrive: ServiceDrivePreferences;
  contactWorkflow: ContactWorkflowPreferences;
  dashboardModules: DashboardModulePreferences;
  crmDisplay: CrmDisplayPreferences;
}

export interface Dealership {
  id: string;
  name: string;
  code: string;
  createdAt: Timestamp;
}

export type DispatchProductionLaneId =
  | 'lube'
  | 'quick_service'
  | 'ac_electrical'
  | 'heavyline'
  | 'diesel'
  | 'trans'
  | 'mobile_repair';

export interface DealershipSettings {
  id: string;
  appointmentTarget: number;
  laborGrossTarget?: number;
  partsSalesTarget?: number;
  enableDispatchTab?: boolean;
  dmsProvider?: import('./constants/dmsProviders').DmsProviderId;
  dispatchLaneCapacity?: Partial<Record<DispatchProductionLaneId, number>>;
  dispatchShowTodayLoad?: boolean;
  dispatchBlockWhenFull?: boolean;
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
  | 'heavyline' 
  | 'diesel' 
  | 'trans' 
  | 'mobile_repair' 
  | 'unassigned';

export interface DispatchRepairOrder {
  id: string;
  roNumber: string;
  techNumber: string;
  customerLastName?: string;
  vinLastEight?: string;
  customerId?: string;
  department: DepartmentColumnId;
  status: 'WIP' | 'DIS' | 'POO' | 'WFA';
  isCompleted: boolean;
  dateCreated: string;
  lastUpdated: string;
  dealershipId: string;
  customerName?: string;
  phoneNumber?: string;
  accountName?: string;
  isInternal?: boolean;
  stockNumber?: string;
  tagNumber?: string;
  year?: string;
  model?: string;
  departmentName?: string;
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



/** Why a customer appears on the Service Drive work queue */
export type ServiceDriveReason = 'service_due' | 'stale_followup';

export type ServiceDrivePriority = 'urgent' | 'high' | 'medium' | 'normal';

/** Unified advisor work-queue row (service alerts + follow-ups) */
export interface WorkQueueItem {
  customer: Customer;
  score: number;
  reasons: ServiceDriveReason[];
  daysOverdue: number;
  daysSinceContact: number | null;
  priority: ServiceDrivePriority;
}
