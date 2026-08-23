import type { Firestore } from 'firebase-admin/firestore';
import {
  pbsAppointmentGet,
  pbsPartsInvoiceGet,
  pbsRepairOrderGet,
  PbsPartnerHubError,
} from './partnerHubClient.js';
import {
  aggregatePbsAdvisorPerformance,
  collectRepairOrderCsrStrings,
} from './pbsPerformanceAggregator.js';
import {
  buildPbsAdvisorAliases,
  matchesPerformanceAdvisorRoster,
  normalizePbsAdvisorCode,
} from './pbsAdvisorName.js';
import { defaultPbsAdvisorCodeMap } from './pbsAdvisorDefaults.js';
import type { PbsAppointment } from './pbsTypes.js';
import type { PbsPartsInvoiceFull, PbsRepairOrderFull } from './pbsPerformanceTypes.js';
import {
  advisorPerformanceDoc,
  dealershipSettingsDoc,
  serverTimestamp,
  stripUndefinedDeep,
} from './pbsFirestore.js';

function monthCashieredCriteria(start: string, end: string): Record<string, unknown> {
  return {
    CashieredSince: `${start}T00:00:00.0000000-07:00`,
    CashieredUntil: `${end}T23:59:59.9999999-07:00`,
  };
}

async function fetchCashieredRepairOrders(monthStart: string, monthEnd: string): Promise<PbsRepairOrderFull[]> {
  const response = await pbsRepairOrderGet(monthCashieredCriteria(monthStart, monthEnd));
  return (response.RepairOrders || []) as PbsRepairOrderFull[];
}

async function fetchCashieredPartsInvoices(monthStart: string, monthEnd: string): Promise<PbsPartsInvoiceFull[]> {
  const response = await pbsPartsInvoiceGet(monthCashieredCriteria(monthStart, monthEnd));
  return (response.PartsInvoices || []) as PbsPartsInvoiceFull[];
}

/** Parts invoices are optional — many PBS accounts return 401 for PartsInvoiceGet. */
async function fetchCashieredPartsInvoicesOptional(
  monthStart: string,
  monthEnd: string
): Promise<{ invoices: PbsPartsInvoiceFull[]; skippedReason?: string }> {
  try {
    const invoices = await fetchCashieredPartsInvoices(monthStart, monthEnd);
    return { invoices };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAccessDenied =
      (err instanceof PbsPartnerHubError && err.status === 401) ||
      message.includes('401');
    console.warn(
      `[PBS Sync] PartsInvoiceGet ${isAccessDenied ? 'unauthorized (401)' : 'failed'} — advisor performance will use cashiered ROs only:`,
      message
    );
    return {
      invoices: [],
      skippedReason: message,
    };
  }
}

function performanceReportEndDate(monthEnd: string, reference = new Date()): string {
  const today = reference.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return today < monthEnd ? today : monthEnd;
}

