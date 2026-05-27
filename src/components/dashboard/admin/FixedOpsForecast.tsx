import React, { useState, useMemo } from 'react';
import { cn } from '../../../lib/utils';
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
}

const performDeterministicExtraction = (text: string): ExtractedData => {
  const data: ExtractedData = {
    techs: 7,
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
      unappliedTime: 0
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

  // Input states aligned exactly with spreadsheet layout in mockup
  const [inputs, setInputs] = useState({
    billingDays: 22,
    techsAvailable: 7,
    hoursPerDay: 8,
    absenteeismRate: 5,        // absenteeism factor: 5%
    efficiencyForecast: 100,    // shop efficiency: 100%
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

  // Modal toggle state for DMS PDF data upload
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [fileExtracting, setFileExtracting] = useState<boolean>(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [reportRawText, setReportRawText] = useState<string>('');
  const [selectedSample, setSelectedSample] = useState<string>('');
  const [pdfActiveTab, setPdfActiveTab] = useState<'upload' | 'sample'>('upload');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Apply Preset Values
  const applyPreset = (presetName: 'conservative' | 'balanced' | 'aggressive') => {
    setActivePreset(presetName);
    if (presetName === 'conservative') {
      setInputs({
        billingDays: 22,
        techsAvailable: 6,
        hoursPerDay: 8,
        absenteeismRate: 8,
        efficiencyForecast: 90,
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
      onSuccess?.("Applied Conservative capacity forecasting parameters!");
    } else if (presetName === 'balanced') {
      setInputs({
        billingDays: 22,
        techsAvailable: 7,
        hoursPerDay: 8,
        absenteeismRate: 5,
        efficiencyForecast: 100,
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
      onSuccess?.("Applied Balanced baseline capacity forecasting parameters!");
    } else if (presetName === 'aggressive') {
      setInputs({
        billingDays: 22,
        techsAvailable: 8,
        hoursPerDay: 8,
        absenteeismRate: 3,
        efficiencyForecast: 110,
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
        miscSales: 8000,
        miscGross: 2000,
        unappliedTime: 0
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
    setIsPdfModalOpen(false);
    onSuccess?.("Loaded audited variables from report successfully!");
  };

  const handlePdfUpload = async (file: File) => {
    setFileExtracting(true);
    setValidationError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || '5.7.284'}/build/pdf.worker.min.mjs`;
      
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      let text = "";
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        text += pageText + "\n";
      }

      setReportRawText(text);
      const parsed = performDeterministicExtraction(text);
      setExtractedData(parsed);
      setSelectedSample('');
      onSuccess?.(`Successfully pulled text from PDF: ${file.name}`);
    } catch (err: any) {
      console.error(err);
      setValidationError("Failed to extract legible text from PDF. Ensure PDF is a plain-text digital document, or copy and paste raw report text directly!");
    } finally {
      setFileExtracting(false);
    }
  };

  const handleSampleSelected = (sampleId: string) => {
    setSelectedSample(sampleId);
    const found = SAMPLE_DMS_REPORTS.find(s => s.id === sampleId);
    if (found) {
      setReportRawText(found.text);
      const parsed = performDeterministicExtraction(found.text);
      setExtractedData(parsed);
      onSuccess?.(`Loaded sample DMS record: ${found.name}`);
    } else {
      setReportRawText('');
      setExtractedData(null);
    }
  };

  // Recharts Data Configuration
  const barChartData = [
    {
      name: 'Labor Sales',
      current: LIVE_MTD_TELEMETRY.grossLaborSales,
      projected: calculations.totalLaborSales,
    },
    {
      name: 'Labor Gross',
      current: LIVE_MTD_TELEMETRY.laborGrossProfit,
      projected: calculations.totalLaborGrossProfit,
    },
  ];

  const pieChartData = [
    { name: 'Customer Pay', value: calculations.cpSales },
    { name: 'Warranty', value: calculations.warrSales },
    { name: 'Internal', value: calculations.internalSales },
  ];

  const PIE_COLORS = ['#3b82f6', '#4f46e5', '#a855f7'];

  // Elegant Print Handler
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
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          </style>
        </head>
        <body class="bg-white text-slate-900 p-8">
          <div class="max-w-4xl mx-auto space-y-6">
            <div class="border-b border-slate-300 pb-4 flex justify-between items-center">
              <div>
                <span class="text-[10px] font-black text-[#4f46e5] uppercase tracking-wider block">Fixed Operations Capacity Model</span>
                <h1 class="text-2xl font-black uppercase text-slate-900 leading-none mt-1">Capacity & Projections Forecast</h1>
                <p class="text-xs font-mono text-slate-500 uppercase mt-1">Hyundai of Santa Maria</p>
              </div>
              <div class="text-right font-mono text-[10px] text-slate-600">
                <div>Dealer Group Workspace Ledger</div>
                <div>Generated: ${dateStr}</div>
              </div>
            </div>

            <div class="grid grid-cols-4 gap-4 py-4">
              <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span class="text-[9px] uppercase text-slate-500 font-bold block">Projected Net Hours</span>
                <span class="text-lg font-mono font-black mt-1 block">${calculations.totalNetProjectedHours.toFixed(1)} hrs</span>
              </div>
              <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span class="text-[9px] uppercase text-slate-500 font-bold block">Projected Labor Sales</span>
                <span class="text-lg font-mono font-black mt-1 block">$${calculations.totalLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
              </div>
              <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span class="text-[9px] uppercase text-slate-500 font-bold block">Adjusted Profit GP</span>
                <span class="text-lg font-mono font-black text-emerald-700 mt-1 block block">$${calculations.adjustedTotalGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
              </div>
              <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span class="text-[9px] uppercase text-slate-500 font-bold block">Blended ELR Baseline</span>
                <span class="text-lg font-mono font-black mt-1 block">$${calculations.totalELR.toFixed(2)}</span>
              </div>
            </div>

            <table class="w-full text-left font-mono text-xs border border-slate-300">
              <thead>
                <tr class="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 uppercase">
                  <th class="py-2.5 px-3">Revenue Block</th>
                  <th class="py-2.5 px-3 text-center">Mix %</th>
                  <th class="py-2.5 px-3 text-right">Hours</th>
                  <th class="py-2.5 px-3 text-right">Target ELR</th>
                  <th class="py-2.5 px-3 text-right">Labor Sales</th>
                  <th class="py-2.5 px-3 text-center">GP %</th>
                  <th class="py-2.5 px-3 text-right">Gross Profit</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                <tr>
                  <td class="py-2 px-3 font-bold">Customer Pay (CP)</td>
                  <td class="py-2 px-3 text-center">${inputs.cpMix}%</td>
                  <td class="py-2 px-3 text-right">${calculations.cpHours.toFixed(1)}</td>
                  <td class="py-2 px-3 text-right">$${inputs.cpRate.toFixed(2)}</td>
                  <td class="py-2 px-3 text-right">$${calculations.cpSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  <td class="py-2 px-3 text-center">${inputs.cpGp}%</td>
                  <td class="py-2 px-3 text-right font-bold text-emerald-800">$${calculations.cpGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                </tr>
                <tr>
                  <td class="py-2 px-3 font-bold">Warranty Pay (WARR)</td>
                  <td class="py-2 px-3 text-center">${inputs.warrMix}%</td>
                  <td class="py-2 px-3 text-right">${calculations.warrHours.toFixed(1)}</td>
                  <td class="py-2 px-3 text-right">$${inputs.warrRate.toFixed(2)}</td>
                  <td class="py-2 px-3 text-right">$${calculations.warrSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  <td class="py-2 px-3 text-center">${inputs.warrGp}%</td>
                  <td class="py-2 px-3 text-right font-bold text-emerald-800">$${calculations.warrGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                </tr>
                <tr>
                  <td class="py-2 px-3 font-bold">Internal Pay (INT)</td>
                  <td class="py-2 px-3 text-center">${inputs.internalMix}%</td>
                  <td class="py-2 px-3 text-right">${calculations.internalHours.toFixed(1)}</td>
                  <td class="py-2 px-3 text-right">$${inputs.internalRate.toFixed(2)}</td>
                  <td class="py-2 px-3 text-right">$${calculations.internalSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  <td class="py-2 px-3 text-center">${inputs.internalGp}%</td>
                  <td class="py-2 px-3 text-right font-bold text-emerald-800">$${calculations.internalGross.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                </tr>
                <tr class="bg-slate-50 font-bold border-t-2 border-slate-400">
                  <td class="py-2.5 px-3 uppercase">Totals / Blended</td>
                  <td class="py-2.5 px-3 text-center">100.0%</td>
                  <td class="py-2.5 px-3 text-right">${calculations.totalNetProjectedHours.toFixed(1)}</td>
                  <td class="py-2.5 px-3 text-right">$${calculations.totalELR.toFixed(2)}</td>
                  <td class="py-2.5 px-3 text-right">$${calculations.totalLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                  <td class="py-2.5 px-3 text-center">${calculations.blendedGPPercent.toFixed(1)}%</td>
                  <td class="py-2.5 px-3 text-right font-bold text-slate-900">$${calculations.totalLaborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                </tr>
              </tbody>
            </table>

            <div class="grid grid-cols-2 gap-6 pt-4 border-t border-slate-300">
              <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <span class="text-[10px] font-black uppercase text-slate-500 block">Calendar Capacity Constants</span>
                <div class="flex justify-between"><span>Billing Days:</span> <span class="font-bold">${inputs.billingDays} days</span></div>
                <div class="flex justify-between"><span>Staffed Workforce:</span> <span class="font-bold">${inputs.techsAvailable} Techs</span></div>
                <div class="flex justify-between"><span>Standard Shift:</span> <span class="font-bold">${inputs.hoursPerDay} hrs/day</span></div>
                <div class="flex justify-between text-rose-600"><span>Absenteeism Lost Ratio:</span> <span class="font-bold">-${calculations.lostHours.toFixed(1)} hrs (${inputs.absenteeismRate}%)</span></div>
                <div class="flex justify-between"><span>Shop Applied Efficiency:</span> <span class="font-bold">${inputs.efficiencyForecast}%</span></div>
              </div>
              <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <span class="text-[10px] font-black uppercase text-slate-500 block">Department Ledger Consolidation</span>
                <div class="flex justify-between"><span>Calculated Labor Gross Yield:</span> <span class="font-bold">$${calculations.totalLaborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span></div>
                <div class="flex justify-between"><span>Sublet Operations Profit (Sales: $${inputs.subletSales}):</span> <span class="font-bold">$${inputs.subletGross}</span></div>
                <div class="flex justify-between"><span>Miscellaneous Operations Profit (Sales: $${inputs.miscSales}):</span> <span class="font-bold">$${inputs.miscGross}</span></div>
                <div class="flex justify-between text-xs font-black border-t pt-1.5 mt-1.5 text-emerald-800">
                  <span>Adjusted Department GP Yield:</span>
                  <span>$${calculations.adjustedTotalGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                </div>
              </div>
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
            onClick={handlePrint}
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
                ${LIVE_MTD_TELEMETRY.grossLaborSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">MTD Labor Gross Profit</span>
              <span className="text-lg font-mono font-black text-indigo-400 mt-1 block select-all">
                ${LIVE_MTD_TELEMETRY.laborGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                <span className="text-[10px] text-slate-400 font-bold ml-1.5 select-none">({LIVE_MTD_TELEMETRY.laborGPPercent}%)</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-[#050811] border border-white/[0.02] p-4 rounded-xl">
              <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Hours Sold</span>
                <span className="text-sm font-mono font-black text-white mt-1 block font-mono">
                  {LIVE_MTD_TELEMETRY.hoursSold.toFixed(1)} hrs
                </span>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Repair Orders</span>
                <span className="text-sm font-mono font-black text-white mt-1 block font-mono">
                  {LIVE_MTD_TELEMETRY.repairOrdersWritten} ROs
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Effective Labor Rate (ELR)</span>
                <span className="text-xl font-mono font-black text-indigo-400 mt-0.5 block">
                  ${LIVE_MTD_TELEMETRY.effectiveLaborRate.toFixed(2)}
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
            </div>

            {/* PORTFOLIO YIELD & MIX */}
            <div className="space-y-4 pt-2 border-t border-white/5">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block font-mono select-none">☇ Portfolio Yield & Mix</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Mix allocations */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Labor Portfolio Mix Allocation</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider font-mono",
                      totalMixAllocationValue === 100 
                        ? "bg-emerald-500/10 text-emerald-400" 
                        : "bg-red-500/10 text-red-500"
                    )}>
                      {totalMixAllocationValue}% / 100%
                    </span>
                  </div>

                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between items-center bg-[#050811] p-1.5 rounded-xl border border-white/5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Customer Pay (CP)</span>
                      <div className="flex items-center gap-1.5 mr-2">
                        <input 
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={inputs.cpMix}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            setInputs({...inputs, cpMix: val});
                          }}
                          className="w-16 bg-[#050811] border border-slate-800 rounded px-1.5 py-0.5 text-center font-black text-xs text-white"
                        />
                        <span className="text-[10px] text-slate-500 font-black">%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-[#050811] p-1.5 rounded-xl border border-white/5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Warranty (Warr)</span>
                      <div className="flex items-center gap-1.5 mr-2">
                        <input 
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={inputs.warrMix}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            setInputs({...inputs, warrMix: val});
                          }}
                          className="w-16 bg-[#050811] border border-slate-800 rounded px-1.5 py-0.5 text-center font-black text-xs text-white"
                        />
                        <span className="text-[10px] text-slate-500 font-black">%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-[#050811] p-1.5 rounded-xl border border-white/5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Internal</span>
                      <div className="flex items-center gap-1.5 mr-2">
                        <input 
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={inputs.internalMix}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            setInputs({...inputs, internalMix: val});
                          }}
                          className="w-16 bg-[#050811] border border-slate-800 rounded px-1.5 py-0.5 text-center font-black text-xs text-white"
                        />
                        <span className="text-[10px] text-slate-500 font-black pr-2">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Targets (ELR & GP Margin) Column */}
                <div className="space-y-4 font-mono">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Hourly Target ELR ($)</span>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">CP</label>
                        <input 
                          type="number"
                          value={inputs.cpRate}
                          onChange={(e) => setInputs({...inputs, cpRate: parseFloat(e.target.value) || 0})}
                          className="w-full bg-[#050811] border border-white/5 focus:border-indigo-500 rounded-lg p-2 text-center text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Warranty</label>
                        <input 
                          type="number"
                          value={inputs.warrRate}
                          onChange={(e) => setInputs({...inputs, warrRate: parseFloat(e.target.value) || 0})}
                          className="w-full bg-[#050811] border border-white/5 focus:border-indigo-500 rounded-lg p-2 text-center text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Internal</label>
                        <input 
                          type="number"
                          value={inputs.internalRate}
                          onChange={(e) => setInputs({...inputs, internalRate: parseFloat(e.target.value) || 0})}
                          className="w-full bg-[#050811] border border-white/5 focus:border-indigo-500 rounded-lg p-2 text-center text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Target GP Margin (%)</span>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">CP</label>
                        <input 
                          type="number"
                          max="100"
                          value={inputs.cpGp}
                          onChange={(e) => setInputs({...inputs, cpGp: parseFloat(e.target.value) || 0})}
                          className="w-full bg-[#050811] border border-white/5 focus:border-indigo-500 rounded-lg p-2 text-center text-white animate-in"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Warranty</label>
                        <input 
                          type="number"
                          max="100"
                          value={inputs.warrGp}
                          onChange={(e) => setInputs({...inputs, warrGp: parseFloat(e.target.value) || 0})}
                          className="w-full bg-[#050811] border border-white/5 focus:border-indigo-500 rounded-lg p-2 text-center text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Internal</label>
                        <input 
                          type="number"
                          max="100"
                          value={inputs.internalGp}
                          onChange={(e) => setInputs({...inputs, internalGp: parseFloat(e.target.value) || 0})}
                          className="w-full bg-[#050811] border border-white/5 focus:border-indigo-500 rounded-lg p-2 text-center text-white"
                        />
                      </div>
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
              Live baseline comparison: ${LIVE_MTD_TELEMETRY.effectiveLaborRate.toFixed(2)}
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
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 font-mono">Rule-Based Extraction Panel • 100% Client-Side</p>
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
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block">✔ Audit Parser Extracted Successfully</span>
                      <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase font-mono">DMS Matched</span>
                    </div>

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

            <div className="flex justify-end pt-3 border-t border-white/5 gap-3">
              <button 
                type="button" 
                onClick={() => setIsPdfModalOpen(false)}
                className="px-4 py-2 text-xs font-black uppercase text-slate-400 hover:text-white bg-transparent hover:bg-white/5 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
