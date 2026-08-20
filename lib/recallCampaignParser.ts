export interface RecallCampaignLeadInput {
  customerName: string;
  phone: string | null;
  email: string | null;
  vin: string;
  year: string;
  make: string;
  model: string;
  campaignNumber: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface RecallCampaignParseMeta {
  campaignNumber: string;
  campaignStatus?: string;
  campaignLaunchDate?: string;
  campaignDescription?: string;
  reportGeneratedOn?: string;
  dealerName?: string;
}

export interface RecallCampaignParseResult {
  meta: RecallCampaignParseMeta;
  leads: RecallCampaignLeadInput[];
  duplicateCount: number;
}

const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/;
const PHONE_RE = /^(\d{3}-\d{3}-\d{4})$/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const US_STATES = new Set([
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
]);

const HEADER_WORDS = new Set([
  'Customer', 'Phone', 'VIN', 'Year', 'Make', 'Model', 'Campaign', 'Number', 'Detail',
  'Address', 'City', 'State', 'Zip', 'Email', 'Recall', 'Details', 'Report', 'Generated',
  'On', 'Launch', 'Date', 'Dealer', 'Code', 'Org', 'Status', 'Open', 'Description',
  'Completion', 'Flag', 'Communication', 'Monthly', 'Owner', 'Summary', 'For', 'questions',
  'Please', 'contact', 'Program', 'Headquarters', 'Demand', 'Blue', 'Link', 'MVHR',
]);

const ADDRESS_HINTS = /\b(ST|STREET|RD|ROAD|AVE|AVENUE|DR|DRIVE|CT|COURT|HWY|HIGHWAY|APT|UNIT|WAY|LN|BLVD|CIR|CIRCLE|TER|TERRACE|PL|PLACE|#)\b/i;
const BAD_NAME_HINTS = /\b(HYUNDAI|SANTA FE|SONATA|TUCSON|PALISADE|KONA|ELANTRA|SANTA MARIA|LOMPOC|NIPOMO|GUADALUPE|ARROYO GRANDE|SANTA BARBARA|LOS ALAMOS|SANTA YNEZ|VANDENBERG)\b/i;

export function normalizeRecallPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '000-000-0000') return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 10) return `+${digits}`;
  return null;
}

export function normalizeRecallEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.replace(/\s+/g, '').match(EMAIL_RE);
  return match ? match[0].toLowerCase() : null;
}

