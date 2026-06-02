export type AppointmentCategory = 'diagnosis' | 'oilChange' | 'recall' | 'misc';

export interface AppointmentBreakdown {
  diagnosis: number;
  oilChange: number;
  recall: number;
  misc: number;
  total: number;
}

export interface ParsedAppointmentReport extends AppointmentBreakdown {
  parseMethod: 'deterministic' | 'ai';
  appointments?: Array<{ category: AppointmentCategory; services: string }>;
}

const DATE_CLUSTER_PATTERN =
  /\b\d{2}\/\d{2}\s+\d{2}\/\d{2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\b/i;

const VIN_PATTERN =
  /\b(?:5N|KMH|KM8|KND|1N4|3N1|4T1|5YJ|7SAY|WBA|1G1|2C3|1C4|JF1|YV1|SAJ|WDD|WDC|WDB)[A-Z0-9]{12,}\b/i;

const CONF_KEY_PATTERN = /\bX[A-Z0-9]{9}\b/i;

/** Extract one service description per appointment from PBS-style Appointment Details PDF text. */
export function extractServiceBlocks(reportText: string): string[] {
  const parts = reportText.split(/(?=Services:\s*)/i);

  const blocks: string[] = [];
  for (const part of parts.slice(1)) {
    let body = part.replace(/^Services:\s*/i, '');
    body = body.split(/(?=Services:\s*)|\f|Page \d+ of \d+/i)[0] ?? body;
    const cleaned = cleanServiceBlock(body);
    if (cleaned.length > 3) {
      blocks.push(cleaned);
    }
  }

  return blocks;
}

function cleanServiceBlock(raw: string): string {
  let body = raw.replace(/\s+/g, ' ').trim();

  const dateCluster = DATE_CLUSTER_PATTERN.exec(body);
  if (dateCluster?.index != null) {
    body = body.slice(0, dateCluster.index).trim().replace(/[,\s.]+$/, '');
  }

  body = body.split(VIN_PATTERN)[0]?.trim().replace(/[,\s.]+$/, '') ?? body;
  body = body.replace(/\bAdvisor\/Team:.*$/i, '').trim().replace(/[,\s.]+$/, '');
  body = body.replace(CONF_KEY_PATTERN, '').trim().replace(/[,\s.]+$/, '');

  return body;
}

/**
 * Categorize a single appointment's service description.
 *
 * Priority:
 * 1. diagnosis — "CUSTOMER STATES", explicit diagnose requests, or oil + customer-states together
 * 2. recall — RECALL, CAMPAIGN, or bulletin-style campaign codes
 * 3. oilChange — FULL SYNTHETIC or COMPLIMENTARY MAINTENANCE
 * 4. misc — everything else
 */
export function categorizeAppointmentService(servicesText: string): AppointmentCategory {
  const text = servicesText.toUpperCase();

  const hasCustomerStates =
    text.includes('CUSTOMER STATES') || text.includes('CUSTOMER STATE');
  const hasDiagnoseRequest = /CUSTOMER REQUEST(?:S|ED)? TO DIAGNO|REQUEST TO DIAGNO/i.test(
    servicesText
  );

  const hasRecallOrCampaign =
    /\bRECALL\b|\bCAMPAIGN\b/i.test(text) ||
    /\(\s*\d{2,4}\s*-\s*\d{2,3}[A-Z0-9]*\s*\)/.test(text) ||
    /ANC CLIP INS|SEAT BELT.*INS\s*\(/i.test(text);

  const hasOilChange =
    /FULL SYNTHETIC|COMPLIMENTARY MAINTENANCE|HYUNDAI COMPLIMENTARY/i.test(text);

  if (hasCustomerStates || hasDiagnoseRequest) {
    return 'diagnosis';
  }
  if (hasRecallOrCampaign) {
    return 'recall';
  }
  if (hasOilChange) {
    return 'oilChange';
  }
  return 'misc';
}

export function parseAppointmentReportDeterministic(
  reportText: string,
  includeDetails = false
): ParsedAppointmentReport {
  const serviceBlocks = extractServiceBlocks(reportText);

  const breakdown: AppointmentBreakdown = {
    diagnosis: 0,
    oilChange: 0,
    recall: 0,
    misc: 0,
    total: 0,
  };

  const appointments: ParsedAppointmentReport['appointments'] = includeDetails
    ? []
    : undefined;

  for (const services of serviceBlocks) {
    const category = categorizeAppointmentService(services);
    breakdown[category] += 1;
    appointments?.push({ category, services });
  }

  breakdown.total =
    breakdown.diagnosis + breakdown.oilChange + breakdown.recall + breakdown.misc;

  return {
    ...breakdown,
    parseMethod: 'deterministic',
    appointments,
  };
}

export const APPOINTMENT_AI_CATEGORIZATION_RULES = `Analyze this Service Appointment Details Report (PBS / Xtime style).

Count each UNIQUE appointment exactly once. Each appointment has a "Services:" line — use that line (only that appointment's services, not bleed-over from the next row).

Categorize each appointment into exactly ONE bucket:

1. diagnosis (highest priority when present):
   - Contains "CUSTOMER STATES" or "CUSTOMER STATE"
   - Contains "CUSTOMER REQUEST TO DIAGNOSE" or similar explicit diagnosis request
   - If an appointment has BOTH an oil change (full synthetic / complimentary) AND customer-states/diagnosis wording → diagnosis

2. recall:
   - Contains "RECALL" or "CAMPAIGN"
   - Contains bulletin / campaign codes like (26-01-042H), seat belt clip campaigns, etc.
   - If oil change AND recall/campaign with NO customer-states wording → recall

3. oilChange:
   - "FULL SYNTHETIC" oil & filter change
   - "HYUNDAI COMPLIMENTARY MAINTENANCE" or "COMPLIMENTARY MAINTENANCE"
   - NOT generic "replace oil" or "factory required" without full synthetic / complimentary wording

4. misc:
   - Brake fluid, tire replacement, factory required maintenance, car wash only, cooling system, etc.
   - Generic maintenance requests without complimentary / full synthetic wording

The four category counts MUST sum to total. Return JSON only.`;
