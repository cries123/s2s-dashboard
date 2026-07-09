import type { DmsProviderId } from '../constants/dmsProviders';

function titleCaseWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** Normalize advisor display names by DMS report format. */
export function cleanAdvisorName(rawName: string, dmsProvider: DmsProviderId): string {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;

  if (dmsProvider === 'dealerbuilt') {
    const wrtrMatch = trimmed.match(
      /(?:RO\s+)?Svc\s+Wrtr\s+([A-Za-z]+(?:\s+[A-Za-z'`-]+)?)/i
    );
    if (wrtrMatch?.[1]) return titleCaseWords(wrtrMatch[1]);
    return titleCaseWords(trimmed.replace(/\s+\d{3,5}\s*$/, ''));
  }

  let name = trimmed.toUpperCase();
  if (name.includes('FRANK')) return 'Frank';
  if (name.includes('LEMMY')) return 'Lemmy';
  if (name.includes('JARYN')) return 'Jaryn';

  const advisorMatch = name.match(/Advisor\s+(?:\w+\s*-\s*)?([A-Z]+)/i);
  if (advisorMatch?.[1]) {
    const extracted = advisorMatch[1].trim();
    return extracted.charAt(0).toUpperCase() + extracted.slice(1).toLowerCase();
  }

  const firstWord = name.split(/[\s-]+/)[0] || '';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

export function isRealAdvisorName(name: string, dmsProvider: DmsProviderId): boolean {
  const n = name.toLowerCase().trim();
  if (!n) return false;
  if (n === 'jay') return false;

  const badStarts = [
    'total',
    'parts',
    'labor',
    'sublet',
    'price code',
    'customer',
    'warranty',
    'internal',
    'page',
    'company',
    'serv contract',
    'service contr',
    'gustlomer',
    'custlomer',
  ];
  if (badStarts.some((bad) => n.startsWith(bad))) return false;

  const exclusions = [
    'parts cro',
    'parts cempr',
    'parts i',
    'parts w',
    'labor c',
    'labor cemp',
    'labor i',
    'labor w',
    'labor wshop',
    'sublet csub',
    'sublet isub',
    'sublet wsub',
    'thealey',
    'user',
  ];
  if (exclusions.includes(n)) return false;

  if (dmsProvider === 'dealerbuilt') {
    if (/^\d+$/.test(n)) return false;
    if (n.length < 3) return false;
  }

  return true;
}

export function matchesPerformanceAdvisorRoster(
  name: string,
  roster: { label: string }[] | undefined
): boolean {
  if (!roster?.length) return true;
  const norm = name.toLowerCase().replace(/[^a-z]/g, '');
  if (!norm) return false;

  return roster.some((slot) => {
    const slotNorm = slot.label.toLowerCase().replace(/[^a-z]/g, '');
    if (!slotNorm) return false;
    if (norm === slotNorm) return true;
    if (norm.includes(slotNorm) || slotNorm.includes(norm)) return true;
    const last = slot.label.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
    return last.length > 2 && norm.includes(last.replace(/[^a-z]/g, ''));
  });
}

export function filterAdvisorsByPerformanceRoster<T extends { name: string }>(
  advisors: T[],
  roster: { label: string }[] | undefined
): T[] {
  if (!roster?.length) return advisors;
  return advisors.filter((row) => matchesPerformanceAdvisorRoster(row.name, roster));
}

/** Legacy PBS demo names — reject when importing DealerBuilt reports. */
export function isPhantomPbsAdvisorName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return n === 'frank' || n === 'lemmy' || n === 'jaryn' || n === 'jay';
}
