import { auth } from '../firebase';
import type { PbsSyncLogEntry } from '../types';

export interface PbsSyncStatusResponse {
  configured: boolean;
  firestoreAdmin: boolean;
  firestoreReachable?: boolean;
  firestoreError?: string;
  firestoreQuotaExceeded?: boolean;
  diagnostics?: {
    pbsConfigured: boolean;
    missingPbsVars: string[];
    firestoreAdminReady: boolean;
    serviceAccountStatus: string;
    serviceAccountMessage: string;
    hasServiceAccountJson: boolean;
    hasServiceAccountBase64: boolean;
    firebaseProjectId?: string | null;
    redeployHint: string;
  };
  dealershipId?: string;
  state: {
    lastSyncAt: string;
    lastSyncOk: boolean;
    lastError?: string;
    summary?: string;
    syncInProgress?: boolean;
    syncStartedAt?: string;
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
  accepted?: boolean;
  inProgress?: boolean;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function logEntryToRunResponse(entry: PbsSyncLogEntry): PbsSyncRunResponse {
  return {
    ok: entry.ok,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    summary: entry.summary,
    counts: entry.counts,
    fetched: entry.fetched,
    error: entry.error,
    logId: entry.id,
  };
}

function stateToRunResponse(
  state: NonNullable<PbsSyncStatusResponse['state']>
): PbsSyncRunResponse | null {
  if (!state.lastSyncAt) return null;
  return {
    ok: state.lastSyncOk,
    startedAt: state.syncStartedAt || state.lastSyncAt,
    finishedAt: state.lastSyncAt,
    summary: state.summary || (state.lastSyncOk ? 'PBS sync completed.' : 'PBS sync failed.'),
    counts: state.counts || ({} as PbsSyncLogEntry['counts']),
    fetched: state.fetched || ({} as PbsSyncLogEntry['fetched']),
    error: state.lastError,
  };
}

async function pollPbsSyncUntilComplete(
  startedAfter?: string
): Promise<PbsSyncRunResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const status = await fetchPbsSyncStatus();

    if (status.state?.syncInProgress) {
      continue;
    }

    const matchingLog = status.logs.find(
      (entry) => !startedAfter || entry.startedAt >= startedAfter
    );
    if (matchingLog) {
      return logEntryToRunResponse(matchingLog);
    }

    if (status.state && !status.state.syncInProgress) {
      const fromState = stateToRunResponse(status.state);
      if (fromState && (!startedAfter || fromState.startedAt >= startedAfter)) {
        return fromState;
      }
    }
  }

  throw new Error(
    'PBS sync is still running after 15 minutes. Refresh the sync log — it may have finished on the server.'
  );
}

export async function fetchPbsSyncStatus(): Promise<PbsSyncStatusResponse> {
  const res = await fetch('/api/pbs/sync/status');
  const data = await parseJson<PbsSyncStatusResponse & { error?: string }>(res);
  if (!res.ok && !data.firestoreError) {
    throw new Error(data.error || 'Failed to load PBS sync status');
  }
  return { ...data, logs: data.logs ?? [] };
}

export async function runPbsSyncNow(
  options: { fullRefresh?: boolean; force?: boolean } = {}
): Promise<PbsSyncRunResponse> {
  const headers = await bearerHeaders();
  const res = await fetch('/api/pbs/sync/run', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fullRefresh: options.fullRefresh === true,
      force: options.force === true,
      dealershipId: 'hyundai',
    }),
  });
  const data = await parseJson<PbsSyncRunResponse & { error?: string; syncStartedAt?: string }>(res);

  if (res.status === 409 && data.inProgress) {
    return pollPbsSyncUntilComplete(data.syncStartedAt || data.startedAt);
  }

  if (!res.ok && !data.skipped) {
    throw new Error(data.error || data.summary || 'PBS sync failed');
  }

  if (data.skipped) {
    return data;
  }

  return data;
}

/** Poll Firestore until an in-flight sync finishes (does not start a new sync). */
export async function waitForPbsSyncCompletion(
  startedAfter?: string
): Promise<PbsSyncRunResponse> {
  return pollPbsSyncUntilComplete(startedAfter);
}
