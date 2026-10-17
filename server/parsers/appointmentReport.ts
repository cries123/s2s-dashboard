import { categorizeServiceText } from '../dms/parsers/serviceCategory.js';

export type AppointmentCategory = 'diagnosis' | 'oilChange' | 'recall' | 'misc';

export interface ParsedAppointment {
  confirmationKey: string;
  category: AppointmentCategory;
  services: string;
}

export interface AppointmentReportParseResult {
  reportDate: string | null;
  diagnosis: number;
  oilChange: number;
  recall: number;
  misc: number;
  total: number;
  appointments: ParsedAppointment[];
  parseMethod: 'deterministic';
}

/** Parse "For Jun 1, 2026" from PBS Appointment Details report header. */
export function extractReportDateFromAppointmentText(reportText: string): string | null {
  const match = reportText.match(/For\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!match) return null;

  const monthIndex = new Date(`${match[1]} 1, ${match[3]}`).getMonth();
  if (Number.isNaN(monthIndex)) return null;

  const year = match[3];
  const month = String(monthIndex + 1).padStart(2, '0');
  const day = String(parseInt(match[2], 10)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractServicesBlock(textFromKey: string): string {
  const match = textFromKey.match(/Services:\s*([\s\S]*?)(?:Notes:|Advisor\/Team:|DMS State:)/i);
  return (match?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

function hasScheduledServices(services: string): boolean {
  return services.replace(/\s/g, '').length > 0;
}

/** Categorize one appointment — the same rules as the PBS schedule (serviceCategory). */
export function categorizeAppointmentServices(services: string): AppointmentCategory {
  return categorizeServiceText(services).primary;
}

/**
 * Parse PBS "Appointment Details Report" text.
 * Counts only appointments with scheduled service lines (non-empty Services: field).
 */
export function parseAppointmentReportDeterministic(reportText: string): AppointmentReportParseResult {
  const reportDate = extractReportDateFromAppointmentText(reportText);

  const keyPattern = /\b(X[A-Z0-9]{9})\b/gi;
  const keyMatches: { key: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(reportText)) !== null) {
    keyMatches.push({ key: match[1].toUpperCase(), index: match.index });
  }

  const appointments: ParsedAppointment[] = [];

  for (let i = 0; i < keyMatches.length; i++) {
    const { key, index } = keyMatches[i];
    const end = i + 1 < keyMatches.length ? keyMatches[i + 1].index : reportText.length;
    const block = reportText.slice(index, end);
    const services = extractServicesBlock(block);

    if (!hasScheduledServices(services)) {
      continue;
    }

    appointments.push({
      confirmationKey: key,
      category: categorizeAppointmentServices(services),
      services: services.slice(0, 200),
    });
  }

  const counts = { diagnosis: 0, oilChange: 0, recall: 0, misc: 0 };
  for (const appt of appointments) {
    counts[appt.category]++;
  }

  return {
    reportDate,
    diagnosis: counts.diagnosis,
    oilChange: counts.oilChange,
    recall: counts.recall,
    misc: counts.misc,
    total: appointments.length,
    appointments,
    parseMethod: 'deterministic',
  };
}
