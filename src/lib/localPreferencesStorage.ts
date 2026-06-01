const CRM_SEARCH_PREFIX = 's2s_crm_search_';
const OPS_COLLAPSED_KEY = 's2s_ops_collapsed_sections';

export function getStoredCrmSearch(uid: string): string {
  try {
    return localStorage.getItem(`${CRM_SEARCH_PREFIX}${uid}`) ?? '';
  } catch {
    return '';
  }
}

export function setStoredCrmSearch(uid: string, query: string): void {
  try {
    if (query.trim()) {
      localStorage.setItem(`${CRM_SEARCH_PREFIX}${uid}`, query);
    } else {
      localStorage.removeItem(`${CRM_SEARCH_PREFIX}${uid}`);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function getOpsCollapsedSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPS_COLLAPSED_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function setOpsSectionCollapsed(sectionId: string, collapsed: boolean): void {
  try {
    const current = getOpsCollapsedSections();
    if (collapsed) {
      current[sectionId] = true;
    } else {
      delete current[sectionId];
    }
    localStorage.setItem(OPS_COLLAPSED_KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
}
