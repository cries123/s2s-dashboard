import { getPbsPartnerHubConfig } from './partnerHubConfig.js';

/**
 * Which PartnerHUB operations this dealership's credentials are actually
 * allowed to call.
 *
 * PartnerHUB publishes its whole catalogue at /metadata — 78 operations, the
 * same list for every dealer. What it does not say is which of them *this*
 * serial is authorised for. The only way to know is to call one and look at the
 * status: an operation we are not granted answers 401, exactly as
 * PartsInvoiceGet and TimeClockActivityGet already do here.
 *
 * So this asks each read operation once and records what came back. Three rules
 * keep it a polite thing to do to an API we are a guest on:
 *
 *   1. **Read operations only.** Nothing ending in Change is ever probed. The
 *      list is hard-coded rather than derived, so a future catalogue entry
 *      cannot quietly add a write to it.
 *   2. **The body is never downloaded.** The status line is all we need, and it
 *      arrives before the payload, so the response is cancelled the moment we
 *      have it. An unfiltered ContactGet would be megabytes; we read none of it.
 *   3. **One at a time, with a pause.** No bursts.
 *
 * It is on-demand only. Nothing schedules it.
 */

/** Every read operation PartnerHUB publishes, as of the 2026-10-03 catalogue. */
export const PBS_READ_OPERATIONS = [
  'AccountGet',
  'AppointmentContactVehicleGet',
  'AppointmentContactVehicleInfoGet',
  'AppointmentGet',
  'AttachmentGet',
  'ContactGet',
  'ContactVehicleGet',
  'DealAccessorySetupsGet',
  'DealContactVehicleGet',
  'DealFeeSetupsGet',
  'DealGet',
  'DealInsuranceSetupsGet',
  'DealLenderSetupsGet',
  'DealProtectionSetupsGet',
  'DealSaleTypesSetupsGet',
  'DealSourceSetupsGet',
  'DealStatusSetupsGet',
  'DealTaxStructureSetupsGet',
  'DealWarrantySetupsGet',
  'DealerGet',
  'DealershipClosedDateGet',
  'EmployeeGet',
  'LostSaleGet',
  'LotGet',
  'MenuPackageGet',
  'OpCodeGet',
  'PartsAdjustmentGet',
  'PartsInventoryGet',
  'PartsInvoiceContactGet',
  'PartsInvoiceGet',
  'PartsOrderGet',
  'PartsQuoteGet',
  'PartsReceiptGet',
  'PartsReturnGet',
  'PartsShipmentGet',
  'PurchaseOrderGet',
  'RepairOrderContactVehicleGet',
  'RepairOrderGet',
  'ShopGet',
  'SkillGet',
  'SpecialOrderPartGet',
  'TimeClockActivityGet',
  'TireStorageGet',
  'TransportationGet',
  'VehicleColorMaintenanceGet',
  'VehicleGet',
  'WorkplanAppointmentContactGet',
  'WorkplanAppointmentGet',
  'WorkplanDocumentSetupsGet',
  'WorkplanEventGet',
  'WorkplanHistoryGet',
  'WorkplanReminderContactGet',
  'WorkplanReminderGet',
] as const;

/** The operations the app already calls, so the report can say what is new. */
export const PBS_OPERATIONS_IN_USE = new Set([
  'AppointmentContactVehicleInfoGet',
  'AppointmentGet',
  'ContactGet',
  'ContactVehicleGet',
  'EmployeeGet',
  'LotGet',
  'PartsInvoiceGet',
  'RepairOrderGet',
  'TimeClockActivityGet',
  'VehicleGet',
  'WorkplanReminderGet',
]);

export interface PbsCapabilityResult {
  operation: string;
  /** HTTP status, or null if the request never completed. */
  status: number | null;
  /** 2xx — this serial may call it. */
  granted: boolean;
  /** 401/403 — wired or not, PBS will not serve it to these credentials. */
  denied: boolean;
  inUse: boolean;
  ms: number;
  note?: string;
}

const PROBE_TIMEOUT_MS = 12_000;
const PAUSE_BETWEEN_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask one operation whether we are allowed to call it.
 *
 * A far-future ModifiedSince is sent as a courtesy: operations that understand
 * it return nothing, and ServiceStack ignores fields an operation does not
 * declare, so it never changes whether the call is authorised. Either way the
 * body is thrown away unread.
 */
async function probeOperation(operation: string): Promise<PbsCapabilityResult> {
  const config = getPbsPartnerHubConfig();
  const started = Date.now();
  const base: PbsCapabilityResult = {
    operation,
    status: null,
    granted: false,
    denied: false,
    inUse: PBS_OPERATIONS_IN_USE.has(operation),
    ms: 0,
  };

  if (!config) {
    return { ...base, note: 'PBS PartnerHUB is not configured on this server.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

  try {
    const response = await fetch(`${config.baseUrl}/json/reply/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      // A window that cannot contain records, for anything that honours it.
      body: JSON.stringify({ SerialNumber: config.serialNumber, ModifiedSince: '2099-01-01T00:00:00.0000000-08:00' }),
      signal: controller.signal,
    });

    const status = response.status;
    // The status is all we came for. Drop the payload without reading it.
    try {
      await response.body?.cancel();
    } catch {
      /* already closed */
    }

    return {
      ...base,
      status,
      granted: status >= 200 && status < 300,
      denied: status === 401 || status === 403,
      ms: Date.now() - started,
      note: status >= 400 && status !== 401 && status !== 403 ? `HTTP ${status}` : undefined,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ...base,
      ms: Date.now() - started,
      note: aborted ? `No answer within ${PROBE_TIMEOUT_MS / 1000}s` : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe a slice of the catalogue.
 *
 * Sliced because 53 sequential calls do not fit in one HTTP request, and the
 * browser walks through it a few at a time — the same shape as the staged sync.
 */
export async function probePbsCapabilities(
  offset = 0,
  limit = 8
): Promise<{ results: PbsCapabilityResult[]; offset: number; nextOffset: number | null; total: number }> {
  const total = PBS_READ_OPERATIONS.length;
  const from = Math.max(0, Math.min(offset, total));
  const slice = PBS_READ_OPERATIONS.slice(from, from + Math.max(1, Math.min(limit, 12)));

  const results: PbsCapabilityResult[] = [];
  for (const operation of slice) {
    results.push(await probeOperation(operation));
    await sleep(PAUSE_BETWEEN_MS);
  }

  const nextOffset = from + slice.length;
  return { results, offset: from, nextOffset: nextOffset < total ? nextOffset : null, total };
}
