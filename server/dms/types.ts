export type DmsProvider = 'pbs' | 'dealerbuilt';

export interface AppointmentParseResult {
  diagnosis: number;
  oilChange: number;
  recall: number;
  misc: number;
  total: number;
}

export interface PerformanceAdvisorRow {
  name: string;
  soCount: number;
  hrsSold: number;
  laborSold: number;
  grossLabor: number;
  partsSold: number;
  grossParts: number;
  totalSales: number;
  gpPercent: number;
  elr: number;
  upsells: unknown[];
}

export interface PerformanceParseResult {
  advisors: PerformanceAdvisorRow[];
  totals: {
    totalSales: number;
    totalLabor: number;
    totalGross: number;
    totalParts: number;
    totalGrossParts: number;
    totalHrs: number;
  };
}

export interface TechnicianParseResult {
  technicians: {
    techName: string;
    clockedHours: number;
    flaggedHours: number;
    efficiency: number;
  }[];
}