function isLikelyPersonName(line: string): boolean {
  const ln = line.trim();
  if (!ln || ln.length < 3 || ln.length > 60) return false;
  if (PHONE_RE.test(ln) || EMAIL_RE.test(ln) || VIN_RE.test(ln) || ZIP_RE.test(ln)) return false;
  if (US_STATES.has(ln) || HEADER_WORDS.has(ln)) return false;
  if (/\d/.test(ln) || ADDRESS_HINTS.test(ln) || BAD_NAME_HINTS.test(ln)) return false;
  if (!/^[A-Za-z][A-Za-z\s'\-\.]+$/.test(ln)) return false;
  const words = ln.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'\-\.]*$/.test(w) || /^[A-Z]{2,}$/.test(w));
}

function pickNameFromWindow(lines: string[], vinIndex: number): string {
  const candidates: string[] = [];
  const start = Math.max(0, vinIndex - 30);
  for (let j = start; j < vinIndex; j++) {
    const ln = lines[j];
    if (isLikelyPersonName(ln)) candidates.push(ln.trim());
  }
  if (candidates.length === 0) return '';
  return candidates[candidates.length - 1];
}

function extractMeta(text: string): RecallCampaignParseMeta {
  const meta: RecallCampaignParseMeta = { campaignNumber: 'UNKNOWN' };
  const campaignMatch = text.match(/Campaign Number:\s*(\S+)/i);
  if (campaignMatch) meta.campaignNumber = campaignMatch[1].trim();
  const statusMatch = text.match(/Campaign Number:\s*\S+\s+Status\s*:\s*(\S+)/i);
  if (statusMatch) meta.campaignStatus = statusMatch[1].trim();
  const launchMatch = text.match(/Campaign Launch Date:\s*(\S+)/i);
  if (launchMatch) meta.campaignLaunchDate = launchMatch[1].trim();
  const reportMatch = text.match(/Report Generated On:\s*(\S+)/i);
  if (reportMatch) meta.reportGeneratedOn = reportMatch[1].trim();
  const dealerMatch = text.match(/^(Hyundai[^\n]+)/m);
  if (dealerMatch) meta.dealerName = dealerMatch[1].trim();

  const descMatch = text.match(
    /Campaign Description\s*\n([\s\S]+?)(?:\nCampaign\s*\nLaunch Date|\nFor questions)/i
  );
  if (descMatch) {
    meta.campaignDescription = descMatch[1].replace(/\s+/g, ' ').trim().slice(0, 500);
  }
  return meta;
}

function parseVehicleFields(lines: string[], vinIndex: number) {
  let year = '';
  let make = '';
  let model = '';
  let campaign = '';

  for (let j = vinIndex + 1; j < Math.min(vinIndex + 8, lines.length); j++) {
    const ln = lines[j];
    if (!year && /^\d{4}$/.test(ln)) year = ln;
    else if (year && !make && /^[A-Za-z]+$/.test(ln) && ln.length > 2) make = ln;
    else if (make && !model && /^[A-Za-z0-9\s]+$/.test(ln) && !/^\d+$/.test(ln)) {
      if (!model) model = ln;
      else model = `${model} ${ln}`.trim();
    }
    else if (/^[A-Z0-9]{2,5}$/.test(ln) && ln !== year) {
      campaign = ln;
      break;
    }
  }

  model = model.replace(/\s+\d[A-Z0-9]{1,4}$/, '').trim();
  return { year, make, model, campaign };
}

function mergeLeadRecords(
  existing: RecallCampaignLeadInput,
  incoming: RecallCampaignLeadInput
): RecallCampaignLeadInput {
  return {
    ...existing,
    customerName: isLikelyPersonName(incoming.customerName)
      ? incoming.customerName
      : existing.customerName || incoming.customerName,
    phone: existing.phone || incoming.phone,
    email: existing.email || incoming.email,
    year: existing.year || incoming.year,
    make: existing.make || incoming.make,
    model: existing.model || incoming.model,
    address: existing.address || incoming.address,
    city: existing.city || incoming.city,
    state: existing.state || incoming.state,
    zip: existing.zip || incoming.zip,
  };
}

export function dedupeRecallCampaignLeads(leads: RecallCampaignLeadInput[]): {
  leads: RecallCampaignLeadInput[];
  duplicateCount: number;
} {
  const byKey = new Map<string, RecallCampaignLeadInput>();
  let duplicateCount = 0;

  for (const lead of leads) {
    const vin = lead.vin.toUpperCase();
    const campaign = lead.campaignNumber.toUpperCase();
    const key = `${vin}_${campaign}`;
    const normalized: RecallCampaignLeadInput = {
      ...lead,
      vin,
      campaignNumber: campaign,
      phone: normalizeRecallPhone(lead.phone),
      email: normalizeRecallEmail(lead.email),
      customerName: lead.customerName.trim(),
    };

    if (byKey.has(key)) {
      duplicateCount += 1;
      byKey.set(key, mergeLeadRecords(byKey.get(key)!, normalized));
    } else {
      byKey.set(key, normalized);
    }
  }

  return { leads: Array.from(byKey.values()), duplicateCount };
}

export function parseRecallCampaignReportText(reportText: string): RecallCampaignParseResult {
  const meta = extractMeta(reportText);
  const lines = reportText.split('\n').map((l) => l.trim());
  const rawLeads: RecallCampaignLeadInput[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const vinMatch = line.match(VIN_RE);
    if (!vinMatch || line !== vinMatch[1]) continue;

    const vin = vinMatch[1].toUpperCase();
    let phone: string | null = null;
    let email: string | null = null;

    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (PHONE_RE.test(lines[j])) {
        phone = normalizeRecallPhone(lines[j]);
      }
      const em = normalizeRecallEmail(lines[j]);
      if (em) email = em;
    }

    for (let j = Math.max(0, i - 25); j < i; j++) {
      const em = normalizeRecallEmail(lines[j]);
      if (em) email = em;
    }

    const { year, make, model, campaign } = parseVehicleFields(lines, i);
    const customerName = pickNameFromWindow(lines, i);

    rawLeads.push({
      customerName,
      phone,
      email,
      vin,
      year,
      make,
      model,
      campaignNumber: campaign || meta.campaignNumber,
    });
  }

  const { leads, duplicateCount } = dedupeRecallCampaignLeads(rawLeads);
  return { meta, leads, duplicateCount };
}

export function recallCampaignLeadDocId(
  dealershipId: string,
  vin: string,
  campaignNumber: string
): string {
  const safe = `${dealershipId}_${vin}_${campaignNumber}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return safe.slice(0, 200);
}
