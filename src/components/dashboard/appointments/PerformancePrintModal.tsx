import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Printer, X, FileText, Loader2, TrendingUp, Award } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { performanceDocId } from '../../../lib/operationsViewPeriod';
import { isMonthKey, monthKeyRange } from '../../../lib/operationsMonthKeys';
import { toLocalDateString } from '../../../lib/appointmentTracker';
import type { ShowUpSummary } from '../../../lib/appointmentShowUp';

// Helper: US Federal Holidays definitions
const isFederalHoliday = (date: Date): boolean => {
  const m = date.getMonth(); // 0-indexed: 0=Jan, 11=Dec
  const d = date.getDate();
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Standard fixed holidays
  if (m === 0 && d === 1) return true; // New Year's Day
  if (m === 5 && d === 19) return true; // Juneteenth
  if (m === 6 && d === 4) return true; // Independence Day
  if (m === 10 && d === 11) return true; // Veterans Day
  if (m === 11 && d === 25) return true; // Christmas Day

  // Floating holidays
  // 3rd Monday of Jan: MLK Day
  if (m === 0 && day === 1 && d >= 15 && d <= 21) return true;
  // 3rd Monday of Feb: Presidents' Day
  if (m === 1 && day === 1 && d >= 15 && d <= 21) return true;
  // Last Monday of May: Memorial Day (between May 25 and May 31)
  if (m === 4 && day === 1 && d >= 25 && d <= 31) return true;
  // 1st Monday of Sep: Labor Day
  if (m === 8 && day === 1 && d >= 1 && d <= 7) return true;
  // 2nd Monday of Oct: Columbus Day
  if (m === 9 && day === 1 && d >= 8 && d <= 14) return true;
  // 4th Thursday of Nov: Thanksgiving
  if (m === 10 && day === 4 && d >= 22 && d <= 28) return true;

  return false;
};

