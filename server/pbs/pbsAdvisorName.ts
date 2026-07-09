/** Server-side PBS CSR / advisor name normalization (mirrors client advisorNameUtils for PBS). */

function titleCaseWord(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function cleanPbsCsrName(raw: string | undefined | null): string {
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
  if (parts.length === 1) return titleCaseWord(parts[0]);
  return parts.map(titleCaseWord).join(' ');
}

export function isRealPbsAdvisorName(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (!n || n.length < 2) return false;
  if (n === 'jay') return false;

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
