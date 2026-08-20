import { auth } from '../firebase';

export interface OpenRepairOrderRow {
  repairOrderId: string;
  roNumber: string;
  status: string;
  customStatus?: string;
  laneStatus: string;
  tag?: string;
  shop?: string;
  advisor: string;
  techNumber?: string;
  dateOpened: string;
  dateOpenedLabel: string;
  datePromisedLabel?: string;
  daysOpen: number;
  concern?: string;
  transportation?: string;
  phoneNumber?: string;
  customerId?: string;
  customerName?: string;
  vehicleLabel?: string;
  vinLast8?: string;
  isWaiting?: boolean;
}

export interface OpenRepairOrdersResponse {
  dealershipId: string;
  orders: OpenRepairOrderRow[];
  fetchedAt: string;
  error?: string;
}

export interface OpenRepairOrderVisitLine {
  lineNumber: number;
  requestCode?: string;
  concern?: string;
  cause?: string;
  correction?: string;
  tech?: string;
  status?: string;
  labourLines?: Array<{
    opCode?: string;
    description?: string;
    soldHours?: number;
    tech?: string;
    price?: number;
  }>;
  partLines?: Array<{
    partNumber?: string;
    description?: string;
    qty?: number;
    price?: number;
  }>;
}

export interface OpenRepairOrderDetailResponse {
  dealershipId: string;
  repairOrderId: string;
  roNumber: string;
  status: string;
  customStatus?: string;
  customerName?: string;
  vehicleLabel?: string;
  customerId?: string;
  visit: {
    soNumber: string;
    date: string;
    mileage: number;
    advisor: string;
    requests: string;
    status?: string;
    lines: OpenRepairOrderVisitLine[];
  };
  error?: string;
}

async function bearerHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to load open repair orders.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchOpenRepairOrders(): Promise<OpenRepairOrdersResponse> {
  const headers = await bearerHeaders();
  const res = await fetch('/api/pbs/open-repair-orders', { headers });
  const data = (await res.json()) as OpenRepairOrdersResponse;
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load open repair orders from PBS.');
  }
  return data;
}

export async function fetchOpenRepairOrderDetail(
  repairOrderId: string
): Promise<OpenRepairOrderDetailResponse> {
  const headers = await bearerHeaders();
  const res = await fetch(`/api/pbs/open-repair-orders/${encodeURIComponent(repairOrderId)}`, {
    headers,
  });
  const data = (await res.json()) as OpenRepairOrderDetailResponse;
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load repair order detail from PBS.');
  }
  return data;
}
