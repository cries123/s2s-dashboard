import type { DealershipId } from '../constants';

export interface CompetitionAdvisorSlot {
  id: string;
  label: string;
}

export interface CompetitionTechnicianSlot {
  id: string;
  label: string;
}

export interface PerformanceAdvisorSlot {
  id: string;
  label: string;
}

export interface DealershipStaffConfig {
  competitionAdvisors: CompetitionAdvisorSlot[];
  competitionTechnicians: CompetitionTechnicianSlot[];
  performanceAdvisorRoster: PerformanceAdvisorSlot[];
}

const DEFAULT_TECHNICIANS: CompetitionTechnicianSlot[] = [
  { id: 'daniel', label: 'Daniel' },
  { id: 'jon', label: 'Jon' },
  { id: 'matthew', label: 'Matthew' },
  { id: 'jacinto', label: 'Jacinto' },
  { id: 'ethan', label: 'Ethan' },
  { id: 'trevor', label: 'Trevor' },
];

const DEFAULT_STAFF: Record<DealershipId, DealershipStaffConfig> = {
  hyundai: {
    competitionAdvisors: [
      { id: 'frank', label: 'Frank' },
      { id: 'lemmy', label: 'Lemmy' },
    ],
    competitionTechnicians: DEFAULT_TECHNICIANS,
    performanceAdvisorRoster: [
      { id: 'frank', label: 'Frank' },
      { id: 'lemmy', label: 'Lemmy' },
      { id: 'jaryn', label: 'Jaryn' },
    ],
  },
  ford: {
    competitionAdvisors: [
      { id: 'advisor_1', label: 'Advisor 1' },
      { id: 'advisor_2', label: 'Advisor 2' },
    ],
    competitionTechnicians: DEFAULT_TECHNICIANS,
    performanceAdvisorRoster: [
      { id: 'advisor_1', label: 'Advisor 1' },
      { id: 'advisor_2', label: 'Advisor 2' },
    ],
  },
  nissan: {
    competitionAdvisors: [
      { id: 'advisor_1', label: 'Advisor 1' },
      { id: 'advisor_2', label: 'Advisor 2' },
    ],
    competitionTechnicians: DEFAULT_TECHNICIANS,
    performanceAdvisorRoster: [
      { id: 'advisor_1', label: 'Advisor 1' },
      { id: 'advisor_2', label: 'Advisor 2' },
    ],
  },
};

type SettingsSlice = {
  competitionAdvisors?: CompetitionAdvisorSlot[];
  competitionTechnicians?: CompetitionTechnicianSlot[];
  performanceAdvisorRoster?: PerformanceAdvisorSlot[];
} | null | undefined;

export function getDealershipStaffConfig(dealershipId: string, settings?: SettingsSlice): DealershipStaffConfig {
  const fallback = DEFAULT_STAFF[dealershipId as DealershipId] ?? DEFAULT_STAFF.hyundai;
  return {
    competitionAdvisors: settings?.competitionAdvisors?.length
      ? settings.competitionAdvisors
      : fallback.competitionAdvisors,
    competitionTechnicians: settings?.competitionTechnicians?.length
      ? settings.competitionTechnicians
      : fallback.competitionTechnicians,
    performanceAdvisorRoster: settings?.performanceAdvisorRoster?.length
      ? settings.performanceAdvisorRoster
      : fallback.performanceAdvisorRoster,
  };
}

export function getTechnicianLabels(dealershipId: string, settings?: SettingsSlice): string[] {
  return getDealershipStaffConfig(dealershipId, settings).competitionTechnicians.map((t) => t.label);
}

export function slugifyStaffName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function matchAdvisorSlot(reportName: string, advisors: CompetitionAdvisorSlot[]): string | null {
  const normalized = reportName.toLowerCase().trim();
  const exact = advisors.find(
    (a) =>
      a.id === normalized ||
      a.label.toLowerCase() === normalized ||
      normalized.includes(a.label.toLowerCase()) ||
      normalized.includes(a.id)
  );
  return exact?.id ?? null;
}
