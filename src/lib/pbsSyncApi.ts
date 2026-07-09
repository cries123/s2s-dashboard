import { auth } from '../firebase';
import type { PbsSyncLogEntry } from '../types';

export interface PbsSyncStatusResponse {
  configured: boolean;
  firestoreAdmin: boolean;
  firestoreReachable?: boolean;
  firestoreError?: string;
  diagnostics?: {
    pbsConfigured: boolean;
    missingPbsVars: string[];
    firestoreAdminReady: boolean;
    serviceAccountStatus: string;
    serviceAccountMessage: string;
    hasServiceAccountJson: boolean;
    hasServiceAccountBase64: boolean;
    redeployHint: string;
  };
  dealershipId?: string;
  state: {
    lastSyncAt: string;
    lastSyncOk: boolean;
    lastError?: string;
    summary?: string;
    triggeredBy?: 'cron' | 'manual';
    triggeredByEmail?: string;
    triggeredByUsername?: string;
    counts?: PbsSyncLogEntry['counts'];
    fetched?: PbsSyncLogEntry['fetched'];
  } | null;
  logs: PbsSyncLogEntry[];
  nextScheduledWindow?: string;
}

export interface PbsSyncRunResponse {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  summary: string;
  counts: PbsSyncLogEntry['counts'];
  fetched: PbsSyncLogEntry['fetched'];
  error?: string;
  logId?: string;
  skipped?: boolean;
  reason?: string;
}

async function bearerHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to sync PBS data.');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  const text = await res.text();
  throw new Error(text || `Request failed (${res.status})`);
}

export async function fetchPbsSyncStatus(): Promise<PbsSyncStatusResponse> {
  const res = await fetch('/api/pbs/sync/status');
  const data = await parseJson<PbsSyncStatusResponse & { error?: string }>(res);
  if (!res.ok && !data.firestoreError) {
    throw new Error(data.error || 'Failed to load PBS sync status');
  }
  return { ...data, logs: data.logs ?? [] };
}

export async function runPbsSyncNow(): Promise<PbsSyncRunResponse> {
  const headers = await bearerHeaders();
  const res = await fetch('/api/pbs/sync/run', {
    method: 'POST',
    headers,
    body: JSON.stringify({ fullRefresh: true, dealershipId: 'hyundai' }),
  });
  const data = await parseJson<PbsSyncRunResponse & { error?: string }>(res);
  if (!res.ok && !data.skipped) {
    throw new Error(data.error || data.summary || 'PBS sync failed');
  }
  return data;
}
