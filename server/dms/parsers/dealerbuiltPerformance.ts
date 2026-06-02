import type { PerformanceAdvisorRow, PerformanceParseResult } from '../types';

function parseMoneyTokens(line: string): number[] {
  return (line.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map((n) =>
    parseFloat(n.replace(/,/g, ''))
  );
}

function titleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildAdvisorRow(
  name: string,
  nums: number[]
): PerformanceAdvisorRow | null {
  if (nums.length < 12) return null;

  const soCount = Math.round(nums[1] ?? nums[0] ?? 0);
  const hrsSold = nums[5] ?? 0;
  const laborSold = nums[9] ?? 0;
  const grossLabor = nums[11] ?? 0;
  const partsSold = nums[14] ?? 0;
  const grossParts = nums[15] ?? 0;
  const elr = nums[nums.length - 1] ?? 0;

  if (!name || (laborSold <= 0 && partsSold <= 0)) return null;

  const totalSales = Math.round((laborSold + partsSold) * 100) / 100;
  const gpPercent =
    laborSold > 0 ? Math.round((grossLabor / laborSold) * 1000) / 10 : 0;

  return {
    name: titleCaseName(name),
    soCount,
    hrsSold,
    laborSold,
    grossLabor,
    partsSold,
    grossParts,
    totalSales,
    gpPercent,
    elr,
    upsells: [],
  };
}

function findAdvisorTotalLine(section: string): string | undefined {
  const lines = section.split('\n');
  let bestLine: string | undefined;
  let bestScore = 0;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (
      /CUSTOMER PAY|INTERNAL|SERV CONTRACT|WARRANTY/.test(upper) &&
      !/\bTOTAL\b|\bTOT[A-Z]*\b/.test(upper)
    ) {
      continue;
    }

    const nums = parseMoneyTokens(line);
    if (nums.length < 12) continue;

    const looksLikeTotal =
      /\bTOTAL\b/i.test(line) ||
      /\bT[O0]{1,2}[T7][A4]?[L1]?\b/i.test(upper) ||
      nums.length >= 16;

    if (!looksLikeTotal) continue;

    const score = nums.length + (/\bTOTAL\b/i.test(line) ? 5 : 0);
    if (score >= bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
}

function parseAdvisorSections(reportText: string): PerformanceAdvisorRow[] {
  const advisors: PerformanceAdvisorRow[] = [];
  const sectionPattern =
    /RO\s+Svc\s+Wrtr\s+([A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*)?)\s+\d{3,5}/gi;

  const matches = [...reportText.matchAll(sectionPattern)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1];
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? reportText.length)
        : reportText.length;
    const section = reportText.slice(start, end);
    const totalLine = findAdvisorTotalLine(section);
    if (!totalLine) continue;
    const nums = parseMoneyTokens(totalLine);
    const row = buildAdvisorRow(name, nums);
    if (row) advisors.push(row);
  }

  return advisors;
}

function parseCompanyTotals(reportText: string): PerformanceParseResult['totals'] | null {
  const companyIdx = reportText.search(/Company\s+Total|Cust(?:omer)?\s*Pay\s+Total/i);
  const slice =
    companyIdx >= 0 ? reportText.slice(companyIdx) : reportText.slice(-2500);

  const totalLine = findAdvisorTotalLine(slice);
  if (!totalLine) return null;
  const nums = parseMoneyTokens(totalLine);
  if (nums.length < 12) return null;

  const totalHrs = nums[5] ?? 0;
  const totalLabor = nums[9] ?? 0;
  const totalGross = nums[11] ?? 0;
  const totalParts = nums[14] ?? 0;
  const totalGrossParts = nums[15] ?? 0;
  const totalSales = Math.round((totalLabor + totalParts) * 100) / 100;

  return {
    totalSales,
    totalLabor,
    totalGross,
    totalParts,
    totalGrossParts,
    totalHrs,
  };
}

function sumAdvisorTotals(
  advisors: PerformanceAdvisorRow[]
): PerformanceParseResult['totals'] {
  const totalLabor = advisors.reduce((s, a) => s + a.laborSold, 0);
  const totalGross = advisors.reduce((s, a) => s + a.grossLabor, 0);
  const totalParts = advisors.reduce((s, a) => s + a.partsSold, 0);
  const totalGrossParts = advisors.reduce((s, a) => s + a.grossParts, 0);
  const totalHrs = advisors.reduce((s, a) => s + a.hrsSold, 0);

  return {
    totalSales: Math.round((totalLabor + totalParts) * 100) / 100,
    totalLabor: Math.round(totalLabor * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
    totalParts: Math.round(totalParts * 100) / 100,
    totalGrossParts: Math.round(totalGrossParts * 100) / 100,
    totalHrs: Math.round(totalHrs * 10) / 10,
  };
}

export function isDealerBuiltPerformanceReport(reportText: string): boolean {
  const upper = reportText.toUpperCase();
  return (
    upper.includes('SERVICE ADVISOR PERFORMANCE') ||
    upper.includes('RO SVC WRTR')
  );
}

export function parseDealerBuiltPerformanceDeterministic(
  reportText: string
): PerformanceParseResult {
  const advisors = parseAdvisorSections(reportText);
  const companyTotals = parseCompanyTotals(reportText);
  const totals =
    companyTotals ??
    (advisors.length > 0
      ? sumAdvisorTotals(advisors)
      : {
          totalSales: 0,
          totalLabor: 0,
          totalGross: 0,
          totalParts: 0,
          totalGrossParts: 0,
          totalHrs: 0,
        });

  return { advisors, totals };
}

export function normalizeDealerBuiltPerformanceAdvisor(
  advisor: Partial<PerformanceAdvisorRow>
): PerformanceAdvisorRow {
  const laborSold = Number(advisor.laborSold) || 0;
  const partsSold = Number(advisor.partsSold) || 0;
  const grossLabor = Number(advisor.grossLabor) || 0;
  const hrsSold = Number(advisor.hrsSold) || 0;

  return {
    name: titleCaseName(String(advisor.name || '').trim()),
    soCount: Math.round(Number(advisor.soCount) || 0),
    hrsSold,
    laborSold,
    grossLabor,
    partsSold,
    grossParts: Number(advisor.grossParts) || 0,
    totalSales:
      Number(advisor.totalSales) ||
      Math.round((laborSold + partsSold) * 100) / 100,
    gpPercent:
      Number(advisor.gpPercent) ||
      (laborSold > 0 ? Math.round((grossLabor / laborSold) * 1000) / 10 : 0),
    elr:
      Number(advisor.elr) ||
      (hrsSold > 0 ? Math.round((laborSold / hrsSold) * 100) / 100 : 0),
    upsells: Array.isArray(advisor.upsells) ? advisor.upsells : [],
  };
}