/** Appointment Advisor strings often pair name+code ("LEMMY LV4278") — best alias source. */
async function fetchMonthAdvisorStringsOptional(
  monthStart: string,
  monthEnd: string
): Promise<string[]> {
  try {
    const response = await pbsAppointmentGet({
      AppointmentSince: `${monthStart}T00:00:00.0000000-07:00`,
      AppointmentUntil: `${monthEnd}T23:59:59.9999999-07:00`,
    });
    const appointments = (response.Appointments || []) as PbsAppointment[];
    const strings: string[] = [];
    for (const appt of appointments) {
      if (appt.Advisor) strings.push(appt.Advisor);
      for (const line of appt.RequestLines || []) {
        if (line.CSR) strings.push(line.CSR);
      }
    }
    return strings;
  } catch (err) {
    console.warn(
      '[PBS Sync] Could not fetch appointments for advisor aliases:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

interface AdvisorRosterSlot {
  label: string;
}

/** Load roster + manual code map from dealership settings for alias/unmatched checks. */
async function loadAdvisorSettings(
  db: Firestore,
  dealershipId: string
): Promise<{ roster: AdvisorRosterSlot[] | undefined; codeMap: Map<string, string> }> {
  const codeMap = new Map<string, string>();
  try {
    const snap = await dealershipSettingsDoc(db, dealershipId).get();
    const data = snap.data() || {};

    const rosterRaw = data.performanceAdvisorRoster;
    const roster = Array.isArray(rosterRaw)
      ? (rosterRaw as Array<{ label?: string }>)
          .map((row) => ({ label: String(row?.label || '').trim() }))
          .filter((row) => row.label)
      : undefined;

    const mapRaw = data.pbsAdvisorCodeMap;
    if (mapRaw && typeof mapRaw === 'object') {
      for (const [code, name] of Object.entries(mapRaw as Record<string, unknown>)) {
        const label = String(name || '').trim();
        if (code.trim() && label) codeMap.set(normalizePbsAdvisorCode(code), label);
      }
    }

    const defaults = defaultPbsAdvisorCodeMap(dealershipId);
    for (const [code, name] of Object.entries(defaults)) {
      if (!codeMap.has(code)) codeMap.set(code, name);
    }

    return { roster: roster?.length ? roster : undefined, codeMap };
  } catch {
    return { roster: undefined, codeMap };
  }
}

export async function syncPbsAdvisorPerformance(
  db: Firestore,
  dealershipId: string,
  monthStart: string,
  monthEnd: string,
  syncedAt: string
): Promise<{
  advisors: number;
  repairOrdersProcessed: number;
  partsInvoicesProcessed: number;
  totalGross: number;
  totalGrossParts: number;
  partsInvoicesSkipped?: boolean;
  partsInvoicesSkipReason?: string;
}> {
  const [repairOrders, partsResult, advisorStrings, advisorSettings] = await Promise.all([
    fetchCashieredRepairOrders(monthStart, monthEnd),
    fetchCashieredPartsInvoicesOptional(monthStart, monthEnd),
    fetchMonthAdvisorStringsOptional(monthStart, monthEnd),
    loadAdvisorSettings(db, dealershipId),
  ]);
  const { invoices: partsInvoices, skippedReason } = partsResult;

  console.log(
    `[PBS Sync] Performance sources: ${repairOrders.length} cashiered ROs, ${partsInvoices.length} parts invoices (${monthStart}..${monthEnd})${skippedReason ? ' [parts invoices skipped]' : ''}`
  );

  // Resolve advisor login codes (e.g. "LV4278") to real names so labor gross
  // buckets under the advisor instead of an unrecognized code.
  const aliases = buildPbsAdvisorAliases([
    ...collectRepairOrderCsrStrings(repairOrders),
    ...advisorStrings,
  ]);
  for (const [code, name] of advisorSettings.codeMap) {
    aliases.set(code, name);
  }
  console.log(`[PBS Sync] Advisor code aliases resolved: ${aliases.size}`);

  const aggregate = aggregatePbsAdvisorPerformance(
    repairOrders,
    partsInvoices,
    monthStart,
    monthEnd,
    aliases
  );
  const reportEndDate = performanceReportEndDate(monthEnd);

  const defaultRoster = [{ label: 'Frank' }, { label: 'Lemmy' }, { label: 'Jaryn' }];
  const roster = advisorSettings.roster ?? defaultRoster;
  const unmatchedAdvisorNames = aggregate.advisors
    .filter((row) => !matchesPerformanceAdvisorRoster(row.name, roster))
    .map((row) => row.name);

  const existingSnap = await advisorPerformanceDoc(db, dealershipId).get();
  const existing = existingSnap.exists ? existingSnap.data() : undefined;
  const preserveImportedLabor =
    existing &&
    (existing.source === 'csr-pdf' || existing.source === 'dms-pdf') &&
    Number(existing.totals?.totalGross) > 0;

  const totalsToWrite = preserveImportedLabor
    ? {
        ...aggregate.totals,
        totalGross: Number(existing.totals?.totalGross) || aggregate.totals.totalGross,
        totalLabor: Number(existing.totals?.totalLabor) || aggregate.totals.totalLabor,
        totalHrs: Number(existing.totals?.totalHrs) || aggregate.totals.totalHrs,
      }
    : aggregate.totals;

  await advisorPerformanceDoc(db, dealershipId).set(
    stripUndefinedDeep({
      advisors: aggregate.advisors,
      totals: totalsToWrite,
      reportStartDate: aggregate.reportStartDate,
      reportEndDate,
      source: preserveImportedLabor ? existing.source : 'pbs-sync',
      pbsSyncedAt: syncedAt,
      partsInvoicesSkipped: Boolean(skippedReason),
      partsInvoicesSkipReason: skippedReason,
      laborGrossPreservedFromImport: preserveImportedLabor || undefined,
      unmatchedAdvisorNames: unmatchedAdvisorNames.length ? unmatchedAdvisorNames : undefined,
      updatedAt: serverTimestamp(),
    }),
    { merge: false }
  );

  console.log(
    `[PBS Sync] Advisor performance written: ${aggregate.advisors.length} advisors, labor gross $${aggregate.totals.totalGross}, parts gross $${aggregate.totals.totalGrossParts}`
  );

  return {
    advisors: aggregate.advisors.length,
    repairOrdersProcessed: aggregate.repairOrdersProcessed,
    partsInvoicesProcessed: aggregate.partsInvoicesProcessed,
    totalGross: aggregate.totals.totalGross,
    totalGrossParts: aggregate.totals.totalGrossParts,
    partsInvoicesSkipped: Boolean(skippedReason),
    partsInvoicesSkipReason: skippedReason,
  };
}
