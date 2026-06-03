import {
  UserPreferences,
  ServiceDriveFilter,
  QueuePriorityProfile,
  CrmDensity,
  Role,
  LandingTab,
} from '../types';

export const DEFAULT_PREFERENCES: UserPreferences = {
  serviceDrive: {
    openOnLogin: false,
    defaultLandingTab: 'appointments',
    defaultFilter: 'all',
    queuePriority: 'balanced',
  },
  contactWorkflow: {
    followUpDays: 3,
    defaultOutcome: 'Answered',
    autoCheckAppointmentSet: true,
  },
  dashboardModules: {
    showWeatherWidget: true,
    showOperationsKpis: true,
    showOperationsProjections: true,
    showAdvisorPerformance: true,
    showTechEfficiency: true,
    showArchiveTools: false,
    showForecastTab: true,
    showSalesPerformanceTab: true,
    showVinSearchTab: true,
    showRecallsTab: true,
    showPotOfGoldTab: true,
  },
  crmDisplay: {
    density: 'standard',
    defaultLanguageFilter: 'all',
    alertsOnlyDefault: false,
  },
};

export function getRoleAwareDefaults(role?: Role): UserPreferences {
  const isManager = role === 'admin' || role === 'Manager';
  return {
    ...DEFAULT_PREFERENCES,
    dashboardModules: {
      ...DEFAULT_PREFERENCES.dashboardModules,
      showArchiveTools: isManager,
      showOperationsProjections: true,
      showForecastTab: isManager,
    },
  };
}

function normalizeLandingTab(tab: LandingTab): LandingTab {
  if (tab === 'service-drive' || tab === 'settings') return 'appointments';
  return tab;
}

function mergeServiceDrive(
  base: UserPreferences['serviceDrive'],
  patch?: Partial<UserPreferences['serviceDrive']>
): UserPreferences['serviceDrive'] {
  const merged = { ...base, ...patch };
  merged.defaultLandingTab = normalizeLandingTab(merged.defaultLandingTab);
  return merged;
}

function mergeContact(
  base: UserPreferences['contactWorkflow'],
  patch?: Partial<UserPreferences['contactWorkflow']>
): UserPreferences['contactWorkflow'] {
  return { ...base, ...patch };
}

function mergeModules(
  base: UserPreferences['dashboardModules'],
  patch?: Partial<UserPreferences['dashboardModules']>
): UserPreferences['dashboardModules'] {
  return { ...base, ...patch };
}

function mergeCrm(
  base: UserPreferences['crmDisplay'],
  patch?: Partial<UserPreferences['crmDisplay']>
): UserPreferences['crmDisplay'] {
  return { ...base, ...patch };
}

export function mergeUserPreferences(
  stored: Partial<UserPreferences> | undefined,
  role?: Role
): UserPreferences {
  const base = getRoleAwareDefaults(role);
  if (!stored) return base;

  return {
    serviceDrive: mergeServiceDrive(base.serviceDrive, stored.serviceDrive),
    contactWorkflow: mergeContact(base.contactWorkflow, stored.contactWorkflow),
    dashboardModules: mergeModules(base.dashboardModules, stored.dashboardModules),
    crmDisplay: mergeCrm(base.crmDisplay, stored.crmDisplay),
  };
}

export function clampFollowUpDays(days: number): number {
  return Math.min(14, Math.max(1, Math.round(days)));
}

export function isValidFilter(value: string): value is ServiceDriveFilter {
  return value === 'all' || value === 'service_due' || value === 'stale_followup';
}

export function isValidQueuePriority(value: string): value is QueuePriorityProfile {
  return value === 'balanced' || value === 'overdue_first' || value === 'never_contacted_first';
}

export function isValidDensity(value: string): value is CrmDensity {
  return value === 'compact' || value === 'standard';
}

export function isValidLandingTab(value: string): value is LandingTab {
  return [
    'service-drive',
    'appointments',
    'alerts',
    'search',
    'add',
    'dispatch',
    'recalls',
    'forecast',
    'sales-performance',
    'pot-of-gold',
    'vin-search',
    'admin',
    'settings',
  ].includes(value);
}
