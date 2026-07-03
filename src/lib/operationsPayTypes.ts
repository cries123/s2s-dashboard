export type PayTypeKey = 'customer' | 'warranty' | 'internal';

export interface PayTypeSegment {
  key: PayTypeKey;
  roCount: number;
  hoursSold: number;
  laborSold: number;
  grossLabor: number;
  elr: number;
  gpPercent: number;
  mixPercent: number;
}

export interface OperationsPayTypeSummary {
  customer: PayTypeSegment;
  warranty: PayTypeSegment;
  internal: PayTypeSegment;
  totalRoCount: number;
  customerPayPortionPercent: number;
  sourceMonth?: string;
}

export interface AdvisorMixRow {
  name: string;
  laborSold: number;
  mixPercent: number;
}

export interface ForecastPayTypeSeed {
  rawCounts: { cpCount: number; warrCount: number; internalCount: number };
  cpMix: number;
  warrMix: number;
  internalMix: number;
  cpRate: number;
  cpGp: number;
  warrRate: number;
  warrGp: number;
  internalRate: number;
  internalGp: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildSegment(
  key: PayTypeKey,
  roCount: number,
  hoursSold: number,
  laborSold: number,
  grossLabor: number,
  totalRo: number
): PayTypeSegment {
  const elr = hoursSold > 0 ? round2(laborSold / hoursSold) : 0;
  const gpPercent = laborSold > 0 ? round1((grossLabor / laborSold) * 100) : 0;
  return {
    key,
    roCount,
    hoursSold: round1(hoursSold),
    laborSold: round2(laborSold),
    grossLabor: round2(grossLabor),
    elr,
    gpPercent,
    mixPercent: totalRo > 0 ? round1((roCount / totalRo) * 100) : 0,
  };
}

function finalizeSummary(
  customer: Omit<PayTypeSegment, 'mixPercent'>,
  internal: Omit<PayTypeSegment, 'mixPercent'>,
  warranty: Omit<PayTypeSegment, 'mixPercent'>
): OperationsPayTypeSummary {
  const totalRo = customer.roCount + internal.roCount + warranty.roCount;
  const withMix = (seg: Omit<PayTypeSegment, 'mixPercent'>): PayTypeSegment => ({
    ...seg,
    mixPercent: totalRo > 0 ? round1((seg.roCount / totalRo) * 100) : 0,
  });
  const c = withMix(customer);
  return {
    customer: c,
    warranty: withMix(warranty),
    internal: withMix(internal),
    totalRoCount: totalRo,
    customerPayPortionPercent: c.mixPercent,
  };
}

/** DealerBuilt store totals block (Customer / Internal / Warranty RO counts + labor columns). */
function extractStoreSummaryPayTypes(reportText: string): OperationsPayTypeSummary | null {
  const roBlock = reportText.match(
    /Customer\s*Pay\s+(\d+)\s*\n\s*Internal\s+(\d+)\s*(?:\n\s*Serv(?:ice)?\s*Contr(?:act)?\s+\d+\s*)?\n\s*Warr(?:anty|ant)\s+(\d+)/i
  );
  if (!roBlock) return null;

  const cpRo = parseInt(roBlock[1], 10);
  const internalRo = parseInt(roBlock[2], 10);
  const warrRo = parseInt(roBlock[3], 10);
  if (cpRo + internalRo + warrRo <= 0) return null;

  const roBlockIndex = roBlock.index ?? 0;
  const afterRo = reportText.slice(roBlockIndex);

  const laborSalesBlock = afterRo.match(
    /Line\s*1\s*Line\s*Sales[\s\S]*?ROs\s*ROs\s*\n([\s\S]*?)\n\s*Labor\s*\n\s*Cost/is
  );

  const laborGrossMatch = afterRo.match(
    /Labor\s*\n\s*Gross[\s\S]{0,80}?\n([\d,]+\.\d{2})\s*\n([\d,]+\.\d{2})\s*\n([\d,]+\.\d{2})\s*\n([\d,]+\.\d{2})/i
  );

  const hoursMatch = afterRo.match(
    /#Ops\s+Per\s+Hours[\s\S]{0,80}?\n(?:[\d.]+\s+[\d.]+\s+)?([\d,]+\.\d{2})\s*\n(?:[\d.]+\s+[\d.]+\s+)?([\d,]+\.\d{2})\s*\n(?:[\d.]+\s+[\d.]+\s+)?([\d,]+\.\d{2})\s*\n(?:[\d.]+\s+[\d.]+\s+)?([\d,]+\.\d{2})/i
  );

  const gpMatch = afterRo.match(
    /Labor\s*\n\s*Gross\s*\n\s*%[\s\S]{0,40}?\n([\d.]+)\s*\n([\d.]+)\s*\n([\d.]+)\s*\n([\d.]+)/i
  );

  const elrMatch = afterRo.match(
    /Eff\.?\s*\n\s*Labor\s*\n\s*Rate[\s\S]{0,60}?\n([\d.]+)\s*\n([\d.]+)\s*\n([\d.]+)\s*\n([\d.]+)/i
  );

  const parseMoney = (s: string) => parseFloat(s.replace(/[,_]/g, ''));

  const lastMoneyOnLine = (line: string): number => {
    const decimals = line.match(/[\d,]+\.\d{2}/g);
    if (!decimals?.length) return 0;
    return parseMoney(decimals[decimals.length - 1]);
  };

  let cpHours = 0;
  let internalHours = 0;
  let warrHours = 0;
  let cpLabor = 0;
  let internalLabor = 0;
  let warrLabor = 0;
  let cpGross = 0;
  let internalGross = 0;
  let warrGross = 0;

  if (laborSalesBlock) {
    const salesLines = laborSalesBlock[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /[\d,]+\.\d{2}/.test(l));
    if (salesLines.length >= 4) {
      cpLabor = lastMoneyOnLine(salesLines[0]);
      internalLabor = lastMoneyOnLine(salesLines[1]);
      warrLabor = lastMoneyOnLine(salesLines[3]);
    }
  }

  if (laborGrossMatch) {
    cpGross = parseMoney(laborGrossMatch[1]);
    internalGross = parseMoney(laborGrossMatch[2]);
    warrGross = parseMoney(laborGrossMatch[4]);
  }

  if (hoursMatch) {
    cpHours = parseMoney(hoursMatch[1]);
    internalHours = parseMoney(hoursMatch[2]);
    warrHours = parseMoney(hoursMatch[4]);
  }

  const customer = buildSegment('customer', cpRo, cpHours, cpLabor, cpGross, cpRo + internalRo + warrRo);
  const internal = buildSegment('internal', internalRo, internalHours, internalLabor, internalGross, cpRo + internalRo + warrRo);
  const warranty = buildSegment('warranty', warrRo, warrHours, warrLabor, warrGross, cpRo + internalRo + warrRo);

  if (gpMatch) {
    customer.gpPercent = round1(parseFloat(gpMatch[1]));
    internal.gpPercent = round1(parseFloat(gpMatch[2]));
    warranty.gpPercent = round1(parseFloat(gpMatch[4]));
  }

  if (elrMatch) {
    customer.elr = round2(parseFloat(elrMatch[1]));
    internal.elr = round2(parseFloat(elrMatch[2]));
    warranty.elr = round2(parseFloat(elrMatch[4]));
  }

  if (customer.laborSold <= 0 && internal.laborSold <= 0 && warranty.laborSold <= 0) {
    return finalizeSummary(
      { ...customer, hoursSold: 0, laborSold: 0, grossLabor: 0, elr: customer.elr, gpPercent: customer.gpPercent },
      { ...internal, hoursSold: 0, laborSold: 0, grossLabor: 0, elr: internal.elr, gpPercent: internal.gpPercent },
      { ...warranty, hoursSold: 0, laborSold: 0, grossLabor: 0, elr: warranty.elr, gpPercent: warranty.gpPercent }
    );
  }

  return finalizeSummary(customer, internal, warranty);
}

function parseMoneyTokens(line: string): number[] {
  return (line.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map((n) =>
    parseFloat(n.replace(/,/g, ''))
  );
}

function classifyPayTypeLine(line: string): PayTypeKey | null {
  const upper = line.toUpperCase().replace(/\s+/g, ' ');
  if (/^CUSTOMER\s*PAY|^GUSTLOMER\s*PAY|^CUST\s*PAY/.test(upper)) return 'customer';
  if (/^INTERNAL\b/.test(upper)) return 'internal';
  if (/^WARR/i.test(upper) && !/^SERV/.test(upper)) return 'warranty';
  return null;
}

/** Fallback: sum advisor-level pay type rows (RO counts only; ELR/GP may be unreliable). */
function extractAdvisorLinePayTypes(reportText: string): OperationsPayTypeSummary | null {
  const totals: Record<PayTypeKey, { roCount: number; hoursSold: number; laborSold: number; grossLabor: number }> = {
    customer: { roCount: 0, hoursSold: 0, laborSold: 0, grossLabor: 0 },
    warranty: { roCount: 0, hoursSold: 0, laborSold: 0, grossLabor: 0 },
    internal: { roCount: 0, hoursSold: 0, laborSold: 0, grossLabor: 0 },
  };

  for (const line of reportText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || /^TOTAL\b/i.test(trimmed)) continue;

    const key = classifyPayTypeLine(trimmed);
    if (!key) continue;
    if (/SERV\s*CONTRACT/i.test(trimmed.toUpperCase())) continue;

    const nums = parseMoneyTokens(trimmed);
    if (nums.length < 2) continue;

    const roCount = Math.max(0, Math.round(nums[1] ?? nums[0] ?? 0));
    if (roCount <= 0 || roCount > 500) continue;

    totals[key].roCount += roCount;
  }

  const totalRo = totals.customer.roCount + totals.warranty.roCount + totals.internal.roCount;
  if (totalRo <= 0) return null;

  return finalizeSummary(
    buildSegment('customer', totals.customer.roCount, 0, 0, 0, totalRo),
    buildSegment('internal', totals.internal.roCount, 0, 0, 0, totalRo),
    buildSegment('warranty', totals.warranty.roCount, 0, 0, 0, totalRo)
  );
}

/** Aggregate Customer / Warranty / Internal pay rows from a DealerBuilt performance report. */
export function extractOperationsPayTypes(reportText: string): OperationsPayTypeSummary | null {
  if (!reportText?.trim()) return null;

  const storeSummary = extractStoreSummaryPayTypes(reportText);
  if (storeSummary) return storeSummary;

  return extractAdvisorLinePayTypes(reportText);
}

export function computeAdvisorMix(
  advisors: { name: string; laborSold?: number }[]
): AdvisorMixRow[] {
  const totalLabor = advisors.reduce((sum, a) => sum + (Number(a.laborSold) || 0), 0);
  if (totalLabor <= 0) return [];

  return advisors
    .map((a) => ({
      name: a.name,
      laborSold: Number(a.laborSold) || 0,
      mixPercent: round1(((Number(a.laborSold) || 0) / totalLabor) * 100),
    }))
    .filter((a) => a.laborSold > 0)
    .sort((a, b) => b.mixPercent - a.mixPercent);
}

export function payTypesToForecastSeed(payTypes: OperationsPayTypeSummary): ForecastPayTypeSeed {
  const { customer, warranty, internal } = payTypes;
  return {
    rawCounts: {
      cpCount: customer.roCount,
      warrCount: warranty.roCount,
      internalCount: internal.roCount,
    },
    cpMix: customer.mixPercent,
    warrMix: warranty.mixPercent,
    internalMix: internal.mixPercent,
    cpRate: customer.elr,
    cpGp: customer.gpPercent,
    warrRate: warranty.elr,
    warrGp: warranty.gpPercent,
    internalRate: internal.elr,
    internalGp: internal.gpPercent,
  };
}

export function applyForecastPayTypeSeed<T extends Record<string, number>>(
  inputs: T,
  seed: ForecastPayTypeSeed
): T {
  return {
    ...inputs,
    cpMix: Math.round(seed.cpMix),
    warrMix: Math.round(seed.warrMix),
    internalMix: Math.round(seed.internalMix),
    cpRate: seed.cpRate,
    cpGp: seed.cpGp,
    warrRate: seed.warrRate,
    warrGp: seed.warrGp,
    internalRate: seed.internalRate,
    internalGp: seed.internalGp,
  };
}

export function performanceDocId(dealerId: string, month: string): string {
  const baseId = dealerId === 'hyundai' ? 'advisorReports' : `advisorReports_${dealerId}`;
  return month === 'active' ? baseId : `${baseId}_archive_${month}`;
}

/** Previous calendar month archive key (e.g. July active → 2026-06). */
export function getPreviousArchiveMonthKey(referenceDate = new Date()): string {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  d.setMonth(d.getMonth() - 1);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${month}`;
}

export function formatArchiveMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
