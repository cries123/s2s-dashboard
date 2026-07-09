import { getPbsPartnerHubConfig } from './partnerHubConfig.js';

export class PbsPartnerHubError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'PbsPartnerHubError';
    this.status = status;
  }
}

export async function pbsPartnerHubRequest<TResponse>(
  operation: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const config = getPbsPartnerHubConfig();
  if (!config) {
    throw new PbsPartnerHubError(
      'PBS PartnerHUB is not configured. Add PBS_PARTNER_USERNAME, PBS_PARTNER_PASSWORD, and PBS_SERIAL_NUMBER to server env.',
      503
    );
  }

  const payload = {
    SerialNumber: config.serialNumber,
    ...body,
  };

  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const url = `${config.baseUrl}/json/reply/${operation}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new PbsPartnerHubError(
      `PBS returned non-JSON (${response.status}): ${text.slice(0, 200)}`,
      response.status
    );
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'ResponseStatus' in data
        ? JSON.stringify((data as { ResponseStatus?: unknown }).ResponseStatus)
        : text.slice(0, 300);
    throw new PbsPartnerHubError(`PBS ${operation} failed (${response.status}): ${message}`, response.status);
  }

  return data as TResponse;
}

export async function pbsContactGet(criteria: Record<string, unknown> = {}) {
  return pbsPartnerHubRequest<{ Contacts?: unknown[] }>('ContactGet', criteria);
}

export async function pbsContactVehicleGet(criteria: Record<string, unknown> = {}) {
  return pbsPartnerHubRequest<{ Items?: unknown[]; ContactVehicles?: unknown[] }>(
    'ContactVehicleGet',
    criteria
  );
}

/** PartnerHUB returns `Items`; older wrappers used `ContactVehicles`. */
export function pbsContactVehicleItems(
  response: { Items?: unknown[]; ContactVehicles?: unknown[] } | null | undefined
): unknown[] {
  return response?.Items ?? response?.ContactVehicles ?? [];
}

export async function pbsRepairOrderGet(criteria: Record<string, unknown> = {}) {
  return pbsPartnerHubRequest<{ RepairOrders?: unknown[] }>('RepairOrderGet', criteria);
}

export async function pbsAppointmentGet(criteria: Record<string, unknown> = {}) {
  return pbsPartnerHubRequest<{ Appointments?: unknown[] }>('AppointmentGet', criteria);
}

export async function pbsPartsInvoiceGet(criteria: Record<string, unknown> = {}) {
  return pbsPartnerHubRequest<{ PartsInvoices?: unknown[] }>('PartsInvoiceGet', criteria);
}
