import type { MasterPermissionRole } from './rbac';
import type { StaffRoleTemplateId, StoreWorkspaceDefaults, UserPreferences } from '../types';
import { mergeUserPreferences } from './userPreferencesDefaults';

export type PartialUserPreferences = {
  serviceDrive?: Partial<UserPreferences['serviceDrive']>;
  contactWorkflow?: Partial<UserPreferences['contactWorkflow']>;
  dashboardModules?: Partial<UserPreferences['dashboardModules']>;
  crmDisplay?: Partial<UserPreferences['crmDisplay']>;
};

export interface StaffRoleTemplate {
  id: StaffRoleTemplateId;
  label: string;
  description: string;
  permission: Extract<MasterPermissionRole, 'advisor-service' | 'advisor-sales'>;
  jobTitle: string;
  preferences: PartialUserPreferences;
}

export const STAFF_ROLE_TEMPLATES: StaffRoleTemplate[] = [
  {
    id: 'service-advisor',
    label: 'Service advisor',
    description: 'Dispatch-first; shop floor modules on.',
    permission: 'advisor-service',
    jobTitle: 'Service Advisor',
    preferences: {
      serviceDrive: {
        defaultLandingTab: 'dispatch',
        openOnLogin: false,
        defaultFilter: 'all',
        queuePriority: 'balanced',
      },
      contactWorkflow: { followUpDays: 3, defaultOutcome: 'Answered', autoCheckAppointmentSet: true },
      dashboardModules: {
        showAdvisorPerformance: true,
        showTechEfficiency: true,
        showOperationsKpis: true,
        showForecastTab: false,
        showSalesPerformanceTab: false,
        showVinSearchTab: false,
        showPotOfGoldTab: true,
        showArchiveTools: false,
      },
      crmDisplay: { density: 'standard', defaultLanguageFilter: 'all', alertsOnlyDefault: false },
    },
  },
  {
    id: 'bdc',
    label: 'BDC',
    description: 'CRM and service alerts; compact queue.',
    permission: 'advisor-service',
    jobTitle: 'BDC Representative',
    preferences: {
      serviceDrive: {
        defaultLandingTab: 'alerts',
        openOnLogin: true,
        defaultFilter: 'service_due',
        queuePriority: 'overdue_first',
      },
      contactWorkflow: { followUpDays: 2, defaultOutcome: 'Answered', autoCheckAppointmentSet: true },
      dashboardModules: {
        showAdvisorPerformance: false,
        showTechEfficiency: false,
        showOperationsKpis: false,
        showForecastTab: false,
        showSalesPerformanceTab: false,
        showVinSearchTab: false,
        showPotOfGoldTab: false,
        showArchiveTools: false,
      },
      crmDisplay: { density: 'compact', defaultLanguageFilter: 'all', alertsOnlyDefault: true },
    },
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Onboarding and VIN tools; sales landing.',
    permission: 'advisor-sales',
    jobTitle: 'Sales Professional',
    preferences: {
      serviceDrive: {
        defaultLandingTab: 'add',
        openOnLogin: false,
        defaultFilter: 'all',
        queuePriority: 'balanced',
      },
      contactWorkflow: { followUpDays: 5, defaultOutcome: 'Answered', autoCheckAppointmentSet: false },
      dashboardModules: {
        showAdvisorPerformance: false,
        showTechEfficiency: false,
        showOperationsKpis: false,
        showForecastTab: false,
        showSalesPerformanceTab: true,
        showVinSearchTab: true,
        showPotOfGoldTab: false,
        showArchiveTools: false,
      },
      crmDisplay: { density: 'standard', defaultLanguageFilter: 'all', alertsOnlyDefault: false },
    },
  },
];

export function getStaffRoleTemplate(id: StaffRoleTemplateId): StaffRoleTemplate {
  return STAFF_ROLE_TEMPLATES.find((t) => t.id === id) ?? STAFF_ROLE_TEMPLATES[0];
}

/** Deep-merge template preferences, then optional store defaults on top. */
export function preferencesFromTemplate(
  templateId: StaffRoleTemplateId,
  storeDefaults?: StoreWorkspaceDefaults | null
): UserPreferences {
  const template = getStaffRoleTemplate(templateId);
  const merged = mergeUserPreferences(template.preferences, 'advisor');

  if (!storeDefaults) return merged;

  return mergeUserPreferences(
    {
      serviceDrive: {
        ...merged.serviceDrive,
        ...(storeDefaults.defaultLandingTab
          ? { defaultLandingTab: storeDefaults.defaultLandingTab }
          : {}),
      },
      contactWorkflow: {
        ...merged.contactWorkflow,
        ...(storeDefaults.followUpDays != null
          ? { followUpDays: storeDefaults.followUpDays }
          : {}),
      },
      crmDisplay: {
        ...merged.crmDisplay,
        ...(storeDefaults.crmDensity ? { density: storeDefaults.crmDensity } : {}),
      },
      dashboardModules: {
        ...merged.dashboardModules,
        ...storeDefaults.dashboardModules,
      },
    },
    'advisor'
  );
}
