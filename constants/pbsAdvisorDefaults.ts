/** Known PBS PartnerHUB login codes → advisor display names (Hyundai Santa Maria). */
export const HYUNDAI_PBS_ADVISOR_CODE_MAP: Record<string, string> = {
  '01': 'Frank',
  lv4278: 'Lemmy',
};

export function defaultPbsAdvisorCodeMap(dealershipId: string): Record<string, string> {
  if (dealershipId === 'hyundai') return { ...HYUNDAI_PBS_ADVISOR_CODE_MAP };
  return {};
}

export function mergePbsAdvisorCodeMaps(
  ...maps: Array<Record<string, string> | undefined | null>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [code, name] of Object.entries(map)) {
      const key = code.trim().toLowerCase();
      const label = String(name || '').trim();
      if (key && label) merged[key] = label;
    }
  }
  return merged;
}
