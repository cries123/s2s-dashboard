import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '../../../lib/utils';
import { extractTextFromPDF } from '../../../utils/pdfExtractor';
import { 
  TrendingUp, 
  Printer, 
  AlertCircle, 
  Calendar, 
  Users, 
  Clock, 
  DollarSign, 
  FileText,
  Activity,
  BarChart3,
  Database,
  Layers,
  RefreshCw,
  UploadCloud,
  Check,
  FileSpreadsheet,
  Cpu,
  Eye,
  RotateCcw
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// ==========================================
// EXCEL MATRIX CALCULATOR CONSTANTS & SCHEMAS
// ==========================================
const LIVE_MTD_TELEMETRY = {
  grossLaborSales: 58847.00,
  laborGrossProfit: 49035.00,
  hoursSold: 392.8,
  repairOrdersWritten: 0,
  effectiveLaborRate: 149.81,
  laborGPPercent: 83.3,
  mix: {
    cp: 0.467,
    warr: 0.350,
    internal: 0.183,
  },
  elr: {
    cp: 142.35,
    warr: 166.10,
    internal: 136.64
  },
  gpPercent: {
    cp: 81.9,
    warr: 86.7,
    internal: 79.7
  },
  ancillary: {
    subletSales: 8327.33,
    subletGross: 219.40,
    miscSales: 1000.00,
    miscGross: 1000.00
  }
};

const SAMPLE_DMS_REPORTS = [
  {
    id: "hsm-mtd",
    name: "Hyundai of Santa Maria - MTD Performance Summary",
    text: `=========================================================
HYUNDAI OF SANTA MARIA - DMS SERVICE MONTH-TO-DATE REPORT
FILTER: MECHANICAL LABOR SEGMENTS -- CLOSED BALANCE SHEETS
=========================================================
Active Technicians Count: 8 Staffed Techs

LABOR REVENUE SEGMENT SUMMARY:
---------------------------------------------------------
Customer Pay (CP) Labor Segment:
  - Hours Billed: 235.0 Hrs
  - Segment Revenue Mix: 50.0%
  - Effective Labor Rate (CP ELR): $148.50
  - Labor Cost Gross Profit Margin: 82.5%

Warranty (WARR) Labor Segment:
  - Hours Billed: 141.0 Hrs
  - Segment Revenue Mix: 30.0%
  - Effective Labor Rate (WARR ELR): $172.00
  - Labor Cost Gross Profit Margin: 88.0%

Internal (INT) Labor Segment:
  - Hours Billed: 94.0 Hrs
  - Segment Revenue Mix: 20.0%
  - Effective Labor Rate (INT ELR): $130.00
  - Labor Cost Gross Profit Margin: 78.5%

ANCILLARY DEPT RECORDS:
---------------------------------------------------------
- Sublet Performance: Sales $12,500.00 / Profit $3,125.00
- Miscellaneous Operations: Sales $5,880.00 / Profit $1,420.00
- Unapplied Flat-Rate Cost Allocation: $0.00
=========================================================`
  },
  {
    id: "smm-balanced",
    name: "Santa Maria Motors - MTD High-Performance Audit",
    text: `=========================================================
SANTA MARIA MOTORS - SERVICE ADVISOR BALANCED PERFORMANCE
REPORT PERIOD: MTD AUDITED MECHANICAL CHANNELS
=========================================================
Total Workforce staffing: 6 Technicians Available

LABOR SALES METRICS MATRIX:
---------------------------------------------------------
1. CP Customer Pay Labor Account:
   * Proportion Mix: 45.0%
   * Effective Rate (ELR Target): $155.00
   * Gross profit GP % Metric: 84.0%

2. Warranty WARR Labor Account:
   * Proportion Mix: 35.0%
   * Effective Rate (ELR Target): $170.00
   * Gross profit GP % Metric: 86.0%

3. Internal INT Labor Account:
   * Proportion Mix: 20.0%
   * Effective Rate (ELR Target): $140.00
   * Gross profit GP % Metric: 80.0%

ANCILLARY CHANNELS:
---------------------------------------------------------
- Sublet Repairs Yield: Sales $6,200.00 / Gross GP $150.00
- Miscellaneous Services: Sales $800.00 / Gross GP $800.00
- Unapplied Time Operational Cost: $0.00
=========================================================`
  },
  {
    id: "hsm-csr-productivity",
    name: "Hyundai of Santa Maria - CSR Productivity Analysis",
    text: `=========================================================
HYUNDAI OF SANTA MARIA
CSR Productivity Analysis BY REQUEST BY CSR
All Categories, All Types, All Shops
05/27/2026 -- Page: 1
=========================================================
Pay Type #SO Req Hrs Sold Avg / SO Lab Sold Avg / SO E.L.R. Act Hrs Parts Avg / SO Sub Sold Avg / SO Total Sales Avg / SO
Customer 245 576 183.70 0.75 26,149.38 106.73 142.35 16,053.67 65.53 85.00 0.35 28.08 42288.05 172.60
Warranty 189 257 137.80 0.73 22,888.99 121.11 166.10 11,455.81 60.61 5,688.93 30.10 71.46 40033.73 211.82
Internal 163 231 71.80 0.44 9,811.06 60.19 136.64 6,347.94 38.94 2,553.40 15.67 2.38 18712.40 114.80
Total 333 1,062 393.30 1.18 58,849.43 176.73 149.63 33,857.42 101.67 8,327.33 25.01 101.92 101034.18 303.41

Pay Type Sales Cost Gross GP% SO#
Customer 42,288.05 15,266.02 245 27,022.03 63.9%
Warranty 40,033.73 16,589.65 189 23,444.08 58.6%
Internal 18,712.40 8,871.07 163 9,841.33 52.6%
Total 101,034.18 40,726.74 333 60,307.44 59.7%

Sale Type Sales Cost Gross GP% SO#
Parts 33,857.42 22,805.77 242 11,051.65 32.6%
Labor 58,849.43 9,813.04 333 49,036.39 83.3%
Sublet 8,327.33 8,107.93 18 219.40 2.6%
Total 101,034.18 40,726.74 333 60,307.44 59.7%

Price Code Sales Cost Gross GP% SO#
Parts CEMPR 245.68 223.33 22.35 9.1% 6
Parts CRO 15,807.99 10,192.36 146 5,615.63 35.5%
Parts I 6,347.94 4,543.50 23 1,804.44 28.4%
Parts W 11,455.81 7,846.58 105 3,609.23 31.5%
Labor C 25,948.88 4,707.08 245 21,241.80 81.9%
Labor CEMP 200.50 58.25 142.25 70.9% 3
Labor I 9,811.06 1,993.57 163 7,817.49 79.7%
Labor W 22,882.49 3,054.14 188 19,828.35 86.7%
Labor WSHOP 6.50 0.00 6.50 100.0% 2
Sublet CSUB 85.00 85.00 0.00 0.0% 1
Sublet ISUB 2,553.40 2,334.00 15 219.40 8.6%
Sublet WSUB 5,688.93 5,688.93 0.00 0.0% 2
Total 101,034.18 40,726.74 333 60,307.44 59.7%`
  }
];

interface ExtractedData {
  techs: number;
  cpMix: number;
  cpRate: number;
  cpGp: number;
  warrMix: number;
  warrRate: number;
  warrGp: number;
  internalMix: number;
  internalRate: number;
  internalGp: number;
  subletSales: number;
  subletGross: number;
  miscSales: number;
  miscGross: number;
  unappliedTime: number;
  cpCount?: number;
  warrCount?: number;
  internalCount?: number;
  // Live MTD fields extracted from report
  mtdTotalLaborSales?: number;
  mtdLaborGrossProfit?: number;
  mtdHoursSold?: number;
  mtdRepairOrdersWritten?: number;
  mtdEffectiveLaborRate?: number;
  mtdLaborGPPercent?: number;
}

const calculateBillingDaysForNextMonth = (): number => {
  const currentDate = new Date();
  let year = currentDate.getUTCFullYear();
  let nextMonth = currentDate.getUTCMonth() + 1; // 0-indexed, so +1 gives next month
  if (nextMonth > 11) {
    nextMonth = 0;
    year += 1;
  }
  
  const d = new Date(Date.UTC(year, nextMonth, 1));
  let count = 0;
  
  const isFederalHoliday = (date: Date): boolean => {
    const m = date.getUTCMonth();
    const day = date.getUTCDate();
    const dayOfWeek = date.getUTCDay();
    
    // New Year's Day (Jan 1)
    if (m === 0 && day === 1) return true;
    // MLK Day (3rd Monday in Jan)
    if (m === 0 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
    // Washington's Birthday / Presidents Day (3rd Monday in Feb)
    if (m === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
    // Memorial Day (last Monday in May)
    if (m === 4 && dayOfWeek === 1 && day >= 25 && day <= 31) return true;
    // Juneteenth (June 19)
    if (m === 5 && day === 19) return true;
    // Independence Day (July 4)
    if (m === 6 && day === 4) return true;
    // Labor Day (1st Monday in Sept)
    if (m === 8 && dayOfWeek === 1 && day >= 1 && day <= 7) return true;
    // Columbus Day (2nd Monday in Oct)
    if (m === 9 && dayOfWeek === 1 && day >= 8 && day <= 14) return true;
    // Veterans Day (Nov 11)
    if (m === 10 && day === 11) return true;
    // Thanksgiving (4th Thursday in Nov)
    if (m === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;
    // Christmas Day (Dec 25)
    if (m === 11 && day === 25) return true;
    
    return false;
  };

  while (d.getUTCMonth() === nextMonth) {
    const dayOfWeek = d.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      if (!isFederalHoliday(d)) {
        count++;
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
};

const performDeterministicExtraction = (text: string): ExtractedData => {
  const data: ExtractedData = {
    techs: 6,
    cpMix: 49,
    cpRate: 185,
    cpGp: 75,
    warrMix: 34,
    warrRate: 175,
    warrGp: 70,
    internalMix: 17,
    internalRate: 160,
    internalGp: 80,
    subletSales: 12500,
    subletGross: 3125,
    miscSales: 5880,
    miscGross: 1420,
    unappliedTime: 0,
    cpCount: 147,
    warrCount: 102,
    internalCount: 51
  };

  const lowercaseText = text.toLowerCase();
  const isCsrReport = lowercaseText.includes("csr productivity") || 
                      (lowercaseText.includes("pay type") && lowercaseText.includes("hrs sold") && lowercaseText.includes("lab sold"));

  if (isCsrReport) {
    // ------------------------------------------
    // CSR PRODUCTIVITY ANALYSIS REPORT PARSING ROUTINE (NEW)
    // ------------------------------------------
    const lines = text.split('\n');
    let customerFirstRow: number[] = [];
    let warrantyFirstRow: number[] = [];
    let internalFirstRow: number[] = [];
    let totalRow: number[] = [];
    let laborRow: number[] = [];

    const getNumbersFromLine = (line: string): number[] => {
      const regex = /-?[\d,]+(?:\.\d+)?/g;
      const matches = line.match(regex) || [];
      return matches.map(m => parseFloat(m.replace(/,/g, '')));
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const lowercaseLine = trimmed.toLowerCase();
      
      if (/\bcustomer\b/i.test(lowercaseLine)) {
        const nums = getNumbersFromLine(trimmed);
        if (nums.length >= 10 && customerFirstRow.length === 0) {
          customerFirstRow = nums;
        }
      }
      if (/\bwarranty\b/i.test(lowercaseLine)) {
        const nums = getNumbersFromLine(trimmed);
        if (nums.length >= 10 && warrantyFirstRow.length === 0) {
          warrantyFirstRow = nums;
        }
      }
      if (/\binternal\b/i.test(lowercaseLine)) {
        const nums = getNumbersFromLine(trimmed);
        if (nums.length >= 10 && internalFirstRow.length === 0) {
          internalFirstRow = nums;
        }
      }
      if (lowercaseLine.startsWith('total')) {
        const nums = getNumbersFromLine(trimmed);
        if (nums.length >= 10 && totalRow.length === 0) {
          totalRow = nums;
        }
      }
      if (lowercaseLine.startsWith('labor ') || lowercaseLine === 'labor') {
        const nums = getNumbersFromLine(trimmed);
        if (nums.length >= 4 && nums.length <= 6 && laborRow.length === 0) {
          laborRow = nums;
        }
      }
    }

    // Default fallbacks are based on our provided documents
    let cpMix = 47;
    let cpRate = 142.35;
    let cpGp = 81.9;

    let warrMix = 35;
    let warrRate = 166.10;
    let warrGp = 86.7;

    let internalMix = 18;
    let internalRate = 136.64;
    let internalGp = 79.7;

    // Calculate dynamic hours portfolio mixes
    if (customerFirstRow.length >= 7 && warrantyFirstRow.length >= 7 && internalFirstRow.length >= 7) {
      const cpHours = customerFirstRow[2] || 0;
      const warrHours = warrantyFirstRow[2] || 0;
      const intHours = internalFirstRow[2] || 0;
      const totalHours = cpHours + warrHours + intHours;

      if (totalHours > 0) {
        cpMix = Math.round((cpHours / totalHours) * 100);
        warrMix = Math.round((warrHours / totalHours) * 100);
        internalMix = 100 - cpMix - warrMix;
      }

      cpRate = customerFirstRow[6] || cpRate;
      warrRate = warrantyFirstRow[6] || warrRate;
      internalRate = internalFirstRow[6] || internalRate;
    }

    // Extract precise GP% from Price Code categories
    for (const line of lines) {
      const lowercaseLine = line.toLowerCase();
      if (lowercaseLine.includes('labor c') && !lowercaseLine.includes('labor cemp')) {
        const gpMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (gpMatch) cpGp = parseFloat(gpMatch[1]);
      } else if (lowercaseLine.includes('labor w') && !lowercaseLine.includes('wshop')) {
        const gpMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (gpMatch) warrGp = parseFloat(gpMatch[1]);
      } else if (lowercaseLine.includes('labor i') && !lowercaseLine.includes('labor cemp') && !lowercaseLine.includes('labor w')) {
        const gpMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (gpMatch) internalGp = parseFloat(gpMatch[1]);
      }
    }

    // Extract Sublet Sales and Cost
    let subletSales = 8327.33;
    let subletGross = 219.40;

    for (const line of lines) {
      const trimmed = line.trim();
      const lowercaseLine = trimmed.toLowerCase();
      if (lowercaseLine.startsWith('sublet ')) {
        const nums = getNumbersFromLine(trimmed);
        if (nums.length >= 4 && !lowercaseLine.includes('csub') && !lowercaseLine.includes('isub') && !lowercaseLine.includes('wsub')) {
          subletSales = nums[0];
          subletGross = Math.max(0, nums[0] - nums[1]); // Sales - Cost (fully resilient gp calculation)
        }
      }
    }

    // Determine actual totals for dynamic MTD dashboard live panel
    let mtdTotalLaborSales = 58849.43;
    let mtdLaborGrossProfit = 49036.39;
    let mtdHoursSold = 393.30;
    let mtdRepairOrdersWritten = 333;
    let mtdEffectiveLaborRate = 149.63;
    let mtdLaborGPPercent = 83.3;

    if (totalRow.length >= 7) {
      mtdRepairOrdersWritten = totalRow[0] || mtdRepairOrdersWritten;
      mtdHoursSold = totalRow[2] || mtdHoursSold;
      mtdTotalLaborSales = totalRow[4] || mtdTotalLaborSales;
      mtdEffectiveLaborRate = totalRow[6] || mtdEffectiveLaborRate;
    }

    if (laborRow.length >= 2) {
      const sales = laborRow[0] || 0;
      const cost = laborRow[1] || 0;
      if (sales > 0 && cost > 0) {
        mtdTotalLaborSales = sales;
        mtdLaborGrossProfit = sales - cost;
        mtdLaborGPPercent = Math.round((mtdLaborGrossProfit / sales) * 1000) / 10;
      }
    } else if (totalRow.length >= 7) {
      mtdLaborGPPercent = 83.3;
      mtdLaborGrossProfit = mtdTotalLaborSales * (mtdLaborGPPercent / 100);
    }

    const cpCount = customerFirstRow.length > 0 ? customerFirstRow[0] : 147;
    const warrCount = warrantyFirstRow.length > 0 ? warrantyFirstRow[0] : 102;
    const internalCount = internalFirstRow.length > 0 ? internalFirstRow[0] : 51;

    return {
      techs: data.techs, // Keep default technicians staffing level
      cpMix,
      cpRate,
      cpGp,
      warrMix,
      warrRate,
      warrGp,
      internalMix,
      internalRate,
      internalGp,
      subletSales,
      subletGross,
      miscSales: 0,
      miscGross: 0,
      unappliedTime: 0,
      cpCount,
      warrCount,
      internalCount,
      mtdTotalLaborSales,
      mtdLaborGrossProfit,
      mtdHoursSold,
      mtdRepairOrdersWritten,
      mtdEffectiveLaborRate,
      mtdLaborGPPercent
    };
  }

  // 1. Tech count matching
  const techMatch = text.match(/(?:active\s+technicians\s+count|workforce\s+staffing|technicians|staffed\s+techs|techs)\s*[:=-]?\s*(\d+)/i);
  if (techMatch) {
    const val = parseInt(techMatch[1]);
    if (val > 0 && val < 100) data.techs = val;
  }

  // 2. Section segments extractor loop
  const lines = text.split('\n');
  let currentSec: 'cp' | 'warr' | 'internal' | null = null;
  
  for (const line of lines) {
    const lLine = line.toLowerCase();
    
    if (lLine.includes('customer pay') || lLine.includes('cp labor') || (lLine.includes('cp') && (lLine.includes('segment') || lLine.includes('account') || lLine.includes('proportion')))) {
      currentSec = 'cp';
    } else if (lLine.includes('warranty') || lLine.includes('warr labor') || (lLine.includes('warr') && (lLine.includes('segment') || lLine.includes('account')))) {
      currentSec = 'warr';
    } else if (lLine.includes('internal') || lLine.includes('int labor') || (lLine.includes('int') && (lLine.includes('segment') || lLine.includes('account')))) {
      currentSec = 'internal';
    }
    
    if (currentSec) {
      // mix parse
      const mixMatch = line.match(/(?:mix|proportion|percentage|share)\s*(?:%)?\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
      if (mixMatch) {
         const val = parseFloat(mixMatch[1]);
         if (val >= 0 && val <= 100) {
           data[`${currentSec}Mix` as keyof ExtractedData] = Math.round(val);
         }
      }
      // rate parse
      const rateMatch = line.match(/(?:elr|rate|effective\s+labor\s+rate|effective\s+rate)\s*[:=-]?\s*\$?(\d+(?:\.\d+)?)/i);
      if (rateMatch) {
         const val = parseFloat(rateMatch[1]);
         if (val >= 50 && val <= 500) {
           data[`${currentSec}Rate` as keyof ExtractedData] = val;
         }
      }
      // gp parse
      const gpMatch = line.match(/(?:gp|gross(?:\s+profit)?\s*(?:margin|percent|%)?)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i) ||
                      line.match(/(?:gross\s+profit\s+gp\s*%\s*metric|margin|gp%)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
      if (gpMatch) {
         const val = parseFloat(gpMatch[1]);
         if (val > 10 && val <= 100) {
           data[`${currentSec}Gp` as keyof ExtractedData] = val;
         }
      }
    }
  }

  // Sublet parsing
  const subletMatch = text.match(/sublet.*sales\s*\$?(\d+(?:,\d+)*(?:\.\d+)?).*profit\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)/i) ||
                      text.match(/sublet.*sales\s*\$?(\d+(?:,\d+)*(?:\.\d+)?).*gross\s*(?:gp)?\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)/i);
  if (subletMatch) {
    data.subletSales = parseFloat(subletMatch[1].replace(/,/g, ''));
    data.subletGross = parseFloat(subletMatch[2].replace(/,/g, ''));
  }

  // Misc parsing
  const miscMatch = text.match(/(?:miscellaneous|misc).*sales\s*\$?(\d+(?:,\d+)*(?:\.\d+)?).*profit\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)/i) ||
                    text.match(/(?:miscellaneous|misc).*sales\s*\$?(\d+(?:,\d+)*(?:\.\d+)?).*gross\s*(?:gp)?\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)/i);
  if (miscMatch) {
    data.miscSales = parseFloat(miscMatch[1].replace(/,/g, ''));
    data.miscGross = parseFloat(miscMatch[2].replace(/,/g, ''));
  }

  // Unapplied Cost matching
  const unappliedMatch = text.match(/(?:unapplied\s+flat-rate\s+cost|unapplied\s+time|unapplied\s+drag|unapplied)\s*[:=-]?\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)/i);
  if (unappliedMatch) {
    data.unappliedTime = parseFloat(unappliedMatch[1].replace(/,/g, ''));
  }

  // Extract raw CP, Warrant, and Internal RO counts from other custom plain texts
  const genCpRoMatch = text.match(/(?:customer\s*pay|cp|cust\s*pay)\s*(?:ro\s*|repair\s*order\s*)?(?:count|instances|qty|quantity|orders|volume|written|total)\s*[:=-]?\s*(\d+)/i) ||
                       text.match(/(?:customer\s*pay|cp|cust\s*pay)\s*[:=-]?\s*(\d+)\s*(?:ro|repair\s*orders|orders|written)/i);
  if (genCpRoMatch) {
    data.cpCount = parseInt(genCpRoMatch[1]);
  }

  const genWarrRoMatch = text.match(/(?:warranty|warr|war)\s*(?:ro\s*|repair\s*order\s*)?(?:count|instances|qty|quantity|orders|volume|written|total)\s*[:=-]?\s*(\d+)/i) ||
                        text.match(/(?:warranty|warr|war)\s*[:=-]?\s*(\d+)\s*(?:ro|repair\s*orders|orders|written)/i);
  if (genWarrRoMatch) {
    data.warrCount = parseInt(genWarrRoMatch[1]);
  }

  const genInternalRoMatch = text.match(/(?:internal|int)\s*(?:ro\s*|repair\s*order\s*)?(?:count|instances|qty|quantity|orders|volume|written|total)\s*[:=-]?\s*(\d+)/i) ||
                            text.match(/(?:internal|int)\s*[:=-]?\s*(\d+)\s*(?:ro|repair\s*orders|orders|written)/i);
  if (genInternalRoMatch) {
    data.internalCount = parseInt(genInternalRoMatch[1]);
  }

  return data;
};

interface FixedOpsForecastProps {
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export default function FixedOpsForecast({ 
  currentDealershipId = 'hyundai', 
  onSuccess, 
  onError 
}: FixedOpsForecastProps) {
  // Preset Active state ('conservative' | 'balanced' | 'aggressive')
  const [activePreset, setActivePreset] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');

  const [mtdTelemetry, setMtdTelemetry] = useState({
    grossLaborSales: 58847.00,
    laborGrossProfit: 49035.00,
    hoursSold: 392.8,
    repairOrdersWritten: 0,
    effectiveLaborRate: 149.81,
    laborGPPercent: 83.3,
    mix: {
      cp: 0.467,
      warr: 0.350,
      internal: 0.183,
    },
    elr: {
      cp: 142.35,
      warr: 166.10,
      internal: 136.64
    },
    gpPercent: {
      cp: 81.9,
      warr: 86.7,
      internal: 79.7
    },
    ancillary: {
      subletSales: 8327.33,
      subletGross: 219.40,
      miscSales: 1000.00,
      miscGross: 1000.00
    }
  });

  // Input states aligned exactly with spreadsheet layout in mockup
  const [inputs, setInputs] = useState({
    billingDays: calculateBillingDaysForNextMonth(),
    techsAvailable: 6,
    hoursPerDay: 8,
    absenteeismRate: 10,        // absenteeism factor: 10%
    efficiencyForecast: 80,    // shop efficiency: 80%
    cpMix: 49,                  // customer pay mix (mapped to 0.49 of mix)
    cpRate: 185,                // CP target ELR
    cpGp: 75,                   // CP target labor GP margin %
    warrMix: 34,                // warranty mix (mapped to 0.34 of mix)
    warrRate: 175,              // Warranty target ELR
    warrGp: 70,                 // Warranty target GP %
    internalMix: 17,            // internal mix (0.17 mix)
    internalRate: 160,          // Internal target ELR
    internalGp: 80,             // Internal target GP %
    subletSales: 12500,
    subletGross: 3125,
    miscSales: 5880,
    miscGross: 1420,
    unappliedTime: 0
  });

  // Derived or input raw Counts for CP, Warr, and Internal
  const [rawCounts, setRawCounts] = useState({
    cpCount: 147,
    warrCount: 102,
    internalCount: 51
  });

  const calculateScaledProportionalMix = useCallback((counts: { cpCount: number; warrCount: number; internalCount: number }) => {
    const total = counts.cpCount + counts.warrCount + counts.internalCount;
    if (total === 0) {
      return { cpMix: 0, warrMix: 0, internalMix: 0 };
    }
    const cpMix = (counts.cpCount / total) * 100;
    const warrMix = (counts.warrCount / total) * 100;
    const internalMix = 100 - cpMix - warrMix;
    return { cpMix, warrMix, internalMix };
  }, []);

  const derivedMix = useMemo(() => {
    return calculateScaledProportionalMix(rawCounts);
  }, [rawCounts, calculateScaledProportionalMix]);

  const handleCountChange = (key: 'cpCount' | 'warrCount' | 'internalCount', val: number) => {
    const nextCounts = { ...rawCounts, [key]: Math.max(0, val) };
    setRawCounts(nextCounts);
    
    // Auto-calculate the mix percent and update inputs state
    const mix = calculateScaledProportionalMix(nextCounts);
    
    // Check if total is 0 to avoid zero-division issues
    const total = nextCounts.cpCount + nextCounts.warrCount + nextCounts.internalCount;
    if (total > 0) {
      setInputs(prev => ({
        ...prev,
        cpMix: Number(mix.cpMix.toFixed(1)),
        warrMix: Number(mix.warrMix.toFixed(1)),
        internalMix: Number(mix.internalMix.toFixed(1))
      }));
    }
  };

  // Modal toggle state for DMS PDF data upload
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [fileExtracting, setFileExtracting] = useState<boolean>(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [reportRawText, setReportRawText] = useState<string>('');
  const [parseEngine, setParseEngine] = useState<'none' | 'gemini' | 'chatgpt' | 'local'>('none');
  const [parserLog, setParserLog] = useState<string>('');
  const [selectedSample, setSelectedSample] = useState<string>('');
  const [pdfActiveTab, setPdfActiveTab] = useState<'upload' | 'sample'>('upload');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Apply Preset Values
  const applyPreset = (presetName: 'conservative' | 'balanced' | 'aggressive') => {
    setActivePreset(presetName);
    const billingDaysVal = calculateBillingDaysForNextMonth();
    if (presetName === 'conservative') {
      setInputs({
        billingDays: billingDaysVal,
        techsAvailable: 6,
        hoursPerDay: 8,
        absenteeismRate: 12,
        efficiencyForecast: 75,
        cpMix: 45,
        cpRate: 175,
        cpGp: 70,
        warrMix: 35,
        warrRate: 165,
        warrGp: 65,
        internalMix: 20,
        internalRate: 150,
        internalGp: 75,
        subletSales: 10000,
        subletGross: 2500,
        miscSales: 4000,
        miscGross: 1000,
        unappliedTime: 0
      });
      setRawCounts({
        cpCount: 135,
        warrCount: 105,
        internalCount: 60
      });
      onSuccess?.("Applied Conservative capacity forecasting parameters!");
    } else if (presetName === 'balanced') {
      setInputs({
        billingDays: billingDaysVal,
        techsAvailable: 6,
        hoursPerDay: 8,
        absenteeismRate: 10,
        efficiencyForecast: 80,
        cpMix: 49,
        cpRate: 185,
        cpGp: 75,
        warrMix: 34,
        warrRate: 175,
        warrGp: 70,
        internalMix: 17,
        internalRate: 160,
        internalGp: 80,
        subletSales: 12500,
        subletGross: 3125,
        miscSales: 5880,
        miscGross: 1420,
        unappliedTime: 0
      });
      setRawCounts({
        cpCount: 147,
        warrCount: 102,
        internalCount: 51
      });
      onSuccess?.("Applied Balanced baseline capacity forecasting parameters!");
    } else if (presetName === 'aggressive') {
      setInputs({
        billingDays: billingDaysVal,
        techsAvailable: 6,
        hoursPerDay: 8,
        absenteeismRate: 8,
        efficiencyForecast: 90,
        cpMix: 52,
        cpRate: 195, // target ELR
        cpGp: 78,
        warrMix: 32,
        warrRate: 180,
        warrGp: 72,
        internalMix: 16,
        internalRate: 170,
        internalGp: 82,
        subletSales: 15000,
        subletGross: 4000,
        miscSales: 8005,
        miscGross: 1420,
        unappliedTime: 0
      });
      setRawCounts({
        cpCount: 156,
        warrCount: 96,
        internalCount: 48
      });
      onSuccess?.("Applied Aggressive department growth parameters!");
    }
  };

  // ==========================================
  // MATHEMATICS CALCULATION ENGINE (REAL-TIME)
  // ==========================================
  const calculations = useMemo(() => {
    const billingDays = Number(inputs.billingDays) || 0;
    const techsAvailable = Number(inputs.techsAvailable) || 0;
    const hoursPerDay = Number(inputs.hoursPerDay) || 0;
    const absenteeismRate = Number(inputs.absenteeismRate) || 0;
    const efficiencyForecast = Number(inputs.efficiencyForecast) || 0;

    const totalWorkingDays = billingDays;
    const totalMonthlyHoursAvail = totalWorkingDays * techsAvailable * hoursPerDay;
    const lostHours = totalMonthlyHoursAvail * (absenteeismRate / 100);
    const totalNetProjectedHours = (totalMonthlyHoursAvail - lostHours) * (efficiencyForecast / 100);

    const cpMix = Number(inputs.cpMix) || 0;
    const warrMix = Number(inputs.warrMix) || 0;
    const internalMix = Number(inputs.internalMix) || 0;
    
    // Convert mixes into percentages/rations
    const cpHours = totalNetProjectedHours * (cpMix / 100);
    const warrHours = totalNetProjectedHours * (warrMix / 100);
    const internalHours = totalNetProjectedHours * (internalMix / 100);

    // Sales calculations
    const cpSales = cpHours * (Number(inputs.cpRate) || 0);
    const warrSales = warrHours * (Number(inputs.warrRate) || 0);
    const internalSales = internalHours * (Number(inputs.internalRate) || 0);
    const totalLaborSales = cpSales + warrSales + internalSales;

    // Gross profit calculations
    const cpGross = cpSales * ((Number(inputs.cpGp) || 0) / 100);
    const warrGross = warrSales * ((Number(inputs.warrGp) || 0) / 100);
    const internalGross = internalSales * ((Number(inputs.internalGp) || 0) / 100);
    const totalLaborGrossProfit = cpGross + warrGross + internalGross;

    // Blended metrics
    const totalELR = totalNetProjectedHours > 0 ? totalLaborSales / totalNetProjectedHours : 0;
    const blendedGPPercent = totalLaborSales > 0 ? (totalLaborGrossProfit / totalLaborSales) * 100 : 0;

    // Ancillaries
    const subletSales = Number(inputs.subletSales) || 0;
    const subletGross = Number(inputs.subletGross) || 0;
    const miscSales = Number(inputs.miscSales) || 0;
    const miscGross = Number(inputs.miscGross) || 0;
    const unappliedTime = Number(inputs.unappliedTime) || 0;

    // Consolidated summaries
    const totalServiceSales = totalLaborSales + subletSales + miscSales;
    const totalServiceGrossProfit = totalLaborGrossProfit + subletGross + miscGross;
    const adjustedTotalGrossProfit = totalServiceGrossProfit - unappliedTime;

    return {
      totalWorkingDays,
      totalMonthlyHoursAvail,
      lostHours,
      totalNetProjectedHours,
      cpHours,
      cpSales,
      cpGross,
      warrHours,
      warrSales,
      warrGross,
      internalHours,
      internalSales,
      internalGross,
      totalLaborSales,
      totalLaborGrossProfit,
      totalELR,
      blendedGPPercent,
      totalServiceSales,
      totalServiceGrossProfit,
      adjustedTotalGrossProfit
    };
  }, [inputs]);

  // PDF Extract Variable Trigger
  const applyExtractedNumbers = () => {
    if (!extractedData) return;
    setInputs({
      billingDays: inputs.billingDays,
      techsAvailable: extractedData.techs,
      hoursPerDay: inputs.hoursPerDay,
      absenteeismRate: inputs.absenteeismRate,
      efficiencyForecast: inputs.efficiencyForecast,
      cpMix: extractedData.cpMix,
      cpRate: extractedData.cpRate,
      cpGp: extractedData.cpGp,
      warrMix: extractedData.warrMix,
      warrRate: extractedData.warrRate,
      warrGp: extractedData.warrGp,
      internalMix: extractedData.internalMix,
      internalRate: extractedData.internalRate,
      internalGp: extractedData.internalGp,
      subletSales: extractedData.subletSales,
      subletGross: extractedData.subletGross,
      miscSales: extractedData.miscSales,
      miscGross: extractedData.miscGross,
      unappliedTime: extractedData.unappliedTime
    });

    const totalROs = extractedData.mtdRepairOrdersWritten || 300;
    const cpC = extractedData.cpCount !== undefined ? extractedData.cpCount : Math.round(totalROs * (extractedData.cpMix / 100));
    const warrC = extractedData.warrCount !== undefined ? extractedData.warrCount : Math.round(totalROs * (extractedData.warrMix / 100));
    const intC = extractedData.internalCount !== undefined ? extractedData.internalCount : Math.max(0, totalROs - cpC - warrC);
    setRawCounts({
      cpCount: cpC,
      warrCount: warrC,
      internalCount: intC
    });

    if (extractedData.mtdTotalLaborSales !== undefined) {
      setMtdTelemetry({
        grossLaborSales: extractedData.mtdTotalLaborSales,
        laborGrossProfit: extractedData.mtdLaborGrossProfit ?? 0,
        hoursSold: extractedData.mtdHoursSold ?? 0,
        repairOrdersWritten: extractedData.mtdRepairOrdersWritten ?? 0,
        effectiveLaborRate: extractedData.mtdEffectiveLaborRate ?? 0,
        laborGPPercent: extractedData.mtdLaborGPPercent ?? 0,
        mix: {
          cp: extractedData.cpMix / 100,
          warr: extractedData.warrMix / 100,
          internal: extractedData.internalMix / 100,
        },
        elr: {
          cp: extractedData.cpRate,
          warr: extractedData.warrRate,
          internal: extractedData.internalRate
        },
        gpPercent: {
          cp: extractedData.cpGp,
          warr: extractedData.warrGp,
          internal: extractedData.internalGp
        },
        ancillary: {
          subletSales: extractedData.subletSales,
          subletGross: extractedData.subletGross,
          miscSales: extractedData.miscSales,
          miscGross: extractedData.miscGross
        }
      });
    }

    setIsPdfModalOpen(false);
    onSuccess?.("Loaded audited variables from report successfully!");
  };

  const runExtraction = async (text: string) => {
    setParserLog('');
    try {
      const response = await fetch('/api/gemini-parse-dms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rawReportText: text }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const g = result.data;
          
          const totalHours = (g.cpHours || 0) + (g.warrHours || 0) + (g.internalHours || 0);
          const cpMixVal = totalHours > 0 ? Math.round((g.cpHours / totalHours) * 100) : 49;
          const warrMixVal = totalHours > 0 ? Math.round((g.warrHours / totalHours) * 100) : 31;
          const internalMixVal = totalHours > 0 ? Math.round((g.internalHours / totalHours) * 100) : 20;

          const mapped: ExtractedData = {
            techs: 6,
            cpMix: cpMixVal,
            cpRate: g.cpELR || 185,
            cpGp: g.cpLaborGPPercent || 75,
            warrMix: warrMixVal,
            warrRate: g.warrELR || 165,
            warrGp: g.warrLaborGPPercent || 72,
            internalMix: internalMixVal,
            internalRate: g.internalELR || 145,
            internalGp: g.internalLaborGPPercent || 70,
            subletSales: g.subletSales || 0,
            subletGross: g.subletGrossProfit || 0,
            miscSales: g.miscSales || 0,
            miscGross: g.miscGrossProfit || 0,
            unappliedTime: 0,
            cpCount: g.cpCount,
            warrCount: g.warrCount,
            internalCount: g.internalCount,
            
            mtdTotalLaborSales: g.grossLaborSales,
            mtdLaborGrossProfit: g.laborGrossProfit,
            mtdHoursSold: g.hoursBilled,
            mtdRepairOrdersWritten: g.repairOrdersWritten,
            mtdEffectiveLaborRate: g.effectiveLaborRate,
            mtdLaborGPPercent: g.grossLaborSales > 0 ? Math.round((g.laborGrossProfit / g.grossLaborSales) * 100) : undefined,
          };

          setExtractedData(mapped);
          setParseEngine(result.isChatGPT ? 'chatgpt' : 'gemini');
          return;
        } else if (result.isGeminiError) {
          console.log("AI service returned an error info payload:", result.error);
          const deterministicParsed = performDeterministicExtraction(text);
          setExtractedData(deterministicParsed);
          setParseEngine('local');
          if (result.reason === "quota_exhausted") {
            setParserLog("Gemini prepayment credits depleted / rate limited (429). Local rule-based parsing loaded as placeholder fallback!");
          } else if (result.reason === "openai_quota_exhausted") {
            setParserLog("OpenAI quota exceeded or prepayment credits depleted. Local rule-based parsing loaded as fallback!");
          } else if (result.reason === "openai_auth_failed") {
            setParserLog("OpenAI Key Authentication Failed (401 invalid key). Local rule-based offline parsing loaded as fallback!");
          } else if (result.reason === "openai_key_masked") {
            setParserLog("OpenAI API Key format error (copied with asterisks * from dashboard by mistake). Please configure a new, full unmasked key in settings.");
          } else {
            setParserLog(`AI extraction offline (${result.error}). Local rule-based parsing loaded as a fallback.`);
          }
          return;
        }
      }
      
      console.log("AI service unavailable. Falling back to rule-based parser.");
      const deterministicParsed = performDeterministicExtraction(text);
      setExtractedData(deterministicParsed);
      setParseEngine('local');
      setParserLog("AI API Key missing or model offline. Local pattern matching was loaded as a fallback safely!");
    } catch (err) {
      console.log("AI route handling exception occurred:", err);
      const deterministicParsed = performDeterministicExtraction(text);
      setExtractedData(deterministicParsed);
      setParseEngine('local');
      setParserLog("Connection error occurred. Rule-based offline parser loaded as a fallback.");
    }
  };

  const handlePdfUpload = async (file: File) => {
    setFileExtracting(true);
    setValidationError(null);
    try {
      const text = await extractTextFromPDF(file);
      setReportRawText(text);
      await runExtraction(text);
      setSelectedSample('');
      onSuccess?.(`Successfully processed PDF MTD data: ${file.name}`);
    } catch (err: any) {
      console.error(err);
      setValidationError("Failed to extract legible text from PDF. Ensure PDF is a plain-text digital document, or copy and paste raw report text directly!");
    } finally {
      setFileExtracting(false);
    }
  };

  const handleSampleSelected = async (sampleId: string) => {
    setSelectedSample(sampleId);
    const found = SAMPLE_DMS_REPORTS.find(s => s.id === sampleId);
    if (found) {
      setReportRawText(found.text);
      setFileExtracting(true);
      try {
        await runExtraction(found.text);
        onSuccess?.(`Successfully processed sample record: ${found.name}`);
      } catch (err) {
        console.error(err);
      } finally {
        setFileExtracting(false);
      }
    } else {
      setReportRawText('');
      setExtractedData(null);
      setParseEngine('none');
      setParserLog('');
    }
  };

  // Recharts Data Configuration
  const barChartData = [
    {
      name: 'Labor Sales',
      current: mtdTelemetry.grossLaborSales,
      projected: calculations.totalLaborSales,
    },
    {
      name: 'Labor Gross',
      current: mtdTelemetry.laborGrossProfit,
      projected: calculations.totalLaborGrossProfit,
    },
  ];

  const pieChartData = [
    { name: 'Customer Pay', value: calculations.cpSales },
    { name: 'Warranty', value: calculations.warrSales },
    { name: 'Internal', value: calculations.internalSales },
  ];

  const PIE_COLORS = ['#3b82f6', '#4f46e5', '#a855f7'];

  // Elegant Print Handler (Breathtaking Modern Spacious Executive Layout)
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=900,resizable=yes,scrollbars=yes');
    if (!printWindow) {
      try {
        window.print();
      } catch (e) {
        console.error("Popup blocked and print layout failed:", e);
      }
      return;
    }

    const dateStr = new Date().toLocaleDateString(undefined, {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fixed Ops Capacity & Forecast Summary - HYUNDAI OF SANTA MARIA</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .paper {
              box-shadow: none;
              border: none;
            }
            @media screen {
              body {
                background-color: #f1f5f9;
                padding: 40px 20px;
              }
              .paper {
                box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.15);
                border: 1px solid #e2e8f0;
                background-color: white;
                border-radius: 24px;
              }
            }
            @media print {
              body {
                padding: 0px !important;
                background-color: white !important;
              }
              .paper {
                box-shadow: none !important;
                border: none !important;
                padding: 0px !important;
              }
            }
          </style>
        </head>
        <body class="bg-[#f8fafc] text-slate-900">
          <div class="paper max-w-4xl mx-auto space-y-8 p-10 bg-white">
            
            <!-- HEADER BLOCK: Spacious, aligned corporate look -->
            <div class="border-b border-slate-200 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div class="space-y-1">
                <span class="text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em] block">Fixed Operations Capacity Model</span>
                <h1 class="text-3xl font-extrabold uppercase text-slate-900 leading-none tracking-tight">Capacity & Projections Forecast</h1>
                <p class="text-xs font-mono text-slate-500 uppercase flex items-center gap-2">
                  <span class="font-bold text-slate-700">Hyundai of Santa Maria</span>
                  <span class="text-slate-350">•</span>
                  <span>Internal Operational Audit Ledger</span>
                </p>
              </div>
              <div class="text-right font-mono text-[10px] text-slate-500 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div class="font-bold text-slate-700">Dealer Group Workspace Ledger</div>
                <div class="text-slate-400">Generated on ${dateStr}</div>
              </div>
            </div>

            <!-- KEY PERFORMANCE INDICATORS (KPIs): Elevated Bento Box Style -->
            <div class="grid grid-cols-4 gap-5 py-2">
              <div class="p-5 bg-slate-50/50 border border-slate-200/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span class="text-[10px] uppercase text-slate-500 font-extrabold tracking-wider block">Projected Net Hours</span>
                <div class="mt-2 text-xl font-mono font-black text-slate-900 whitespace-nowrap">${calculations.totalNetProjectedHours.toFixed(1)} <span class="text-xs text-slate-400 font-normal">hrs</span></div>
                <span class="text-[9px] text-slate-400 font-semibold block mt-1">Derived Capacity Hours</span>
              </div>
              
              <div class="p-5 bg-indigo-50/20 border border-indigo-100/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span class="text-[10px] uppercase text-indigo-600 font-extrabold tracking-wider block">Projected Labor Sales</span>
                <div class="mt-2 text-xl font-mono font-black text-indigo-700">$${calculations.totalLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <span class="text-[9px] text-indigo-400 font-semibold block mt-1">Projected Service Volume</span>
              </div>
              
              <div class="p-5 bg-emerald-50/20 border border-emerald-100/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span class="text-[10px] uppercase text-emerald-600 font-extrabold tracking-wider block">Adjusted Profit GP</span>
                <div class="mt-2 text-xl font-mono font-black text-emerald-700">$${calculations.adjustedTotalGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <span class="text-[9px] text-emerald-400 font-semibold block mt-1">Net Services GP Yield</span>
              </div>

              <div class="p-5 bg-amber-50/20 border border-amber-100/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span class="text-[10px] uppercase text-amber-700 font-extrabold tracking-wider block">Blended ELR Baseline</span>
                <div class="mt-2 text-xl font-mono font-black text-amber-800">$${calculations.totalELR.toFixed(2)}</div>
                <span class="text-[9px] text-amber-500 font-semibold block mt-1">Rate Strategy Objective</span>
              </div>
            </div>

            <!-- MAIN STRATEGY MIX TABLE: Double-spaced elegant table -->
            <div class="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
              <table class="w-full text-left font-mono text-xs">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase text-[9.5px] tracking-wider">
                    <th class="py-3 px-4 font-bold">Revenue Block</th>
                    <th class="py-3 px-4 text-center font-bold">Mix %</th>
                    <th class="py-3 px-4 text-right font-bold">Hours</th>
                    <th class="py-3 px-4 text-right font-bold">Target ELR</th>
                    <th class="py-3 px-4 text-right font-bold">Labor Sales</th>
                    <th class="py-3 px-4 text-center font-bold">GP %</th>
                    <th class="py-3 px-4 text-right font-bold">Gross Profit</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 font-medium">
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="py-3.5 px-4 font-bold text-slate-900">Customer Pay (CP)</td>
                    <td class="py-3.5 px-4 text-center text-slate-600 font-semibold">${inputs.cpMix}%</td>
                    <td class="py-3.5 px-4 text-right text-slate-800">${calculations.cpHours.toFixed(1)}</td>
                    <td class="py-3.5 px-4 text-right text-slate-800">$${inputs.cpRate.toFixed(2)}</td>
                    <td class="py-3.5 px-4 text-right text-slate-900">$${calculations.cpSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td class="py-3.5 px-4 text-center text-slate-600">${inputs.cpGp}%</td>
                    <td class="py-3.5 px-4 text-right font-bold text-emerald-700">$${calculations.cpGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="py-3.5 px-4 font-bold text-slate-900">Warranty Pay (WARR)</td>
                    <td class="py-3.5 px-4 text-center text-slate-600 font-semibold">${inputs.warrMix}%</td>
                    <td class="py-3.5 px-4 text-right text-slate-800">${calculations.warrHours.toFixed(1)}</td>
                    <td class="py-3.5 px-4 text-right text-slate-800">$${inputs.warrRate.toFixed(2)}</td>
                    <td class="py-3.5 px-4 text-right text-slate-900">$${calculations.warrSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td class="py-3.5 px-4 text-center text-slate-600">${inputs.warrGp}%</td>
                    <td class="py-3.5 px-4 text-right font-bold text-emerald-700">$${calculations.warrGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="py-3.5 px-4 font-bold text-slate-900">Internal Pay (INT)</td>
                    <td class="py-3.5 px-4 text-center text-slate-600 font-semibold">${inputs.internalMix}%</td>
                    <td class="py-3.5 px-4 text-right text-slate-800">${calculations.internalHours.toFixed(1)}</td>
                    <td class="py-3.5 px-4 text-right text-slate-800">$${inputs.internalRate.toFixed(2)}</td>
                    <td class="py-3.5 px-4 text-right text-slate-900">$${calculations.internalSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td class="py-3.5 px-4 text-center text-slate-600">${inputs.internalGp}%</td>
                    <td class="py-3.5 px-4 text-right font-bold text-emerald-700">$${calculations.internalGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                  <tr class="bg-slate-900 font-black text-white">
                    <td class="py-4 px-4 uppercase text-[10px]">Totals / Blended</td>
                    <td class="py-4 px-4 text-center">100.0%</td>
                    <td class="py-4 px-4 text-right">${calculations.totalNetProjectedHours.toFixed(1)}</td>
                    <td class="py-4 px-4 text-right">$${calculations.totalELR.toFixed(2)}</td>
                    <td class="py-4 px-4 text-right">$${calculations.totalLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td class="py-4 px-4 text-center">${calculations.blendedGPPercent.toFixed(1)}%</td>
                    <td class="py-4 px-4 text-right text-emerald-400 font-extrabold">$${calculations.totalLaborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- BOTTOM COLUMNS SUMMARY: Roomy, aligned metrics -->
            <div class="grid grid-cols-2 gap-8 pt-4 border-t border-slate-200">
              
              <!-- Left Column: CAPACITY METRICS -->
              <div class="space-y-4">
                <div class="border-l-3 border-indigo-600 pl-3">
                  <span class="text-[10px] font-black uppercase text-slate-800 tracking-wider block">Calendar Capacity Constants</span>
                </div>
                <div class="space-y-2.5 font-medium text-xs">
                  <div class="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span class="text-slate-500">Billing Days:</span>
                    <span class="font-bold font-mono text-slate-900">${inputs.billingDays} days</span>
                  </div>
                  <div class="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span class="text-slate-500">Staffed Workforce:</span>
                    <span class="font-bold font-mono text-slate-900">${inputs.techsAvailable} Techs</span>
                  </div>
                  <div class="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span class="text-slate-500">Standard Shift:</span>
                    <span class="font-bold font-mono text-slate-900">${inputs.hoursPerDay} hrs/day</span>
                  </div>
                  <div class="flex justify-between py-1.5 border-b border-slate-100 items-center text-rose-600 font-semibold bg-rose-50/50 px-2 rounded-lg py-1.5">
                    <span>Absenteeism Lost Ratio:</span>
                    <span class="font-black font-mono">-${calculations.lostHours.toFixed(1)} hrs (${inputs.absenteeismRate}%)</span>
                  </div>
                  <div class="flex justify-between py-1.5 items-center">
                    <span class="text-slate-500">Shop Applied Efficiency:</span>
                    <span class="font-bold font-mono text-slate-900">${inputs.efficiencyForecast}%</span>
                  </div>
                </div>
              </div>

              <!-- Right Column: DEPARTMENT LEDGER -->
              <div class="space-y-4">
                <div class="border-l-3 border-indigo-600 pl-3">
                  <span class="text-[10px] font-black uppercase text-slate-800 tracking-wider block">Department Ledger Consolidation</span>
                </div>
                <div class="space-y-2.5 font-medium text-xs">
                  <div class="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span class="text-slate-500">Calculated Labor Gross Yield:</span>
                    <span class="font-bold font-mono text-slate-900">$${calculations.totalLaborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                  </div>
                  <div class="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span class="text-slate-500">Sublet Profit (Sales: $${inputs.subletSales.toLocaleString()}):</span>
                    <span class="font-bold font-mono text-slate-900">$${inputs.subletGross.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                  </div>
                  <div class="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span class="text-slate-500">Miscellaneous Profit (Sales: $${inputs.miscSales.toLocaleString()}):</span>
                    <span class="font-bold font-mono text-slate-900">$${inputs.miscGross.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                  </div>
                  
                  <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 mt-3 flex justify-between items-center text-emerald-900 select-all font-bold transition-all">
                    <div class="flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span class="text-[10px] uppercase tracking-wider text-emerald-800">Adjusted GP Yield:</span>
                    </div>
                    <span class="font-mono font-black text-base">$${calculations.adjustedTotalGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                  </div>
                </div>
              </div>

            </div>
            
            <!-- FOOTER BAR: Clean branding -->
            <div class="pt-8 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 font-mono">
              <div>HYUNDAI OF SANTA MARIA • FINANCIAL REPORTING</div>
              <div>CLASSIFICATION: CONFIDENTIAL</div>
            </div>

          </div>
          <script>
            window.addEventListener('load', () => {
              setTimeout(() => { window.print(); }, 400);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const totalMixAllocationValue = Number(inputs.cpMix) + Number(inputs.warrMix) + Number(inputs.internalMix);

  return (
    <div className="space-y-6 max-w-7xl mx-auto min-h-screen text-slate-200">
      
      {/* 1. Header with Controls */}
      <div className="bg-[#0a0f1d]/65 ring-1 ring-white/10 p-6 rounded-3xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl no-print">
        <div>
          <span className="text-xxs font-black text-slate-500 uppercase tracking-widest block mb-0.5">EOM Operations Dashboard</span>
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Fixed Ops Financial Forecaster</h2>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <button 
            type="button"
            onClick={() => {
              setValidationError(null);
              setIsPdfModalOpen(true);
            }} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider py-2.5 px-5 rounded-xl transition-all duration-300 flex items-center gap-2 shadow-lg shadow-indigo-600/15 cursor-pointer"
          >
            <TrendingUp size={14} />
            Open Forecast Generator
          </button>
          
          <button 
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider py-2.5 px-5 rounded-xl transition-all duration-300 flex items-center gap-2 shadow-lg shadow-emerald-600/15 cursor-pointer"
          >
            <Printer size={14} />
            Preview & Print Report
          </button>
        </div>
      </div>

      {/* 2. Side-by-Side Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: LIVE MTD TELEMETRY */}
        <div className="lg:col-span-4 bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl space-y-5 animate-fade-in text-white self-stretch">
          <div className="border-b border-white/10 pb-3 flex justify-between items-center">
            <div>
              <span className="text-xxs font-black text-indigo-400 uppercase tracking-widest block mb-0.5">CLOSED BALANCE SHEETS</span>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Activity size={16} className="text-indigo-400 mt-0.5" />
                Live Telemetry MTD
              </h3>
            </div>
            <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[9px] font-black uppercase tracking-wider">
              Current Month
            </span>
          </div>

          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">MTD Gross Labor Sales</span>
              <span className="text-3xl font-mono font-black mt-1.5 block text-white select-all">
                ${mtdTelemetry.grossLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">MTD Labor Gross Profit</span>
              <span className="text-lg font-mono font-black text-indigo-400 mt-1 block select-all">
                ${mtdTelemetry.laborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                <span className="text-[10px] text-slate-400 font-bold ml-1.5 select-none">({mtdTelemetry.laborGPPercent}%)</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-[#050811] border border-white/[0.02] p-4 rounded-xl">
              <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Hours Sold</span>
                <span className="text-sm font-mono font-black text-white mt-1 block font-mono">
                  {mtdTelemetry.hoursSold.toFixed(1)} hrs
                </span>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Repair Orders</span>
                <span className="text-sm font-mono font-black text-white mt-1 block font-mono">
                  {mtdTelemetry.repairOrdersWritten} ROs
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Effective Labor Rate (ELR)</span>
                <span className="text-xl font-mono font-black text-indigo-400 mt-0.5 block">
                  ${mtdTelemetry.effectiveLaborRate.toFixed(2)}
                </span>
              </div>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-extrabold rounded uppercase font-mono tracking-widest">
                Live
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: FORECASTING PARAMETERS */}
        <div className="lg:col-span-8 bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-4 gap-4">
            <div>
              <span className="text-xxs font-black text-slate-500 uppercase tracking-widest block">FORECASTING PARAMETERS</span>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Capacity & Rate Modifiers</h3>
            </div>
            
            {/* Presets switcher */}
            <div className="bg-slate-950/50 p-1 rounded-xl border border-white/5 flex gap-1 select-none">
              {(['conservative', 'balanced', 'aggressive'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "text-[9px] font-black uppercase tracking-wider py-1.5 px-3 rounded-lg transition-all cursor-pointer",
                    activePreset === p 
                      ? "bg-indigo-600 text-white" 
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            
            {/* CAPACITY CONSTANTS */}
            <div className="space-y-4">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block font-mono select-none">☇ Capacity Constants</span>
              
              <div className="grid grid-cols-1 gap-4 font-mono">
                {/* Billing Days */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Billing Days in Month</span>
                    <span className="text-white font-black">{inputs.billingDays} days</span>
                  </div>
                  <input 
                    type="range"
                    min="1"
                    max="31"
                    value={inputs.billingDays}
                    onChange={(e) => setInputs({...inputs, billingDays: parseInt(e.target.value) || 0})}
                    className="w-full accent-indigo-500 cursor-pointer h-1 rounded appearance-none bg-slate-800"
                  />
                </div>

                {/* Staffed Technicians */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Staffed Technicians</span>
                    <span className="text-white font-black">{inputs.techsAvailable} Techs</span>
                  </div>
                  <input 
                    type="range"
                    min="1"
                    max="40"
                    value={inputs.techsAvailable}
                    onChange={(e) => setInputs({...inputs, techsAvailable: parseInt(e.target.value) || 0})}
                    className="w-full accent-indigo-500 cursor-pointer h-1 rounded appearance-none bg-slate-800"
                  />
                </div>

                {/* Shift Hours */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Standard Shift Hours</span>
                    <span className="text-white font-black">{inputs.hoursPerDay} hrs/day</span>
                  </div>
                  <input 
                    type="range"
                    min="4"
                    max="14"
                    step="0.5"
                    value={inputs.hoursPerDay}
                    onChange={(e) => setInputs({...inputs, hoursPerDay: parseFloat(e.target.value) || 0})}
                    className="w-full accent-indigo-500 cursor-pointer h-1 rounded appearance-none bg-slate-800"
                  />
                </div>

                {/* Absenteeism Factor */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Absenteeism Factor</span>
                    <span className="text-red-400 font-black">{inputs.absenteeismRate}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="50"
                    value={inputs.absenteeismRate}
                    onChange={(e) => setInputs({...inputs, absenteeismRate: parseInt(e.target.value) || 0})}
                    className="w-full accent-rose-500 cursor-pointer h-1 rounded appearance-none bg-slate-800"
                  />
                </div>

                {/* Shop Efficiency */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Shop Efficiency</span>
                    <span className="text-emerald-400 font-black">{inputs.efficiencyForecast}%</span>
                  </div>
                  <input 
                    type="range"
                    min="10"
                    max="250"
                    value={inputs.efficiencyForecast}
                    onChange={(e) => setInputs({...inputs, efficiencyForecast: parseInt(e.target.value) || 0})}
                    className="w-full accent-emerald-500 cursor-pointer h-1 rounded appearance-none bg-slate-800"
                  />
                </div>
              </div>
            </div>            {/* PORTFOLIO YIELD & MIX */}
            <div className="space-y-4 pt-2 border-t border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-indigo-400 uppercase tracking-widest block font-mono select-none">☇ Revenue Mix Strategy Targets</span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider font-mono",
                  totalMixAllocationValue >= 99.9 && totalMixAllocationValue <= 100.1
                    ? "bg-emerald-500/10 text-emerald-400" 
                    : "bg-red-500/10 text-red-500"
                )}>
                  {totalMixAllocationValue.toFixed(1)}% / 100% Mix Allocation
                </span>
              </div>
              
              <div className="bg-[#050811] border border-white/[0.03] p-4 rounded-2xl space-y-4 font-mono">
                {/* Customer Pay Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center border-b border-slate-800/60 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-300">Customer Pay</span>
                  
                  {/* STEP A: The Raw Count Field */}
                  <div>
                    <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Raw RO Count</label>
                    <input 
                      type="number" 
                      value={rawCounts.cpCount === 0 ? '' : rawCounts.cpCount}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-indigo-500 outline-none"
                      onChange={e => handleCountChange('cpCount', Number(e.target.value))}
                    />
                  </div>

                  {/* STEP B: The Auto-Calculated Proportional Mix Output */}
                  <div>
                    <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Derived Mix %</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={`${derivedMix.cpMix.toFixed(1)}%`}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-indigo-400 font-bold text-center text-xs"
                    />
                  </div>

                  {/* STEP C: Standard Strategy Benchmarks */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Target ELR ($)</label>
                      <input 
                        type="number" 
                        value={inputs.cpRate === 0 ? '' : inputs.cpRate}
                        className="w-full bg-[#0a0f1d] border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-[#4f46e5] outline-none"
                        onChange={e => setInputs({ ...inputs, cpRate: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Target GP %</label>
                      <input 
                        type="number" 
                        value={inputs.cpGp === 0 ? '' : inputs.cpGp}
                        className="w-full bg-[#0a0f1d] border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-[#4f46e5] outline-none"
                        onChange={e => setInputs({...inputs, cpGp: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                </div>

                {/* Warranty Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center border-b border-slate-800/60 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-300">Warranty</span>
                  
                  {/* STEP A: The Raw Count Field */}
                  <div>
                    <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Raw RO Count</label>
                    <input 
                      type="number" 
                      value={rawCounts.warrCount === 0 ? '' : rawCounts.warrCount}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-indigo-500 outline-none"
                      onChange={e => handleCountChange('warrCount', Number(e.target.value))}
                    />
                  </div>

                  {/* STEP B: The Auto-Calculated Proportional Mix Output */}
                  <div>
                    <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Derived Mix %</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={`${derivedMix.warrMix.toFixed(1)}%`}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-indigo-400 font-bold text-center text-xs"
                    />
                  </div>

                  {/* STEP C: Standard Strategy Benchmarks */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Target ELR ($)</label>
                      <input 
                        type="number" 
                        value={inputs.warrRate === 0 ? '' : inputs.warrRate}
                        className="w-full bg-[#0a0f1d] border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-[#4f46e5] outline-none"
                        onChange={e => setInputs({ ...inputs, warrRate: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Target GP %</label>
                      <input 
                        type="number" 
                        value={inputs.warrGp === 0 ? '' : inputs.warrGp}
                        className="w-full bg-[#0a0f1d] border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-[#4f46e5] outline-none"
                        onChange={e => setInputs({...inputs, warrGp: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                </div>

                {/* Internal Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center pb-1">
                  <span className="text-xs font-bold uppercase text-slate-300">Internal</span>
                  
                  {/* STEP A: The Raw Count Field */}
                  <div>
                    <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Raw RO Count</label>
                    <input 
                      type="number" 
                      value={rawCounts.internalCount === 0 ? '' : rawCounts.internalCount}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-indigo-500 outline-none"
                      onChange={e => handleCountChange('internalCount', Number(e.target.value))}
                    />
                  </div>

                  {/* STEP B: The Auto-Calculated Proportional Mix Output */}
                  <div>
                    <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Derived Mix %</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={`${derivedMix.internalMix.toFixed(1)}%`}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-indigo-400 font-bold text-center text-xs"
                    />
                  </div>

                  {/* STEP C: Standard Strategy Benchmarks */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Target ELR ($)</label>
                      <input 
                        type="number" 
                        value={inputs.internalRate === 0 ? '' : inputs.internalRate}
                        className="w-full bg-[#0a0f1d] border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-[#4f46e5] outline-none"
                        onChange={e => setInputs({ ...inputs, internalRate: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block uppercase tracking-wider mb-1">Target GP %</label>
                      <input 
                        type="number" 
                        value={inputs.internalGp === 0 ? '' : inputs.internalGp}
                        className="w-full bg-[#0a0f1d] border border-slate-800 rounded p-1.5 text-xs text-white text-center focus:border-[#4f46e5] outline-none"
                        onChange={e => setInputs({...inputs, internalGp: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SUBLET, MISC & LEDGER ADJUSTMENTS */}
            <div className="space-y-3 pt-3 border-t border-white/5">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block font-mono select-none">☇ Sublet, Misc & Ledger Adjustments</span>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Sublet Sales ($)</label>
                  <input 
                    type="number"
                    value={inputs.subletSales}
                    onChange={(e) => setInputs({...inputs, subletSales: parseFloat(e.target.value) || 0})}
                    className="w-full bg-[#050811] border border-white/5 focus:border-[#4f46e5] rounded-lg p-2.5 text-center text-white font-black"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Sublet Gross ($)</label>
                  <input 
                    type="number"
                    value={inputs.subletGross}
                    onChange={(e) => setInputs({...inputs, subletGross: parseFloat(e.target.value) || 0})}
                    className="w-full bg-[#050811] border border-white/5 focus:border-[#4f46e5] rounded-lg p-2.5 text-center text-white font-black"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Misc Sales ($)</label>
                  <input 
                    type="number"
                    value={inputs.miscSales}
                    onChange={(e) => setInputs({...inputs, miscSales: parseFloat(e.target.value) || 0})}
                    className="w-full bg-[#050811] border border-white/5 focus:border-[#4f46e5] rounded-lg p-2.5 text-center text-white font-black"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Misc Gross ($)</label>
                  <input 
                    type="number"
                    value={inputs.miscGross}
                    onChange={(e) => setInputs({...inputs, miscGross: parseFloat(e.target.value) || 0})}
                    className="w-full bg-[#050811] border border-white/5 focus:border-[#4f46e5] rounded-lg p-2.5 text-center text-white font-black"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block">Unapplied ($)</label>
                    <span className="text-[8px] font-bold text-rose-500 leading-none">5.00% Net</span>
                  </div>
                  <input 
                    type="number"
                    value={inputs.unappliedTime}
                    onChange={(e) => setInputs({...inputs, unappliedTime: parseFloat(e.target.value) || 0})}
                    className="w-full bg-[#050811] border border-white/5 focus:border-[#4f46e5] rounded-lg p-2.5 text-center text-white font-black"
                  />
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* 3. Output Metrics Bento Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1 select-none">
        <div className="bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl flex items-center gap-4">
          <div className="p-3 bg-slate-500/10 rounded-2xl border border-white/5">
            <Calendar size={18} className="text-slate-400" />
          </div>
          <div>
            <span className="text-[9px] uppercase block font-black tracking-wider text-slate-500">Max Raw Capacity</span>
            <span className="text-xl font-mono font-black text-white leading-none mt-1 block">
              {calculations.totalMonthlyHoursAvail.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
            </span>
            <span className="text-[9.5px] text-slate-500 font-mono font-bold block mt-0.5">
              {inputs.billingDays}d x {inputs.techsAvailable}tx x {inputs.hoursPerDay}h
            </span>
          </div>
        </div>

        <div className="bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/10">
            <Clock size={18} className="text-emerald-400" />
          </div>
          <div>
            <span className="text-[9px] uppercase block font-black tracking-wider text-slate-500">Shop Efficiency Yield</span>
            <span className="text-xl font-mono font-black text-emerald-400 leading-none mt-1 block">
              {calculations.totalNetProjectedHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs
            </span>
            <span className="text-[9.5px] text-rose-500 font-mono font-bold block mt-0.5">
              Lost to Absenteeism: -{calculations.lostHours.toFixed(1)} hrs
            </span>
          </div>
        </div>

        <div className="bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/10">
            <DollarSign size={18} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[9px] uppercase block font-black tracking-wider text-slate-500">Projected Labor Sales</span>
            <span className="text-xl font-mono font-black text-indigo-400 leading-none mt-1 block">
              ${calculations.totalLaborSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className="flex justify-between text-[9.5px] font-mono font-bold text-slate-500 mt-0.5 gap-2">
              <span>Labor GP: ${calculations.totalLaborGrossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span>Blended GP %: {calculations.blendedGPPercent.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/10">
            <TrendingUp size={18} className="text-amber-500" />
          </div>
          <div>
            <span className="text-[9px] uppercase block font-black tracking-wider text-slate-500">Forecast Blended ELR</span>
            <span className="text-xl font-mono font-black text-amber-500 leading-none mt-1 block">
              ${calculations.totalELR.toFixed(2)}
            </span>
            <span className="text-[9.5px] text-slate-500 font-mono font-bold block mt-0.5">
              Live baseline comparison: ${mtdTelemetry.effectiveLaborRate.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Service Operations Consolidated Summation banner */}
      <div className="bg-gradient-to-r from-[#0d1527] to-[#080d19] rounded-3xl border border-white/10 p-6 md:p-8 shadow-2xl relative mt-4 select-none">
        
        {/* Floating badge label absolute */}
        <div className="absolute -top-3 left-6">
          <span className="bg-[#1e293b] text-slate-400 ring-1 ring-white/10 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full select-none">
            Total Service Operations Consolidated Summation
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 text-center md:text-left">
          
          <div className="space-y-1 md:border-r border-white/5 pr-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block leading-none">Total Service Department Sales</span>
            <span className="text-2xl font-mono font-black text-white block mt-1.5 leading-none">
              ${calculations.totalServiceSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9.5px] text-slate-500 block font-mono">Labor + Sublet + Misc</span>
          </div>

          <div className="space-y-1 md:border-r border-white/5 pr-4 pl-0 md:pl-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block leading-none">Total Service Gross Profit</span>
            <span className="text-2xl font-mono font-black text-indigo-400 block mt-1.5 leading-none">
              ${calculations.totalServiceGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9.5px] text-slate-500 block font-mono">Labor GP + Sublet GP + Misc GP</span>
          </div>

          <div className="space-y-1 pl-0 md:pl-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block leading-none">Adjusted Total Gross Profit</span>
            <span className="text-2xl font-mono font-black text-emerald-400 block mt-1.5 leading-none">
              ${calculations.adjustedTotalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9.5px] text-slate-500 block font-mono">Service GP - Unapplied Hours/Expense</span>
          </div>

        </div>

      </div>

      {/* 5. Financial comparison & Mix Portfolio charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 select-none">
        
        {/* Left Chart: Bar Chart comparing volumes */}
        <div className="bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl space-y-4">
          <div>
            <span className="text-xxs font-black text-slate-500 uppercase tracking-widest block">Financial Yield Comparison</span>
            <h4 className="text-xs font-black text-white uppercase tracking-wider mt-0.5">Current vs Forecasted Labor Volume</h4>
          </div>

          <div className="w-full">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={barChartData} margin={{ top: 15, right: 10, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0b0f19', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                  formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '']}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '9.5px', color: '#fff', paddingTop: '10px' }} />
                <Bar dataKey="current" name="Current MTD" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="projected" name="Projected Forecast" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Chart: Pie Chart share shares */}
        <div className="bg-[#0a0f1d]/65 ring-1 ring-white/10 p-5 rounded-3xl border border-white/5 shadow-xl space-y-4">
          <div>
            <span className="text-xxs font-black text-slate-500 uppercase tracking-widest block">Revenue Mix Portfolio</span>
            <h4 className="text-xs font-black text-white uppercase tracking-wider mt-0.5">Projected Yield Shares</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="relative flex items-center justify-center h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={68}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0b0f19', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    labelStyle={{ color: '#fff', fontSize: '11px' }}
                    formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center text-center select-none pointer-events-none">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Total Projected</span>
                <span className="text-xs font-mono font-black mt-1 leading-none text-white select-all">
                  ${calculations.totalLaborSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            <div className="space-y-2 font-mono text-[10.5px]">
              {pieChartData.map((s, index) => {
                const percentVal = calculations.totalLaborSales > 0 ? (s.value / calculations.totalLaborSales) * 100 : 0;
                return (
                  <div key={s.name} className="flex justify-between items-center bg-slate-950/20 p-2.5 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="text-slate-400 font-extrabold uppercase text-[9px]">{s.name}</span>
                    </div>
                    <div>
                      <span className="text-white font-black">${s.value.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                      <span className="text-slate-500 font-bold ml-1 text-[10px]">({percentVal.toFixed(0)}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* 6. MODAL OVERLAY: DMS PDF DATA EXTRACTOR */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in no-print">
          <div className="bg-[#0a0f1d]/95 ring-1 ring-white/10 border border-white/10 rounded-3xl p-6 md:p-8 max-w-2xl w-full text-slate-200 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-white/5">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <UploadCloud size={16} className="text-indigo-400" />
                  DMS Report Parser & Forecast Generator
                </h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 font-mono flex items-center gap-2">
                  <span>ChatGPT-4o-mini / Gemini Engine</span>
                  <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                  <span>Auto-Structured DMS Parsing</span>
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsPdfModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors h-6 w-6 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Error alerts */}
            {validationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-[#fda4af] flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span className="font-extrabold">{validationError}</span>
              </div>
            )}

            {/* Tab Swappers */}
            <div className="flex border-b border-white/10 pb-0 flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setPdfActiveTab('sample')}
                className={cn(
                  "pb-2 px-3 text-xxs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer",
                  pdfActiveTab === 'sample' 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-white"
                )}
              >
                Sample DMS Reports
              </button>
              <button
                type="button"
                onClick={() => setPdfActiveTab('upload')}
                className={cn(
                  "pb-2 px-3 text-xxs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                  pdfActiveTab === 'upload' 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-white"
                )}
              >
                <UploadCloud size={11} />
                Upload PDF Report (PC)
              </button>
            </div>

            {pdfActiveTab === 'upload' ? (
              <div 
                className="border-2 border-dashed border-white/10 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.02] transition-all p-8 rounded-2xl text-center flex flex-col items-center justify-center gap-2 cursor-pointer relative"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handlePdfUpload(e.dataTransfer.files[0]);
                  }
                }}
              >
                <input 
                  type="file" 
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handlePdfUpload(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <UploadCloud size={28} className="text-indigo-400" />
                <div>
                  <span className="font-black block text-[11px] uppercase tracking-wider text-slate-300">File drag-and-drop zone</span>
                  <span className="text-[9px] text-slate-500 uppercase font-mono">Upload Plain Text MTD DMS PDF Report</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Select Demo DMS Template</label>
                  <select 
                    value={selectedSample}
                    onChange={(e) => handleSampleSelected(e.target.value)}
                    className="w-full bg-[#050811] text-[11px] font-mono border border-white/10 rounded-xl p-2.5 text-slate-300 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">-- Load Sample Balance Sheets --</option>
                    {SAMPLE_DMS_REPORTS.map(samp => (
                      <option key={samp.id} value={samp.id}>{samp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {reportRawText && (
              <div className="space-y-4 pt-1">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Extracted Source Document Text</label>
                  <textarea
                    readOnly
                    value={reportRawText}
                    className="w-full h-32 bg-[#050811] text-[9.5px] font-mono p-3 rounded-2xl border border-white/5 text-slate-400 outline-none resize-none leading-relaxed"
                  />
                </div>

                {extractedData && (
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl animate-fade-in relative space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block flex items-center gap-1.5">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        {parseEngine === 'chatgpt' ? "✔ ChatGPT-4o-mini AI Extraction Successful" : parseEngine === 'gemini' ? "✔ Gemini 2.0 Flash AI Extraction Successful" : "✔ Local Pattern extraction loaded"}
                      </span>
                      <span className={cn(
                        "text-[8.5px] px-2 py-0.5 rounded font-black uppercase font-mono tracking-wider border",
                        parseEngine === 'chatgpt' || parseEngine === 'gemini'
                          ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25" 
                          : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                      )}>
                        {parseEngine === 'chatgpt' ? "ChatGPT-Structured" : parseEngine === 'gemini' ? "Gemini-Structured" : "Local Fallback"}
                      </span>
                    </div>

                    {parserLog && (
                      <div className="p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl text-[9px] text-amber-350 font-mono leading-relaxed">
                        ★ {parserLog}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-400">
                      <div className="flex justify-between"><span>Workforce:</span> <span className="text-white font-bold">{extractedData.techs} Techs</span></div>
                      <div className="flex justify-between"><span>Sublet Sales:</span> <span className="text-white font-bold">${extractedData.subletSales.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>CP Target:</span> <span className="text-indigo-300 font-bold">${extractedData.cpRate.toFixed(0)} ELR ({extractedData.cpMix}%)</span></div>
                      <div className="flex justify-between"><span>Sublet Profit:</span> <span className="text-emerald-450 font-bold">${extractedData.subletGross.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Warranty Target:</span> <span className="text-indigo-300 font-bold">${extractedData.warrRate.toFixed(0)} ELR ({extractedData.warrMix}%)</span></div>
                      <div className="flex justify-between"><span>Misc Sales:</span> <span className="text-white font-bold">${extractedData.miscSales.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Internal Target:</span> <span className="text-indigo-300 font-bold">${extractedData.internalRate.toFixed(0)} ELR ({extractedData.internalMix}%)</span></div>
                      <div className="flex justify-between"><span>Misc Profit:</span> <span className="text-emerald-450 font-bold">${extractedData.miscGross.toLocaleString()}</span></div>
                    </div>

                    <button
                      type="button"
                      onClick={applyExtractedNumbers}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 transition-all text-white text-xs font-black uppercase py-2.5 rounded-xl tracking-wider cursor-pointer shadow-lg shadow-emerald-505/10 flex items-center justify-center gap-2 mt-2"
                    >
                      <Check size={14} /> Pull Extracted Parameters Into Forecaster
                    </button>
                  </div>
                )}
              </div>
            )}

      {/* 7. PREEMINENT PRINT PREVIEW MODAL */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-start p-4 md:p-8 z-50 overflow-y-auto animate-fade-in no-print">
          
          {/* Sticky Toolbar at the top */}
          <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl w-full max-w-4xl flex items-center justify-between gap-4 shadow-2xl mb-6 select-none sticky top-0 z-50">
            <div>
              <span className="text-xxs font-black text-indigo-400 uppercase tracking-widest block mb-0.5">Report Distribution Preview</span>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Printer size={15} className="text-emerald-450 animate-pulse" />
                Capacity & Projections Forecast Report Preview
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                type="button" 
                onClick={handlePrint}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider py-2 px-4 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/10"
              >
                <Printer size={13} />
                Send to Printer / PDF
              </button>
              <button 
                type="button" 
                onClick={() => setIsPreviewOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-black uppercase tracking-wider py-2 px-4 rounded-xl transition-all cursor-pointer border border-white/5"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Paper sheet representation on-screen (Exactly identical to print dimensions & stylish layout) */}
          <div className="bg-white text-slate-900 w-full max-w-4xl p-8 md:p-12 rounded-3xl shadow-2xl border border-slate-200/80 mb-12 space-y-8 select-all self-center animate-scale-in">
            
            {/* HEADER BLOCK */}
            <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em] block">Fixed Operations Capacity Model</span>
                <h1 className="text-3xl font-extrabold uppercase text-slate-900 leading-none tracking-tight">Capacity & Projections Forecast</h1>
                <p className="text-xs font-mono text-slate-500 uppercase flex items-center gap-2">
                  <span className="font-bold text-slate-700">Hyundai of Santa Maria</span>
                  <span className="text-slate-300">•</span>
                  <span>Internal Operational Audit Ledger</span>
                </p>
              </div>
              <div className="text-right font-mono text-[10px] text-slate-500 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="font-bold text-slate-700">Dealer Group Workspace Ledger</div>
                <div className="text-slate-400">Generated on {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </div>

            {/* KEY PERFORMANCE INDICATORS (KPIs): Bento Boxes */}
            <div className="grid grid-cols-4 gap-5 py-2">
              <div className="p-5 bg-slate-50/50 border border-slate-200/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span className="text-[10px] uppercase text-slate-500 font-extrabold tracking-wider block">Projected Net Hours</span>
                <div className="mt-2 text-xl font-mono font-black text-slate-900 whitespace-nowrap">{calculations.totalNetProjectedHours.toFixed(1)} <span className="text-xs text-slate-400 font-normal">hrs</span></div>
                <span className="text-[9px] text-slate-400 font-semibold block mt-1">Derived Capacity Hours</span>
              </div>
              
              <div className="p-5 bg-indigo-50/20 border border-indigo-100/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span className="text-[10px] uppercase text-indigo-600 font-extrabold tracking-wider block">Projected Labor Sales</span>
                <div className="mt-2 text-xl font-mono font-black text-indigo-700">${calculations.totalLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <span className="text-[9px] text-indigo-400 font-semibold block mt-1">Projected Service Volume</span>
              </div>
              
              <div className="p-5 bg-emerald-50/20 border border-emerald-100/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span className="text-[10px] uppercase text-emerald-600 font-extrabold tracking-wider block">Adjusted Profit GP</span>
                <div className="mt-2 text-xl font-mono font-black text-emerald-700">${calculations.adjustedTotalGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <span className="text-[9px] text-emerald-400 font-semibold block mt-1">Net Services GP Yield</span>
              </div>

              <div className="p-5 bg-amber-50/20 border border-amber-100/60 rounded-2xl flex flex-col justify-between shadow-sm">
                <span className="text-[10px] uppercase text-amber-700 font-extrabold tracking-wider block">Blended ELR Baseline</span>
                <div className="mt-2 text-xl font-mono font-black text-amber-800">${calculations.totalELR.toFixed(2)}</div>
                <span className="text-[9px] text-amber-500 font-semibold block mt-1 font-sans">Rate Strategy Objective</span>
              </div>
            </div>

            {/* REVENUE STRATEGY MIX TABLE */}
            <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase text-[9.5px] tracking-wider">
                    <th className="py-3.5 px-4 font-bold">Revenue Block</th>
                    <th className="py-3.5 px-4 text-center font-bold">Mix %</th>
                    <th className="py-3.5 px-4 text-right font-bold">Hours</th>
                    <th className="py-3.5 px-4 text-right font-bold">Target ELR</th>
                    <th className="py-3.5 px-4 text-right font-bold">Labor Sales</th>
                    <th className="py-3.5 px-4 text-center font-bold">GP %</th>
                    <th className="py-3.5 px-4 text-right font-bold">Gross Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">Customer Pay (CP)</td>
                    <td className="py-3.5 px-4 text-center text-slate-600 font-semibold">{inputs.cpMix}%</td>
                    <td className="py-3.5 px-4 text-right text-slate-800">{calculations.cpHours.toFixed(1)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-800">${inputs.cpRate.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-900">${calculations.cpSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td className="py-3.5 px-4 text-center text-slate-600">{inputs.cpGp}%</td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">${calculations.cpGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">Warranty Pay (WARR)</td>
                    <td className="py-3.5 px-4 text-center text-slate-600 font-semibold">{inputs.warrMix}%</td>
                    <td className="py-3.5 px-4 text-right text-slate-800">{calculations.warrHours.toFixed(1)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-800">${inputs.warrRate.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-900">${calculations.warrSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td className="py-3.5 px-4 text-center text-slate-600">{inputs.warrGp}%</td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">${calculations.warrGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">Internal Pay (INT)</td>
                    <td className="py-3.5 px-4 text-center text-slate-600 font-semibold">{inputs.internalMix}%</td>
                    <td className="py-3.5 px-4 text-right text-slate-800">{calculations.internalHours.toFixed(1)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-800">${inputs.internalRate.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-950">${calculations.internalSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td className="py-3.5 px-4 text-center text-slate-600">{inputs.internalGp}%</td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">${calculations.internalGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                  <tr className="bg-slate-900 font-black text-white">
                    <td className="py-4 px-4 uppercase text-[10px]">Totals / Blended</td>
                    <td className="py-4 px-4 text-center">100.0%</td>
                    <td className="py-4 px-4 text-right">{calculations.totalNetProjectedHours.toFixed(1)}</td>
                    <td className="py-4 px-4 text-right">${calculations.totalELR.toFixed(2)}</td>
                    <td className="py-4 px-4 text-right">${calculations.totalLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td className="py-4 px-4 text-center">{calculations.blendedGPPercent.toFixed(1)}%</td>
                    <td className="py-4 px-4 text-right text-emerald-400 font-extrabold">${calculations.totalLaborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* COLUMN SECTIONS: Constant Values & Ledger Adjustments */}
            <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-200">
              
              {/* Capacity block */}
              <div className="space-y-4">
                <div className="border-l-3 border-indigo-600 pl-3">
                  <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider block">Calendar Capacity Constants</span>
                </div>
                <div className="space-y-2.5 font-medium text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span className="text-slate-500">Billing Days:</span>
                    <span className="font-bold font-mono text-slate-900">{inputs.billingDays} days</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span className="text-slate-500">Staffed Workforce:</span>
                    <span className="font-bold font-mono text-slate-900">{inputs.techsAvailable} Techs</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span className="text-slate-500">Standard Shift:</span>
                    <span className="font-bold font-mono text-slate-900">{inputs.hoursPerDay} hrs/day</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 items-center text-rose-600 font-semibold bg-rose-50/50 px-2 rounded-lg py-1.5">
                    <span>Absenteeism Lost Ratio:</span>
                    <span className="font-black font-mono">-{calculations.lostHours.toFixed(1)} hrs ({inputs.absenteeismRate}%)</span>
                  </div>
                  <div className="flex justify-between py-1.5 items-center">
                    <span className="text-slate-500">Shop Applied Efficiency:</span>
                    <span className="font-bold font-mono text-slate-900">{inputs.efficiencyForecast}%</span>
                  </div>
                </div>
              </div>

              {/* Ledger Consolidated and yield display */}
              <div className="space-y-4">
                <div className="border-l-3 border-indigo-600 pl-3">
                  <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider block">Department Ledger Consolidation</span>
                </div>
                <div className="space-y-2.5 font-medium text-xs font-sans">
                  <div className="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span className="text-slate-500">Calculated Labor Gross Yield:</span>
                    <span className="font-bold font-mono text-slate-900">${calculations.totalLaborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span className="text-slate-500">Sublet Profit (Sales: ${inputs.subletSales.toLocaleString()}):</span>
                    <span className="font-bold font-mono text-slate-900">${inputs.subletGross.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 items-center">
                    <span className="text-slate-500">Miscellaneous Profit (Sales: ${inputs.miscSales.toLocaleString()}):</span>
                    <span className="font-bold font-mono text-slate-900">${inputs.miscGross.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                  </div>
                  
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 mt-3 flex justify-between items-center text-emerald-950 select-all font-bold transition-all">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span className="text-[10px] uppercase tracking-wider text-emerald-800">Adjusted GP Yield:</span>
                    </div>
                    <span className="font-mono font-black text-base">${calculations.adjustedTotalGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* FOOTER BRANDING */}
            <div className="pt-8 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 font-mono select-none">
              <div>HYUNDAI OF SANTA MARIA • FINANCIAL REPORTING</div>
              <div>CLASSIFICATION: CONFIDENTIAL</div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