// Helper: Calculate total working days Mon-Fri excluding federal holidays
const getWorkingDaysCount = (startStr: string, endStr: string): number => {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    if (isWorkingDay && !isFederalHoliday(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

// Helper: Format date input string into classic US "M/D/YY" or similar
const formatDateRangeShort = (startStr: string, endStr: string): string => {
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return s;
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().substring(2)}`;
  };
  return `${fmt(startStr)}-${fmt(endStr)}`;
};

/** Names and labels come from PBS; nothing from it goes into the print page as markup. */
const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const money = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface UpsellItem {
  code: string;
  description: string;
  count: number;
  revenue: number;
}

interface AdvisorData {
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
  upsells?: UpsellItem[];
}

interface TechnicianData {
  techName: string;
  clockedHours: number;
  flaggedHours: number;
  efficiency: number;
}

interface PerformancePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDealershipId: string;
  selectedMonth?: string;
  /**
   * The month's show-up rate, as the Operations card shows it. The report used
   * to divide repair orders by booked appointments instead — walk-ins counted
   * as shows — and print 91.5% when it had nothing to divide.
   */
  showUp?: ShowUpSummary | null;
}

/** The dates a month covers when its document does not say: never invented ones. */
function fallbackRange(selectedMonth: string): { start: string; end: string } {
  if (isMonthKey(selectedMonth)) return monthKeyRange(selectedMonth);
  const today = toLocalDateString(new Date());
  return { start: `${today.slice(0, 8)}01`, end: today };
}

/** Everything the report prints, worked out once for both the preview and the print page. */
function buildReport(
  advisors: AdvisorData[],
  technicians: TechnicianData[],
  advisorRange: { start: string; end: string },
  techRange: { start: string; end: string },
  showUp: ShowUpSummary | null | undefined
) {
  const totalSOs = advisors.reduce((sum, a) => sum + (a.soCount || 0), 0);
  const totalHrs = advisors.reduce((sum, a) => sum + (a.hrsSold || 0), 0);
  const totalLabor = advisors.reduce((sum, a) => sum + (a.laborSold || 0), 0);
  const totalLaborGross = advisors.reduce((sum, a) => sum + (a.grossLabor || 0), 0);
  const totalParts = advisors.reduce((sum, a) => sum + (a.partsSold || 0), 0);
  const totalPartsGross = advisors.reduce((sum, a) => sum + (a.grossParts || 0), 0);
  const totalSales = advisors.reduce((sum, a) => sum + (a.totalSales || 0), 0);
  const elr = totalHrs > 0 ? Math.round((totalLabor / totalHrs) * 100) / 100 : 0;
  const gp = totalSales > 0 ? Math.round(((totalLaborGross + totalPartsGross) / totalSales) * 1000) / 10 : 0;

  const workingDays = getWorkingDaysCount(advisorRange.start, advisorRange.end);
  const avgROsPerDay = workingDays > 0 ? (totalSOs / workingDays).toFixed(1) : '—';

  // Clocked hours of 0 means PBS sent no time clock for that tech, not that they
  // worked no hours. Efficiency is only worked out where there is a clock.
  const clocked = technicians.filter((t) => (t.clockedHours || 0) > 0);
  const totalClocked = clocked.reduce((sum, t) => sum + t.clockedHours, 0);
  const totalFlagged = technicians.reduce((sum, t) => sum + (t.flaggedHours || 0), 0);
  const flaggedOnClocked = clocked.reduce((sum, t) => sum + (t.flaggedHours || 0), 0);
  const shopEfficiency = totalClocked > 0 ? Math.round((flaggedOnClocked / totalClocked) * 100) : null;

  const judged = showUp ? showUp.showed + showUp.noShow : 0;
  return {
    totalSOs,
    totalHrs,
    totalLabor,
    totalLaborGross,
    totalParts,
    totalPartsGross,
    elr,
    gp,
    workingDays,
    avgROsPerDay,
    advisorPeriod: formatDateRangeShort(advisorRange.start, advisorRange.end),
    techPeriod: formatDateRangeShort(techRange.start, techRange.end),
    hasClock: clocked.length > 0,
    totalClocked,
    totalFlagged,
    shopEfficiency,
    showUpRate: showUp?.rate ?? null,
    showUpDetail: showUp?.rate != null ? `${showUp.showed} of ${judged} came in` : 'No appointment schedule',
  };
}

function techRow(tech: TechnicianData) {
  const hasClock = (tech.clockedHours || 0) > 0;
  return {
    clocked: hasClock ? `${tech.clockedHours.toFixed(2)} hrs` : '—',
    flagged: `${(tech.flaggedHours || 0).toFixed(2)} hrs`,
    efficiency: hasClock ? `${tech.efficiency}%` : '—',
    status: hasClock ? (tech.efficiency >= 80 ? 'Above Standard' : 'Below Standard') : 'No clock data',
    tone: hasClock ? (tech.efficiency >= 80 ? 'good' : 'bad') : 'none',
  } as const;
}

export const PerformancePrintModal: React.FC<PerformancePrintModalProps> = ({
  isOpen,
  onClose,
  currentDealershipId,
  selectedMonth = 'active',
  showUp,
}) => {
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianData[]>([]);
  const [loadingAdvisors, setLoadingAdvisors] = useState(true);
  const [loadingTechs, setLoadingTechs] = useState(true);
  const [advisorDates, setAdvisorDates] = useState<{ start?: string; end?: string }>({});
  const [techDates, setTechDates] = useState<{ start?: string; end?: string }>({});

  // Capitalize dealership name
  const dealershipName = currentDealershipId === 'hyundai'
    ? 'HYUNDAI OF SANTA MARIA'
    : `${currentDealershipId.toUpperCase()} DEALERSHIP`;

  useEffect(() => {
    if (!isOpen || !currentDealershipId) return;

    // A month switched while open must not keep the last month's dates.
    setLoadingAdvisors(true);
    setLoadingTechs(true);
    setAdvisorDates({});
    setTechDates({});

    const performancePath = ['artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance'] as const;
    const advRef = doc(db, ...performancePath, performanceDocId('advisorReports', currentDealershipId, selectedMonth));
    const unsubAdvisors = onSnapshot(advRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : undefined;
      // "Jay" was a junk line in the old PDF reports, never an advisor.
      setAdvisors(((data?.advisors || []) as AdvisorData[]).filter((a) => String(a.name || '').toLowerCase().trim() !== 'jay'));
      setAdvisorDates({ start: data?.reportStartDate, end: data?.reportEndDate });
      setLoadingAdvisors(false);
    }, (err) => {
      console.error("Print Modal failed to subscribe to advisors:", err);
      setLoadingAdvisors(false);
    });

    const techRef = doc(db, ...performancePath, performanceDocId('technicianReports', currentDealershipId, selectedMonth));
    const unsubTechs = onSnapshot(techRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : undefined;
      setTechnicians((data?.technicians || []) as TechnicianData[]);
      setTechDates({ start: data?.reportStartDate, end: data?.reportEndDate });
      setLoadingTechs(false);
    }, (err) => {
      console.error("Print Modal failed to subscribe to technicians:", err);
      setLoadingTechs(false);
    });

    return () => {
      unsubAdvisors();
      unsubTechs();
    };
  }, [isOpen, currentDealershipId, selectedMonth]);

  const report = useMemo(() => {
    const fallback = fallbackRange(selectedMonth);
    const advisorRange = { start: advisorDates.start || fallback.start, end: advisorDates.end || fallback.end };
    const techRange = { start: techDates.start || fallback.start, end: techDates.end || fallback.end };
    return buildReport(advisors, technicians, advisorRange, techRange, showUp);
  }, [advisors, technicians, advisorDates, techDates, selectedMonth, showUp]);

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Handle direct command to trigger print
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

    const advisorRows = advisors.map((advisor) => {
      const elrVal = (advisor.hrsSold || 0) > 0 ? advisor.laborSold / advisor.hrsSold : 0;
      return `
        <tr class="border-b border-gray-200 text-[11px] text-gray-800">
          <td class="py-3 px-3 font-bold text-gray-900">${escapeHtml(advisor.name)}</td>
          <td class="py-3 px-2 text-right">${money(advisor.laborSold)}</td>
          <td class="py-3 px-2 text-right">${money(advisor.grossLabor)}</td>
          <td class="py-3 px-2 text-right">${money(advisor.partsSold)}</td>
          <td class="py-3 px-2 text-right">${money(advisor.grossParts)}</td>
          <td class="py-3 px-2 text-center font-bold text-gray-950">$${(advisor.elr || elrVal || 0).toFixed(2)}</td>
          <td class="py-3 px-2 text-center font-bold text-emerald-700">${(advisor.gpPercent || 0).toFixed(1)}%</td>
          <td class="py-3 px-2 text-center text-gray-800 font-medium">${(advisor.hrsSold || 0).toFixed(1)}</td>
          <td class="py-3 px-3 text-center text-gray-800 font-medium">${advisor.soCount || 0}</td>
        </tr>
      `;
    }).join('');

    const technicianRows = technicians.map((tech) => {
      const row = techRow(tech);
      const statusClass = row.tone === 'good'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : row.tone === 'bad'
          ? 'bg-rose-50 text-rose-700 border-rose-200 font-semibold'
          : 'bg-slate-50 text-slate-500 border-slate-200';
      return `
        <tr class="border-b border-gray-200 text-[11px] text-gray-800">
          <td class="py-3 px-4 font-bold text-gray-900">${escapeHtml(tech.techName)}</td>
          <td class="py-3 px-4 text-center font-medium">${row.clocked}</td>
          <td class="py-3 px-4 text-center font-medium">${row.flagged}</td>
          <td class="py-3 px-4 text-center font-semibold text-gray-900">${row.efficiency}</td>
          <td class="py-3 px-6 text-center">
            <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-extrabold border ${statusClass}">${row.status}</span>
          </td>
        </tr>
      `;
    }).join('');

    const clockNote = !report.hasClock && technicians.length > 0
      ? `<p class="text-[11px] text-slate-500 mb-3">PBS sent no time clock for this period, so efficiency can't be worked out. Flagged hours are shown.</p>`
      : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fixed Ops Executive Report - ${escapeHtml(dealershipName)}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body {
              font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            /* Tailwind is loaded from a CDN. If the dealership is offline or the
               network blocks it, the report must still be a legible document
               rather than a wall of unstyled text — these rules carry it. */
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { font-weight: 600; }
            h1 { font-size: 24px; margin: 0 0 4px; }
            h2 { font-size: 15px; margin: 20px 0 8px; }

            @page { margin: 14mm; }

            @media print {
              body {
                background: white !important;
                color: black !important;
                padding: 0 !important;
              }
              /* Keep a table's header with its rows and never split a row. */
              thead { display: table-header-group; }
              tr { break-inside: avoid; }
              .paper {
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
              }
              .page-break {
                page-break-before: always !important;
                break-before: page !important;
              }
            }
          </style>
        </head>
        <body class="bg-gray-50 text-slate-900 p-8">
          <div class="paper max-w-5xl mx-auto bg-white p-10 rounded-lg border border-gray-200 shadow-xl space-y-8">

            <div class="border-b-2 border-slate-900 pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span class="inline-block px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-[11px] font-semibold text-slate-700 mb-2">
                  Dealership Executive Report
                </span>
                <h1 class="text-3xl font-semibold tracking-tight text-slate-900 leading-none">${escapeHtml(dealershipName)}</h1>
                <p class="text-xs text-slate-500 font-bold mt-1.5">Advisor Performance & Technician Efficiency Summary</p>
              </div>
              <div class="text-left md:text-right border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                <p class="text-[11px] font-semibold text-slate-400">Report Generated On</p>
                <p class="text-xs font-semibold text-slate-800 tracking-tight mt-0.5">${todayStr}</p>
                <p class="text-[11px] text-slate-500 font-semibold mt-1">Fixed operations performance</p>
              </div>
            </div>

            <div class="space-y-4">
              <div class="flex justify-between items-end border-b border-slate-900 pb-2">
                <h2 class="text-sm font-semibold text-slate-900">I. Fixed Ops Performance</h2>
                <span class="text-[11px] font-semibold text-slate-500">${report.advisorPeriod}</span>
              </div>

              <div class="grid grid-cols-4 gap-3 mb-4">
                <div class="bg-slate-50 border border-gray-200 p-3 rounded-md min-w-0">
                  <p class="text-[11px] font-semibold text-gray-400 truncate">Total Repair Orders</p>
                  <p class="text-[17px] font-semibold text-slate-900 mt-0.5 truncate">${report.totalSOs}</p>
                </div>
                <div class="bg-slate-50 border border-gray-200 p-3 rounded-md min-w-0">
                  <p class="text-[11px] font-semibold text-gray-400 truncate">Avg ROs / Day</p>
                  <p class="text-[17px] font-semibold text-slate-900 mt-0.5 truncate">${report.avgROsPerDay}</p>
                  <p class="text-[11px] text-gray-400 mt-0.5 font-bold tracking-wide">${report.workingDays} working days</p>
                </div>
                <div class="bg-slate-50 border border-gray-200 p-3 rounded-md min-w-0">
                  <p class="text-[11px] font-semibold text-gray-400 truncate">Hours Sold</p>
                  <p class="text-[17px] font-semibold text-slate-900 mt-0.5 truncate">${report.totalHrs.toFixed(1)} hrs</p>
                </div>
                <div class="bg-slate-50 border border-gray-200 p-3 rounded-md min-w-0">
                  <p class="text-[11px] font-semibold text-gray-400 truncate">Show-up Rate</p>
                  <p class="text-[17px] font-semibold text-emerald-800 mt-0.5 truncate">${report.showUpRate != null ? `${report.showUpRate}%` : '—'}</p>
                  <p class="text-[11px] text-gray-400 mt-0.5 font-bold tracking-wide">${escapeHtml(report.showUpDetail)}</p>
                </div>
              </div>

              <div class="border border-gray-200 rounded-md overflow-hidden">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-slate-900 text-white text-[11px] font-semibold">
                      <th class="py-2.5 px-3">Advisor Name</th>
                      <th class="py-2.5 px-2 text-right">Labor Sales</th>
                      <th class="py-2.5 px-2 text-right">Labor Gross</th>
                      <th class="py-2.5 px-2 text-right">Part Sales</th>
                      <th class="py-2.5 px-2 text-right">Parts Gross</th>
                      <th class="py-2.5 px-2 text-center">ELR</th>
                      <th class="py-2.5 px-2 text-center">GP %</th>
                      <th class="py-2.5 px-2 text-center">Hours Sold</th>
                      <th class="py-2.5 px-3 text-center">RO Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${advisorRows}
                    <tr class="bg-slate-100 border-t-2 border-slate-900 text-[11px] font-semibold text-slate-950">
                      <td class="py-3 px-3">Department Totals</td>
                      <td class="py-3 px-2 text-right">${money(report.totalLabor)}</td>
                      <td class="py-3 px-2 text-right">${money(report.totalLaborGross)}</td>
                      <td class="py-3 px-2 text-right">${money(report.totalParts)}</td>
                      <td class="py-3 px-2 text-right">${money(report.totalPartsGross)}</td>
                      <td class="py-3 px-2 text-center">$${report.elr.toFixed(2)}</td>
                      <td class="py-3 px-2 text-center">${report.gp.toFixed(1)}%</td>
                      <td class="py-3 px-2 text-center">${report.totalHrs.toFixed(1)}</td>
                      <td class="py-3 px-3 text-center">${report.totalSOs}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="border-t border-gray-200 pt-6 mt-8 flex justify-end items-center text-[11px] text-gray-400 font-medium">
                <p class="italic">Page 1 of 2 — Confidentially Distributed Report</p>
              </div>
            </div>

            <div class="space-y-4 pt-4 page-break" style="page-break-before: always; break-before: page; margin-top: 30px; padding-top: 20px;">
              <div class="flex justify-between items-end border-b border-slate-900 pb-2">
                <h2 class="text-sm font-semibold text-slate-900">II. Workshop Technician Efficiency Summary</h2>
                <span class="text-[11px] font-semibold text-slate-500">${report.techPeriod}</span>
              </div>

              <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-slate-50 border border-gray-200 p-3 rounded-md min-w-0">
                  <p class="text-[11px] font-semibold text-gray-400 truncate">Total Clocked Hours</p>
                  <p class="text-[17px] font-semibold text-slate-900 mt-0.5 truncate">${report.hasClock ? `${report.totalClocked.toFixed(2)} hrs` : '—'}</p>
                </div>
                <div class="bg-slate-50 border border-gray-200 p-3 rounded-md min-w-0">
                  <p class="text-[11px] font-semibold text-gray-400 truncate">Total Flagged Hours</p>
                  <p class="text-[17px] font-semibold text-slate-900 mt-0.5 truncate">${report.totalFlagged.toFixed(2)} hrs</p>
                </div>
                <div class="bg-slate-50 border border-gray-200 p-3 rounded-md min-w-0">
                  <p class="text-[11px] font-semibold text-gray-400 truncate">Workshop Average Efficiency</p>
                  <p class="text-[17px] font-semibold text-indigo-700 mt-0.5 truncate">${report.shopEfficiency != null ? `${report.shopEfficiency}%` : '—'}</p>
                </div>
              </div>
              ${clockNote}

              <div class="border border-gray-200 rounded-md overflow-hidden">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-slate-900 text-white text-[11px] font-semibold">
                      <th class="py-3 px-4">Technician Name</th>
                      <th class="py-3 px-4 text-center">Clocked In Hours</th>
                      <th class="py-3 px-4 text-center">Flagged (Sold) Hours</th>
                      <th class="py-3 px-4 text-center">Productivity Efficiency %</th>
                      <th class="py-3 px-6 text-center">Status Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${technicianRows}
                    <tr class="bg-slate-100 border-t-2 border-slate-900 text-[11px] font-semibold text-slate-950">
                      <td class="py-3 px-4">Workshop Summary</td>
                      <td class="py-3 px-4 text-center">${report.hasClock ? `${report.totalClocked.toFixed(2)} hrs` : '—'}</td>
                      <td class="py-3 px-4 text-center">${report.totalFlagged.toFixed(2)} hrs</td>
                      <td class="py-3 px-4 text-center text-indigo-900">${report.shopEfficiency != null ? `${report.shopEfficiency}%` : '—'}</td>
                      <td class="py-3 px-6 text-center text-slate-600">Active Staff (${technicians.length})</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="border-t border-gray-200 pt-6 mt-8 flex justify-end items-center text-[11px] text-gray-400 font-medium">
              <p class="italic">Page 2 of 2 — Confidentially Distributed Report</p>
            </div>

          </div>

          <script>
            window.addEventListener('load', () => {
              setTimeout(() => { window.print(); }, 500);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  const isLoading = loadingAdvisors || loadingTechs;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-start p-4 md:p-8 z-50 overflow-y-auto no-print">

        {/* TOP CONTROLS BAR (Non-printable) */}
        <div id="print-controls" className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 bg-slate-900 border border-white/5 p-4 rounded-3xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
              <Printer size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white ">Fixed Ops Performance Report</h2>
              <p className="text-xs text-slate-400 font-bold mt-0.5">Preview & Print Team Analytics</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              disabled={isLoading}
              className="flex-1 sm:flex-initial h-11 px-6 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-slate-950 rounded-xl text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
            >
              <Printer size={14} className="stroke-[3px]" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="h-11 px-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <X size={14} />
              Close
            </button>
          </div>
        </div>

        {/* PRINT PAPER SHEET REPRESENTATION */}
        {isLoading ? (
          <div className="flex-1 w-full max-w-5xl bg-slate-900 border border-white/5 rounded-3xl p-12 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-emerald-500 mb-3" size={32} />
            <p className="text-[11px] text-slate-400 font-bold ">Compiling performance aggregates...</p>
          </div>
        ) : (
          <div
            id="print-sheet"
            className="w-full max-w-5xl bg-white text-slate-950 p-8 md:p-12 shadow-2xl rounded-3xl font-sans relative overflow-hidden print-container min-h-[11in]"
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >

            {/* Header accent line, on screen only */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500 screen-only-header" />

            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #print-sheet, #print-sheet * {
                  visibility: visible !important;
                }
                #print-sheet {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  box-shadow: none !important;
                  background: white !important;
                  color: black !important;
                }
                .no-print, #print-controls {
                  display: none !important;
                }
                .screen-only-header {
                  display: none !important;
                }
                tr {
                  page-break-inside: avoid !important;
                }
                .page-break {
                  page-break-before: always !important;
                  break-before: page !important;
                }
              }
            `}} />

            {/* Document Header */}
            <div className="border-b-2 border-slate-900 pb-6 mb-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-semibold text-slate-700 mb-2">
                    <FileText size={10} className="text-slate-600" />
                    Dealership Executive Report
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900 leading-none ">{dealershipName}</h1>
                  <p className="text-xs text-slate-500 font-bold mt-1.5">Advisor Performance & Technician Efficiency Summary</p>
                </div>
                <div className="md:text-right border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 w-full md:w-auto">
                  <p className="text-xs font-semibold text-slate-400 ">Report Generated On</p>
                  <p className="text-xs font-semibold text-slate-800 tracking-tight mt-0.5">{todayStr}</p>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Fixed operations performance</p>
                </div>
              </div>
            </div>

            {/* SECTION 1: ADVISOR PERFORMANCE CARDS & TABLE */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center text-slate-800">
                    <Award size={13} className="stroke-[2.5]" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 ">I. Fixed Ops Performance</h2>
                </div>
                <span className="text-xs font-semibold text-slate-400 ">{report.advisorPeriod}</span>
              </div>

              {advisors.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 ">
                  No advisor figures saved for this month.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl min-w-0">
                      <p className="text-xs font-semibold text-slate-400 truncate">Total Repair Orders</p>
                      <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 mt-0.5 truncate">{report.totalSOs}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl min-w-0">
                      <p className="text-xs font-semibold text-slate-400 truncate">Avg ROs / Day</p>
                      <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 mt-0.5 truncate">{report.avgROsPerDay}</p>
                      <p className="text-xs text-slate-400 font-bold ">{report.workingDays} working days</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl min-w-0">
                      <p className="text-xs font-semibold text-slate-400 truncate">Hours Sold</p>
                      <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 mt-0.5 truncate">{report.totalHrs.toFixed(1)} hrs</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl min-w-0">
                      <p className="text-xs font-semibold text-slate-400 truncate">Show-up Rate</p>
                      <p className="text-base sm:text-lg md:text-xl font-semibold text-emerald-800 mt-0.5 truncate">
                        {report.showUpRate != null ? `${report.showUpRate}%` : '—'}
                      </p>
                      <p className="text-xs text-slate-400 font-bold ">{report.showUpDetail}</p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden mb-6">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white text-xs font-semibold">
                          <th className="py-2.5 px-3">Advisor Name</th>
                          <th className="py-2.5 px-2 text-right">Labor Sales</th>
                          <th className="py-2.5 px-2 text-right">Labor Gross</th>
                          <th className="py-2.5 px-2 text-right">Part Sales</th>
                          <th className="py-2.5 px-2 text-right">Parts Gross</th>
                          <th className="py-2.5 px-2 text-center">ELR</th>
                          <th className="py-2.5 px-2 text-center">GP %</th>
                          <th className="py-2.5 px-2 text-center">Hours Sold</th>
                          <th className="py-2.5 px-3 text-center">RO Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advisors.map((advisor, i) => {
                          const elrVal = (advisor.hrsSold || 0) > 0 ? advisor.laborSold / advisor.hrsSold : 0;
                          return (
                            <tr key={i} className="border-b border-slate-100 text-[11px] text-slate-800 last:border-b-0">
                              <td className="py-3 px-3 font-semibold text-slate-900">{advisor.name}</td>
                              <td className="py-3 px-2 text-right font-medium text-slate-700">{money(advisor.laborSold)}</td>
                              <td className="py-3 px-2 text-right font-medium text-slate-700">{money(advisor.grossLabor)}</td>
                              <td className="py-3 px-2 text-right font-medium text-slate-700">{money(advisor.partsSold)}</td>
                              <td className="py-3 px-2 text-right font-medium text-slate-700">{money(advisor.grossParts)}</td>
                              <td className="py-3 px-2 text-center font-semibold text-slate-900">${(advisor.elr || elrVal || 0).toFixed(2)}</td>
                              <td className="py-3 px-2 text-center font-semibold text-emerald-700">{(advisor.gpPercent || 0).toFixed(1)}%</td>
                              <td className="py-3 px-2 text-center font-bold text-slate-800">{(advisor.hrsSold || 0).toFixed(1)}</td>
                              <td className="py-3 px-3 text-center font-bold text-slate-800">{advisor.soCount || 0}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-100 border-t-2 border-slate-900 text-xs font-semibold text-slate-900">
                          <td className="py-3 px-3">Department Totals</td>
                          <td className="py-3 px-2 text-right text-slate-950">{money(report.totalLabor)}</td>
                          <td className="py-3 px-2 text-right text-slate-950">{money(report.totalLaborGross)}</td>
                          <td className="py-3 px-2 text-right text-slate-950">{money(report.totalParts)}</td>
                          <td className="py-3 px-2 text-right text-slate-950">{money(report.totalPartsGross)}</td>
                          <td className="py-3 px-2 text-center">${report.elr.toFixed(2)}</td>
                          <td className="py-3 px-2 text-center text-emerald-800">{report.gp.toFixed(1)}%</td>
                          <td className="py-3 px-2 text-center">{report.totalHrs.toFixed(1)}</td>
                          <td className="py-3 px-3 text-center">{report.totalSOs}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-slate-200 pt-6 mt-8 flex flex-col sm:flex-row justify-between sm:justify-end items-center text-xs font-medium text-slate-400">
                    <p className="mt-2 sm:mt-0 italic">Page 1 of 2 — Confidentially Distributed Report</p>
                  </div>
                </>
              )}
            </div>

            {/* SECTION 2: TECHNICIAN EFFICIENCY BOARD */}
            <div className="mb-10 page-break">
              <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-2 pt-6">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center text-slate-800">
                    <TrendingUp size={13} className="stroke-[2.5]" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 ">II. Workshop Technician Efficiency Summary</h2>
                </div>
                <span className="text-xs font-semibold text-slate-400 ">{report.techPeriod}</span>
              </div>

              {technicians.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 ">
                  No technician figures saved for this month.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl min-w-0">
                      <p className="text-xs font-semibold text-slate-400 truncate">Total Clocked Hours</p>
                      <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 mt-0.5 truncate">
                        {report.hasClock ? `${report.totalClocked.toFixed(2)} hrs` : '—'}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl min-w-0">
                      <p className="text-xs font-semibold text-slate-400 truncate">Total Flagged (Sold) Hours</p>
                      <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 mt-0.5 truncate">{report.totalFlagged.toFixed(2)} hrs</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl min-w-0">
                      <p className="text-xs font-semibold text-slate-400 truncate">Workshop Average Efficiency</p>
                      <p className="text-base sm:text-lg md:text-xl font-semibold text-indigo-700 mt-0.5 truncate">
                        {report.shopEfficiency != null ? `${report.shopEfficiency}%` : '—'}
                      </p>
                    </div>
                  </div>
                  {!report.hasClock && (
                    <p className="text-xs text-slate-500 mb-4">
                      PBS sent no time clock for this period, so efficiency can't be worked out. Flagged hours are shown.
                    </p>
                  )}

                  <div className="border border-slate-200 rounded-2xl overflow-hidden mb-6">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white text-xs font-semibold">
                          <th className="py-3 px-4">Technician Name</th>
                          <th className="py-3 px-4 text-center">Clocked In Hours</th>
                          <th className="py-3 px-4 text-center">Flagged (Sold) Hours</th>
                          <th className="py-3 px-4 text-center">Productivity Efficiency %</th>
                          <th className="py-3 px-6 text-center">Status Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {technicians.map((tech, i) => {
                          const row = techRow(tech);
                          return (
                            <tr key={i} className="border-b border-slate-100 text-[11px] text-slate-800 last:border-b-0">
                              <td className="py-3 px-4 font-semibold text-slate-900">{tech.techName}</td>
                              <td className="py-3 px-4 text-center font-bold">{row.clocked}</td>
                              <td className="py-3 px-4 text-center font-bold">{row.flagged}</td>
                              <td className="py-3 px-4 text-center font-semibold text-slate-900">{row.efficiency}</td>
                              <td className="py-3 px-6 text-center">
                                <span className={cn(
                                  "inline-flex px-2 py-0.5 rounded text-xs font-semibold border",
                                  row.tone === 'good'
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : row.tone === 'bad'
                                      ? "bg-rose-50 text-rose-700 border-rose-200 font-bold"
                                      : "bg-slate-50 text-slate-500 border-slate-200"
                                )}>
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-100 border-t-2 border-slate-900 text-xs font-semibold text-slate-900">
                          <td className="py-3 px-4">Workshop Summary</td>
                          <td className="py-3 px-4 text-center">{report.hasClock ? `${report.totalClocked.toFixed(2)} hrs` : '—'}</td>
                          <td className="py-3 px-4 text-center">{report.totalFlagged.toFixed(2)} hrs</td>
                          <td className="py-3 px-4 text-center text-indigo-900">{report.shopEfficiency != null ? `${report.shopEfficiency}%` : '—'}</td>
                          <td className="py-3 px-6 text-center text-slate-600">Active Staff ({technicians.length})</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-slate-200 pt-6 mt-8 flex flex-col sm:flex-row justify-between sm:justify-end items-center text-xs font-medium text-slate-400">
              <p className="mt-2 sm:mt-0 italic">Page 2 of 2 — Confidentially Distributed Report</p>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};
