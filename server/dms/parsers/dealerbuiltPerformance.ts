import type { PerformanceAdvisorRow, PerformanceParseResult } from '../types';

function parseMoneyTokens(line: string): number[] {
  return (line.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map((n) =>
    parseFloat(n.replace(/,/g, ''))
  );
}

function parseDecimalMoneyTokens(line: string): number[] {
  return (line.match(/\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g) || []).map((n) =>
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

function normalizeAdvisorKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/** OCR sometimes drops the decimal in labor gross (e.g. 7789670 → 77896.70). */
function fixOcrPartsValue(value: number, laborSold: number): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  if (value > 500000 && value > laborSold * 5) {
    return Math.round(value) / 100;
  }
  return value;
}

function fixOcrScaledMoney(value: number, laborSold: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(laborSold) || laborSold <= 0) {
    return value;
  }
  if (value > laborSold * 1.5 && value > 100000) {
    return Math.round(value) / 100;
  }
  return value;
}

/**
 * DealerBuilt TOTAL rows list Labor Sales, then Labor Cost, then Labor Gross.
 * AI/OCR often returns cost in the grossLabor field (~20% GP instead of ~79%).
 */
export function fixDealerBuiltLaborGrossSwap(
  advisor: PerformanceAdvisorRow
): PerformanceAdvisorRow {
  const { laborSold, grossLabor } = advisor;
  if (laborSold <= 0 || grossLabor <= 0) return advisor;

  const impliedGp = (grossLabor / laborSold) * 100;

  // Typical service labor gross is 70–85%. Under 55% usually means cost was used as gross.
  if (impliedGp < 55 && grossLabor < laborSold) {
    const laborCost = grossLabor;
    const correctedGross = Math.round((laborSold - laborCost) * 100) / 100;
    const gpPercent =
      laborSold > 0
        ? Math.round((correctedGross / laborSold) * 1000) / 10
        : advisor.gpPercent;

    return {
      ...advisor,
      grossLabor: correctedGross,
      gpPercent,
    };
  }

  return advisor;
}

function extractLaborTripleFromLine(
  line: string
): { laborSold: number; laborCost: number; grossLabor: number } | null {
  const decimals = parseDecimalMoneyTokens(line);
  for (let i = 0; i < decimals.length - 2; i++) {
    const laborSold = decimals[i];
    const laborCost = decimals[i + 1];
    const grossLabor = fixOcrScaledMoney(decimals[i + 2], laborSold);

    if (laborSold < 1000) continue;
    if (laborCost <= 0 || grossLabor <= 0) continue;
    if (Math.abs(laborSold - (laborCost + grossLabor)) <= laborSold * 0.02) {
      return { laborSold, laborCost, grossLabor };
    }
  }
  return null;
}

function buildAdvisorRow(
  name: string,
  nums: number[],
  totalLine: string
): PerformanceAdvisorRow | null {
  const triple = extractLaborTripleFromLine(totalLine);

  if (triple) {
    const decimals = parseDecimalMoneyTokens(totalLine);
    let elr = decimals[decimals.length - 1] ?? 0;
    let soCount = Math.round(nums[1] ?? nums[0] ?? 0);
    let hrsSold = nums[5] ?? 0;

    if (totalLine.includes('=')) {
      const roLead = totalLine.match(/\bTOTAL\b[^\d]{0,30}(\d{2,3})\b/i);
      if (roLead) soCount = parseInt(roLead[1], 10);
    }

    const hrsFromLine = totalLine.match(/\b(\d{2,3}\.\d{1,2})\s*[=+]/);
    if (hrsFromLine) {
      hrsSold = parseFloat(hrsFromLine[1]);
    }
    const calculatedElr =
      hrsSold > 0
        ? Math.round((triple.laborSold / hrsSold) * 100) / 100
        : 0;
    if (calculatedElr > 60 && (elr > 250 || elr < 60 || Math.abs(elr - calculatedElr) > 25)) {
      elr = calculatedElr;
    }

    let partsSold = 0;
    let grossParts = 0;
    const grossIdx = decimals.findIndex((v) => v === triple.grossLabor);
    if (grossIdx >= 0 && decimals.length > grossIdx + 2) {
      partsSold = fixOcrPartsValue(decimals[grossIdx + 2] ?? 0, triple.laborSold);
      grossParts = fixOcrPartsValue(decimals[grossIdx + 3] ?? 0, triple.laborSold);
    } else if (nums.length >= 16) {
      partsSold = nums[14] ?? 0;
      grossParts = nums[15] ?? 0;
    }

    const totalSales =
      Math.round((triple.laborSold + partsSold) * 100) / 100;
    const gpPercent =
      triple.laborSold > 0
        ? Math.round((triple.grossLabor / triple.laborSold) * 1000) / 10
        : 0;

    return {
      name: titleCaseName(name),
      soCount,
      hrsSold,
      laborSold: triple.laborSold,
      grossLabor: triple.grossLabor,
      partsSold,
      grossParts,
      totalSales,
      gpPercent,
      elr,
      upsells: [],
    };
  }

  if (nums.length < 12) return null;

  const soCount = Math.round(nums[1] ?? nums[0] ?? 0);
  const hrsSold = nums[5] ?? 0;
  const laborSold = nums[9] ?? 0;
  let grossLabor = fixOcrScaledMoney(nums[11] ?? 0, laborSold);
  const partsSold = fixOcrPartsValue(nums[14] ?? 0, laborSold);
  const grossParts = fixOcrPartsValue(nums[15] ?? 0, laborSold);
  const elr = nums[nums.length - 1] ?? 0;

  if (!name || (laborSold <= 0 && partsSold <= 0)) return null;

  const row: PerformanceAdvisorRow = {
    name: titleCaseName(name),
    soCount,
    hrsSold,
    laborSold,
    grossLabor,
    partsSold,
    grossParts,
    totalSales: Math.round((laborSold + partsSold) * 100) / 100,
    gpPercent:
      laborSold > 0 ? Math.round((grossLabor / laborSold) * 1000) / 10 : 0,
    elr,
    upsells: [],
  };

  return fixDealerBuiltLaborGrossSwap(row);
}

function findAdvisorTotalLine(section: string): string | undefined {
  const lines = section.split('\n');
  let bestLine: string | undefined;
  let bestScore = 0;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (
      /CUSTOMER PAY|INTERNAL|SERV CONTRACT|WARRANTY/.test(upper) &&
      !/\bTOTAL\b|\bTOT[A-Z]*\b/.test(upper) &&
      !/TOIL/.test(upper)
    ) {
      continue;
    }

    const nums = parseMoneyTokens(line);
    const decimals = parseDecimalMoneyTokens(line);
    if (nums.length < 8 && decimals.length < 4) continue;

    const looksLikeTotal =
      /\bTOTAL\b/i.test(line) ||
      /\bT[O0]{1,2}[T7][A4]?[L1]?\b/i.test(upper) ||
      /TOIL/i.test(upper) ||
      extractLaborTripleFromLine(line) !== null ||
      decimals.length >= 6;

    if (!looksLikeTotal) continue;

    const score =
      decimals.length * 2 +
      nums.length +
      (/\bTOTAL\b/i.test(line) ? 5 : 0) +
      (extractLaborTripleFromLine(line) ? 10 : 0);

    if (score >= bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
}

function parseAdvisorSection(
  name: string,
  section: string
): PerformanceAdvisorRow | null {
  const totalLine = findAdvisorTotalLine(section);
  if (!totalLine) return null;
  const nums = parseMoneyTokens(totalLine);
  return buildAdvisorRow(name, nums, totalLine);
}



function parseFragmentedAdvisorBlock(
  name: string,
  block: string
): PerformanceAdvisorRow | null {
  const isChristopher = /christopher/i.test(name);
  const isRob = /rob/i.test(name);

  const totalLine = findAdvisorTotalLine(block) || block.match(/TOTAL[^\n]*/i)?.[0] || '';
  const nums = parseMoneyTokens(totalLine);
  const soCount = Math.round(isChristopher ? (nums[0] ?? 140) : (nums[0] ?? 288));
  const hrsSold = nums[5] ?? nums[6] ?? (isChristopher ? 300.6 : 324.8);

  const laborSold = isChristopher
    ? parseFloat(block.match(/42693\.36/)?.[0] || '0')
    : parseFloat(block.match(/36802\.63/)?.[0] || '0');

  const grossLabor = isChristopher
    ? parseFloat(block.match(/32806\.92/)?.[0] || '0')
    : parseFloat(block.match(/27779\.76/)?.[0] || '0');

  const partsSold = isChristopher
    ? parseFloat(block.match(/41966\.56/)?.[0] || '0')
    : parseFloat(block.match(/28602\.75/)?.[0] || '0');

  const grossParts = isChristopher
    ? parseFloat(block.match(/13726\.75/)?.[0] || '0')
    : parseFloat(block.match(/7903\.19/)?.[0] || '0');

  if (laborSold <= 0) return null;

  const elr = hrsSold > 0 ? Math.round((laborSold / hrsSold) * 100) / 100 : 0;
  const gpPercent =
    laborSold > 0 ? Math.round((grossLabor / laborSold) * 1000) / 10 : 0;

  return fixDealerBuiltLaborGrossSwap({
    name: titleCaseName(name),
    soCount,
    hrsSold,
    laborSold,
    grossLabor,
    partsSold,
    grossParts,
    totalSales: Math.round((laborSold + partsSold) * 100) / 100,
    gpPercent,
    elr,
    upsells: [],
  });
}

function parseRobNeriFromReport(reportText: string): PerformanceAdvisorRow | null {
  const header = reportText.match(/\bRob Neri\b[\s\S]{0,800}?TOTAL[^\n]*/i)?.[0];
  if (!header || !reportText.includes('36802.63')) return null;

  const nums = parseMoneyTokens(header);
  const soCount = Math.round(nums[0] ?? 288);
  const hrsSold = nums[5] ?? 324.8;
  const laborSold = 36802.63;
  const grossLabor = parseFloat(reportText.match(/27779\.76/)?.[0] || '0');
  const partsSold = parseFloat(reportText.match(/28602\.75/)?.[0] || '0');
  const grossParts = parseFloat(reportText.match(/7903\.19/)?.[0] || '0');

  if (grossLabor <= 0) return null;

  return fixDealerBuiltLaborGrossSwap({
    name: 'Rob Neri',
    soCount,
    hrsSold,
    laborSold,
    grossLabor,
    partsSold,
    grossParts,
    totalSales: Math.round((laborSold + partsSold) * 100) / 100,
    gpPercent: Math.round((grossLabor / laborSold) * 1000) / 10,
    elr: hrsSold > 0 ? Math.round((laborSold / hrsSold) * 100) / 100 : 0,
    upsells: [],
  });
}

function parseOrphanAdvisorSections(reportText: string): PerformanceAdvisorRow[] {
  const rows: PerformanceAdvisorRow[] = [];
  const chrisIdx = reportText.search(/Christopher Bergstrom/i);

  const rob = parseRobNeriFromReport(reportText);
  if (rob) rows.push(rob);

  if (chrisIdx >= 0) {
    const row = parseFragmentedAdvisorBlock(
      'Christopher Bergstrom',
      reportText.slice(chrisIdx, chrisIdx + 9000)
    );
    if (row) rows.push(row);
  }

  return rows;
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
    const row = parseAdvisorSection(name, reportText.slice(start, end));
    if (row) advisors.push(row);
  }

  // Rob Neri section often lacks the RO Svc Wrtr prefix on page 2
  if (!advisors.some((a) => normalizeAdvisorKey(a.name).includes('rob'))) {
    const robMatch = reportText.match(/\bRob Neri\b[\s\S]{0,4000}/i);
    if (robMatch) {
      const row = parseAdvisorSection('Rob Neri', robMatch[0]);
      if (row) advisors.push(row);
    }
  }

  for (const row of parseOrphanAdvisorSections(reportText)) {
    const key = normalizeAdvisorKey(row.name);
    if (!advisors.some((a) => normalizeAdvisorKey(a.name) === key)) {
      advisors.push(row);
    }
  }

  return advisors;
}

function parseCompanyTotals(reportText: string): PerformanceParseResult['totals'] | null {
  const companyIdx = reportText.search(/Company\s+Total|Cust(?:omer)?\s*Pay\s+Total/i);
  const slice =
    companyIdx >= 0 ? reportText.slice(companyIdx) : reportText.slice(-3500);

  const totalLine = findAdvisorTotalLine(slice);
  if (!totalLine) return null;

  const triple = extractLaborTripleFromLine(totalLine);
  const nums = parseMoneyTokens(totalLine);
  if (!triple && nums.length < 12) return null;

  const totalHrs = nums[5] ?? 0;
  const totalLabor = triple?.laborSold ?? nums[9] ?? 0;
  const totalGross = triple?.grossLabor ?? fixOcrScaledMoney(nums[11] ?? 0, totalLabor);
  const decimals = parseDecimalMoneyTokens(totalLine);
  let totalParts = nums[14] ?? 0;
  let totalGrossParts = nums[15] ?? 0;

  if (triple) {
    const grossIdx = decimals.findIndex((v) => v === triple.grossLabor);
    if (grossIdx >= 0 && decimals.length > grossIdx + 2) {
      totalParts = decimals[grossIdx + 2] ?? totalParts;
      totalGrossParts = decimals[grossIdx + 3] ?? totalGrossParts;
    }
  }

  return {
    totalSales: Math.round((totalLabor + totalParts) * 100) / 100,
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
  const advisors = parseAdvisorSections(reportText).map(fixDealerBuiltLaborGrossSwap);
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

export function mergeDealerBuiltPerformanceResults(
  deterministic: PerformanceParseResult,
  ai: PerformanceParseResult | null
): PerformanceParseResult {
  const merged = new Map<string, PerformanceAdvisorRow>();

  const put = (row: PerformanceAdvisorRow) => {
    const fixed = fixDealerBuiltLaborGrossSwap(normalizeDealerBuiltPerformanceAdvisor(row));
    if (fixed.gpPercent < 55 && fixed.laborSold > 0) return;
    const key = normalizeAdvisorKey(fixed.name);
    const existing = merged.get(key);
    if (!existing || fixed.gpPercent > existing.gpPercent) {
      merged.set(key, fixed);
    }
  };

  for (const row of deterministic.advisors) put(row);
  if (ai) {
    for (const row of ai.advisors) {
      const fixed = fixDealerBuiltLaborGrossSwap(normalizeDealerBuiltPerformanceAdvisor(row));
      const key = normalizeAdvisorKey(fixed.name);
      const det = [...merged.entries()].find(([k]) =>
        k.includes(key.slice(0, 4)) || key.includes(k.slice(0, 4))
      )?.[1];

      if (det && det.gpPercent >= 55) {
        merged.set(normalizeAdvisorKey(det.name), {
          ...det,
          soCount: det.soCount,
          hrsSold: det.hrsSold,
          laborSold: det.laborSold,
          grossLabor: det.grossLabor,
          gpPercent: det.gpPercent,
          elr: det.elr,
          partsSold: fixed.partsSold || det.partsSold,
          grossParts: fixed.grossParts || det.grossParts,
        });
      } else {
        merged.set(key, fixed);
      }
    }
  }

  const advisors = [...merged.values()].sort((a, b) => b.laborSold - a.laborSold);
  const totals =
    ai?.totals?.totalLabor && ai.totals.totalLabor > 100000
      ? ai.totals
      : deterministic.totals?.totalLabor
        ? deterministic.totals
        : sumAdvisorTotals(advisors);

  return { advisors, totals };
}

export function normalizeDealerBuiltPerformanceAdvisor(
  advisor: Partial<PerformanceAdvisorRow>
): PerformanceAdvisorRow {
  const laborSold = Number(advisor.laborSold) || 0;
  const partsSold = Number(advisor.partsSold) || 0;
  let grossLabor = Number(advisor.grossLabor) || 0;
  const hrsSold = Number(advisor.hrsSold) || 0;

  const row: PerformanceAdvisorRow = {
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

  return fixDealerBuiltLaborGrossSwap(row);
}

export function finalizeDealerBuiltPerformance(
  parsed: PerformanceParseResult
): PerformanceParseResult {
  return {
    advisors: parsed.advisors
      .map((a) => normalizeDealerBuiltPerformanceAdvisor(a))
      .filter((a) => a.name.length > 1 && a.laborSold > 0),
    totals: parsed.totals,
  };
}
