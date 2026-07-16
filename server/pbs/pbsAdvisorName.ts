/** Server-side PBS CSR / advisor name normalization (mirrors client advisorNameUtils for PBS). */

function titleCaseWord(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** PBS advisor login codes sometimes used as CSR (e.g. "LV4278", "FB123"). */
export function looksLikePbsAdvisorCode(token: string): boolean {
  return /^[A-Za-z]{1,4}\d{2,}$/.test(token.trim());
}

export function normalizePbsAdvisorCode(token: string): string {
  return token.trim().toLowerCase();
}

/**
 * Build code → advisor-name aliases from combined strings like "LEMMY LV4278"
 * (appointment Advisor fields and some RO CSR fields include both).
 */
export function buildPbsAdvisorAliases(
  rawNames: Array<string | undefined | null>
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const raw of rawNames) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const codeTokens = tokens.filter(looksLikePbsAdvisorCode);
    const nameTokens = tokens.filter((t) => !looksLikePbsAdvisorCode(t) && /[A-Za-z]/.test(t));
    if (codeTokens.length === 0 || nameTokens.length === 0) continue;

    const name = cleanPbsCsrName(nameTokens.join(' '));
    if (!name || !isRealPbsAdvisorName(name)) continue;

    for (const code of codeTokens) {
      aliases.set(normalizePbsAdvisorCode(code), name);
    }
  }

  return aliases;
}

export function cleanPbsCsrName(
  raw: string | undefined | null,
  aliases?: Map<string, string>
): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  const upper = trimmed.toUpperCase();
  if (upper.includes('FRANK')) return 'Frank';
  if (upper.includes('LEMMY')) return 'Lemmy';
  if (upper.includes('JARYN')) return 'Jaryn';

  const advisorMatch = upper.match(/ADVISOR\s+(?:\w+\s*-\s*)?([A-Z]+)/i);
  if (advisorMatch?.[1]) {
    return titleCaseWord(advisorMatch[1]);
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const nameParts = parts.filter((p) => !looksLikePbsAdvisorCode(p));

  // Pure advisor code(s) — resolve to a real name via aliases when possible.
  if (nameParts.length === 0) {
    for (const part of parts) {
      const hit = aliases?.get(normalizePbsAdvisorCode(part));
      if (hit) return hit;
    }
    return parts.map((p) => p.toUpperCase()).join(' ');
  }

  // Mixed "NAME CODE" — keep the name, drop the code so buckets merge.
  if (nameParts.length < parts.length) {
    return nameParts.map(titleCaseWord).join(' ');
  }

  if (parts.length === 1) return titleCaseWord(parts[0]);
  return parts.map(titleCaseWord).join(' ');
}

export function isRealPbsAdvisorName(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (!n || n.length < 2) return false;
  if (/^\d+$/.test(n)) return false;
  if (n === 'jay' || n === '01') return false;

  const badStarts = [
    'total',
    'parts',
    'labor',
    'sublet',
    'customer',
    'warranty',
    'internal',
    'page',
    'company',
    'shop',
    'unknown',
  ];
  if (badStarts.some((bad) => n.startsWith(bad))) return false;

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

/** Prefer a real advisor name; fall back from junk line CSR (e.g. "01") to RO header CSR / aliases. */
export function resolvePbsAdvisorCsr(
  lineCsr: string | undefined | null,
  headerCsr: string | undefined | null,
  aliases?: Map<string, string>
): string {
  const candidates = [lineCsr, headerCsr].filter((v) => (v || '').trim()) as string[];
  for (const raw of candidates) {
    const cleaned = cleanPbsCsrName(raw, aliases);
    if (cleaned && isRealPbsAdvisorName(cleaned)) return cleaned;
  }
  for (const raw of [headerCsr, lineCsr]) {
    const cleaned = cleanPbsCsrName(raw, aliases);
    if (cleaned) return cleaned;
  }
  return '';
}
