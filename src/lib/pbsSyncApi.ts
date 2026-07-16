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
    lastSuccessfulSyncAt?: string;
    lastSyncOk: boolean;
    lastError?: string | null;
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

/** Gateway/proxy errors come back as HTML pages — never surface raw markup to the UI. */
function sanitizeErrorText(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `Request failed (${status})`;
  if (trimmed.startsWith('<')) {
    if (/inactivity timeout/i.test(trimmed)) {
      return 'The server took too long to respond (gateway timeout). Please try again.';
    }
    const stripped = trimmed.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return stripped ? `${stripped.slice(0, 160)} (${status})` : `Request failed (${status})`;
  }
  return trimmed.slice(0, 300);
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  const text = await res.text();
  throw new Error(sanitizeErrorText(text, res.status));
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

interface StagedStartResponse {
  ok: boolean;
  runId?: string;
  nextStage?: string;
  totalStages?: number;
  stageLabels?: Record<string, string>;
  inProgress?: boolean;
  syncStartedAt?: string;
  error?: string;
}

interface StagedStageResponse {
  ok: boolean;
  done?: boolean;
  nextStage?: string;
  stageIndex?: number;
  totalStages?: number;
  detail?: string;
  stageLabels?: Record<string, string>;
  result?: PbsSyncRunResponse;
  error?: string;
}

export interface PbsSyncProgress {
  stage: string;
  stageLabel: string;
  stageIndex: number;
  totalStages: number;
  detail?: string;
}

/**
 * Run PBS sync as a series of short staged requests — each stage completes well
 * under Netlify's ~30s gateway limit, so no single request can time out.
 */
export async function runPbsSyncNow(
  options: { fullRefresh?: boolean; force?: boolean } = {},
  onProgress?: (progress: PbsSyncProgress) => void
): Promise<PbsSyncRunResponse> {
  const headers = await bearerHeaders();
  const startRes = await fetch('/api/pbs/sync/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fullRefresh: options.fullRefresh === true,
      force: options.force === true,
      dealershipId: 'hyundai',
    }),
  });
  const start = await parseJson<StagedStartResponse>(startRes);

  if (startRes.status === 409 && start.inProgress) {
    return pollPbsSyncUntilComplete(start.syncStartedAt);
  }

  if (!startRes.ok || !start.ok || !start.runId || !start.nextStage) {
    throw new Error(start.error || 'Failed to start PBS sync.');
  }

  const stageLabels = start.stageLabels || {};
  let stage: string | undefined = start.nextStage;
  let stageIndex = 1;
  let detail: string | undefined;
  const totalStages = start.totalStages || 5;
  // Chunked stages repeat — cap total requests to protect against server bugs.
  const MAX_STAGE_REQUESTS = 60;

  for (let i = 0; stage && i < MAX_STAGE_REQUESTS; i += 1) {
    onProgress?.({
      stage,
      stageLabel: stageLabels[stage] || stage,
      stageIndex,
      totalStages,
      detail,
    });

    const stageRes = await fetch('/api/pbs/sync/stage', {
      method: 'POST',
      headers,
      body: JSON.stringify({ runId: start.runId, stage }),
    });
    const outcome = await parseJson<StagedStageResponse>(stageRes);

    if (!stageRes.ok || !outcome.ok) {
      if (outcome.result) return outcome.result;
      throw new Error(outcome.error || `PBS sync failed during ${stageLabels[stage] || stage}.`);
    }

    if (outcome.done) {
      return (
        outcome.result || {
          ok: true,
          startedAt: start.runId,
          finishedAt: new Date().toISOString(),
          summary: 'PBS sync completed.',
          counts: {} as PbsSyncLogEntry['counts'],
          fetched: {} as PbsSyncLogEntry['fetched'],
        }
      );
    }

    stage = outcome.nextStage;
    stageIndex = outcome.stageIndex || stageIndex + 1;
    detail = outcome.detail;
  }

  throw new Error('PBS sync ended unexpectedly without a result.');
}

/** Poll Firestore until an in-flight sync finishes (does not start a new sync). */
export async function waitForPbsSyncCompletion(
  startedAfter?: string
): Promise<PbsSyncRunResponse> {
  return pollPbsSyncUntilComplete(startedAfter);
}
