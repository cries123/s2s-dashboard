import type { DealershipId } from '../constants';

export interface CompetitionAdvisorSlot {
  /** Firestore / Pot of Gold column key (lowercase slug) */
  id: string;
  /** Display label in UI */
  label: string;
}

export interface DealershipStaffConfig {
  competitionAdvisors: CompetitionAdvisorSlot[];
}

const DEFAULT_STAFF: Record<DealershipId, DealershipStaffConfig> = {
  hyundai: {
    competitionAdvisors: [
      { id: 'frank', label: 'Frank' },
      { id: 'lemmy', label: 'Lemmy' },
    ],
  },
  ford: {
    competitionAdvisors: [
      { id: 'advisor_1', label: 'Advisor 1' },
      { id: 'advisor_2', label: 'Advisor 2' },
    ],
  },
  nissan: {
    competitionAdvisors: [
      { id: 'advisor_1', label: 'Advisor 1' },
      { id: 'advisor_2', label: 'Advisor 2' },
    ],
  },
};

export function getDealershipStaffConfig(
  dealershipId: string,
  settings?: { competitionAdvisors?: CompetitionAdvisorSlot[] } | null
): DealershipStaffConfig {
  const fallback =
    DEFAULT_STAFF[dealershipId as DealershipId] ?? DEFAULT_STAFF.hyundai;
  if (settings?.competitionAdvisors?.length) {
    return { competitionAdvisors: settings.competitionAdvisors };
  }
  return fallback;
}

export function slugifyStaffName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function matchAdvisorSlot(
  reportName: string,
  advisors: CompetitionAdvisorSlot[]
): string | null {
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
