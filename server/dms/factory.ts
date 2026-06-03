import type { DmsProvider } from './types';
import { parseDealerBuiltAppointmentsReport, parsePBSAppointmentsReport } from './parsers/appointments';
import { parseDealerBuiltPerformanceReport, parsePBSPerformanceReport } from './parsers/performance';
import { parseDealerBuiltTechnicianReport, parsePBSTechnicianReport } from './parsers/technician';
import type { AppointmentParseResult, PerformanceParseResult, TechnicianParseResult } from './types';

export type { DmsProvider, AppointmentParseResult, PerformanceParseResult, TechnicianParseResult };

export function normalizeDmsProvider(value?: string | null): DmsProvider {
  if (value === 'dealerbuilt') return 'dealerbuilt';
  return 'pbs';
}

export function parseAppointmentsReport(text: string, provider: DmsProvider): AppointmentParseResult {
  switch (provider) {
    case 'dealerbuilt':
      return parseDealerBuiltAppointmentsReport(text);
    case 'pbs':
    default:
      return parsePBSAppointmentsReport(text);
  }
}

export function parsePerformanceReport(text: string, provider: DmsProvider): PerformanceParseResult {
  switch (provider) {
    case 'dealerbuilt':
      return parseDealerBuiltPerformanceReport(text);
    case 'pbs':
    default:
      return parsePBSPerformanceReport(text);
  }
}

export function parseTechnicianReport(text: string, provider: DmsProvider): TechnicianParseResult {
  switch (provider) {
    case 'dealerbuilt':
      return parseDealerBuiltTechnicianReport(text);
    case 'pbs':
    default:
      return parsePBSTechnicianReport(text);
  }
}
