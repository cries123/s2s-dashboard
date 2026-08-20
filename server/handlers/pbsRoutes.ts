import type { Express, Request, Response } from 'express';
import { getAdminFirestore, getFirebaseAdminInitError } from '../admin/initFirebaseAdmin.js';
import {
  getPbsPartnerHubPublicStatus,
  isPbsPartnerHubConfigured,
} from '../pbs/partnerHubConfig.js';
import {
  PbsPartnerHubError,
  pbsAppointmentGet,
  pbsContactGet,
  pbsContactVehicleGet,
  pbsContactVehicleItems,
  pbsPartsInvoiceGet,
  pbsRepairOrderGet,
} from '../pbs/partnerHubClient.js';
import { dealershipSettingsDoc } from '../pbs/pbsFirestore.js';
import {
  PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
  PBS_AUTOMATED_SYNC_DEALERSHIP_NAME,
} from '../pbs/pbsDealershipScope.js';
import { resolvePbsSyncCaller } from '../admin/requirePbsSyncCaller.js';
import { resolveApprovedUser } from '../admin/requireApprovedUser.js';
import { listOpenRepairOrdersForDealership, getOpenRepairOrderDetail } from '../pbs/pbsOpenRepairOrders.js';
import {
  executePbsSyncStage,
  isPacificMorningSyncHour,
  PBS_SYNC_STAGE_LABELS,
  PBS_SYNC_STAGES,
  runPbsSync,
  startStagedPbsSync,
  clearStalePbsSyncInProgress,
  type PbsSyncStageName,
} from '../pbs/pbsSync.js';
import { getOrHydrateDaySchedule } from '../pbs/pbsDayScheduleService.js';
import { getPbsEnvDiagnostics, getPbsCronDiagnostics } from '../pbs/pbsEnvDiagnostics.js';
import { formatFirestoreError, isFirestoreQuotaError } from '../pbs/firestoreErrors.js';
import type { PbsSyncLogEntry, PbsSyncState } from '../pbs/pbsTypes.js';

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function handlePbsError(res: Response, err: unknown) {
  if (err instanceof PbsPartnerHubError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[PBS]', err);
  return res.status(500).json({ error: err instanceof Error ? err.message : 'PBS request failed' });
}

/** Public config check — same pattern as /api/ai-config (no secrets). */
export function registerPbsRoutes(app: Express) {
  app.get('/api/pbs/config', (_req, res) => {
    res.json(getPbsPartnerHubPublicStatus());
  });

  /** Lightweight connectivity test — returns small sample counts only. */
  app.post('/api/pbs/test-connection', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized PBS test-connection request.' });
    }

    if (!isPbsPartnerHubConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'PBS PartnerHUB credentials are not configured on the server.',
      });
    }

    try {
      const modifiedSince = daysAgoIso(7);
      const [contacts, contactVehicles, repairOrders, appointments] = await Promise.all([
        pbsContactGet({ ModifiedSince: modifiedSince }),
        pbsContactVehicleGet({ ModifiedSince: modifiedSince }),
        pbsRepairOrderGet({ ModifiedSince: modifiedSince }),
        pbsAppointmentGet({ ModifiedSince: modifiedSince }),
      ]);

      res.json({
        ok: true,
        modifiedSince,
        counts: {
          contacts: contacts.Contacts?.length ?? 0,
          contactVehicles: pbsContactVehicleItems(contactVehicles).length,
          repairOrders: repairOrders.RepairOrders?.length ?? 0,
          appointments: appointments.Appointments?.length ?? 0,
        },
      });
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /**
   * Lookup helpers for debugging / future sync jobs — these hit PartnerHUB with
   * the server's own stored credentials, so they're gated the same as every
   * other PBS route: an approved staff account or the internal sync secret.
   */
  app.post('/api/pbs/contact-get', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized PBS contact-get request.' });
    }
    try {
      const data = await pbsContactGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/contact-vehicle-get', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized PBS contact-vehicle-get request.' });
    }
    try {
      const data = await pbsContactVehicleGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/repair-order-get', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized PBS repair-order-get request.' });
    }
    try {
      const data = await pbsRepairOrderGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/appointment-get', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized PBS appointment-get request.' });
    }
    try {
      const data = await pbsAppointmentGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/parts-invoice-get', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized PBS parts-invoice-get request.' });
    }
    try {
      const data = await pbsPartsInvoiceGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /** Last PBS sync status (no secrets). */
  app.get('/api/pbs/sync/status', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized PBS sync status request.' });
    }

    try {
      const diagnostics = {
        ...getPbsEnvDiagnostics(),
        firebaseAdminInitError: getFirebaseAdminInitError(),
      };
      const db = getAdminFirestore();
      if (!db) {
        return res.json({
          configured: diagnostics.pbsConfigured,
          firestoreAdmin: false,
          firestoreReachable: false,
          diagnostics,
          state: null,
          logs: [],
        });
      }

      const dealershipId = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
      try {
        const snap = await dealershipSettingsDoc(db, dealershipId).get();
        const data = snap.data();
        let state = (data?.pbsSyncState as PbsSyncState | undefined) ?? null;
        if (state?.syncInProgress) {
          const cleared = await clearStalePbsSyncInProgress(db, dealershipId);
          if (cleared) {
            const refreshed = await dealershipSettingsDoc(db, dealershipId).get();
            state = (refreshed.data()?.pbsSyncState as PbsSyncState | undefined) ?? null;
          }
        }
        const logs = (data?.pbsSyncLogs as PbsSyncLogEntry[] | undefined) ?? [];
        const lastCronLog = logs.find((entry) => entry.triggeredBy === 'cron');
        const cron = getPbsCronDiagnostics();
        return res.json({
          configured: diagnostics.pbsConfigured,
          firestoreAdmin: true,
          firestoreReachable: true,
          diagnostics,
          cron: {
            ...cron,
            lastRunAt: lastCronLog?.finishedAt ?? lastCronLog?.startedAt,
            lastRunOk: lastCronLog?.ok,
            lastRunSummary: lastCronLog?.summary,
          },
          dealershipId,
          dealershipName: PBS_AUTOMATED_SYNC_DEALERSHIP_NAME,
          scopedDealerships: [PBS_AUTOMATED_SYNC_DEALERSHIP_ID],
          state,
          logs,
          nextScheduledWindow: 'Daily at 6:00 AM America/Los_Angeles (Hyundai only)',
        });
      } catch (firestoreErr) {
        console.error('[PBS] sync/status Firestore read failed:', firestoreErr);
        return res.status(503).json({
          configured: diagnostics.pbsConfigured,
          firestoreAdmin: true,
          firestoreReachable: false,
          firestoreError: formatFirestoreError(firestoreErr),
          firestoreQuotaExceeded: isFirestoreQuotaError(firestoreErr),
          diagnostics,
          dealershipId: PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
          state: null,
          logs: [],
        });
      }
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /**
   * Run PBS → Directory / Operations sync in one request (cron / local dev only —
   * Netlify's HTTP gateway cuts off browser-facing requests after ~30 seconds).
   * Auth: Firebase ID token (admin/manager) or PBS_SYNC_SECRET bearer.
   */
  app.post('/api/pbs/sync/run', async (req: Request, res: Response) => {
    const caller = await resolvePbsSyncCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Unauthorized PBS sync request.' });
    }

    const fullRefresh = req.body?.fullRefresh === true;
    const force = Boolean(req.body?.force);
    const cron = Boolean(req.body?.cron);

    if (cron && !force && !isPacificMorningSyncHour()) {
      return res.json({
        ok: true,
        skipped: true,
        reason: 'Outside 6:00 AM America/Los_Angeles sync window.',
      });
    }

    try {
      const result = await runPbsSync({
        triggeredBy: cron ? 'cron' : 'manual',
        triggeredByEmail: caller.email,
        triggeredByUsername: caller.username,
        fullRefresh,
        force,
      });
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /**
   * Staged sync — the browser drives one short request per stage so no single
   * request can hit Netlify's ~30s gateway timeout.
   */
  app.post('/api/pbs/sync/start', async (req: Request, res: Response) => {
    const caller = await resolvePbsSyncCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Unauthorized PBS sync request.' });
    }

    try {
      const start = await startStagedPbsSync({
        triggeredBy: 'manual',
        triggeredByEmail: caller.email,
        triggeredByUsername: caller.username,
        fullRefresh: req.body?.fullRefresh === true,
        force: Boolean(req.body?.force),
      });

      if (!start.ok) {
        const status = start.inProgress ? 409 : 503;
        return res.status(status).json({
          ok: false,
          inProgress: start.inProgress,
          syncStartedAt: start.busyStartedAt,
          error: start.error,
        });
      }

      return res.json({
        ok: true,
        runId: start.startedAt,
        nextStage: start.nextStage,
        totalStages: start.totalStages,
        stageLabels: PBS_SYNC_STAGE_LABELS,
        stages: PBS_SYNC_STAGES,
      });
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/sync/stage', async (req: Request, res: Response) => {
    const caller = await resolvePbsSyncCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Unauthorized PBS sync request.' });
    }

    const runId = String(req.body?.runId || '').trim();
    const stage = String(req.body?.stage || '').trim() as PbsSyncStageName;
    if (!runId || !stage) {
      return res.status(400).json({ error: 'runId and stage are required.' });
    }

    try {
      const outcome = await executePbsSyncStage(runId, stage);
      if (!outcome.ok) {
        return res.status(500).json({
          ok: false,
          error: outcome.error,
          result: outcome.result,
        });
      }
      return res.json({
        ok: true,
        done: outcome.done === true,
        nextStage: outcome.nextStage,
        stageIndex: outcome.stageIndex,
        totalStages: outcome.totalStages,
        detail: outcome.detail,
        stageLabels: PBS_SYNC_STAGE_LABELS,
        result: outcome.result,
      });
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /** Live open repair orders from PBS — for Service tab (no dispatch board required). */
  app.get('/api/pbs/open-repair-orders', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized open repair orders request.' });
    }

    if (!isPbsPartnerHubConfigured()) {
      return res.status(503).json({
        error: 'PBS PartnerHUB credentials are not configured on the server.',
      });
    }

    try {
      const result = await listOpenRepairOrdersForDealership(PBS_AUTOMATED_SYNC_DEALERSHIP_ID);
      return res.json({
        dealershipId: PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
        ...result,
      });
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /** Full open RO detail — job lines, concern/cause/correction from PBS. */
  app.get('/api/pbs/open-repair-orders/:repairOrderId', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized open repair order detail request.' });
    }

    const repairOrderId = String(req.params.repairOrderId || '').trim();
    if (!repairOrderId) {
      return res.status(400).json({ error: 'Repair order id is required.' });
    }

    if (!isPbsPartnerHubConfigured()) {
      return res.status(503).json({
        error: 'PBS PartnerHUB credentials are not configured on the server.',
      });
    }

    try {
      const detail = await getOpenRepairOrderDetail(repairOrderId, PBS_AUTOMATED_SYNC_DEALERSHIP_ID);
      if (!detail) {
        return res.status(404).json({ error: 'Open repair order not found.' });
      }
      return res.json({
        dealershipId: PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
        ...detail,
      });
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /** Load day schedule — reads Firestore or hydrates from PBS when empty. */
  app.get('/api/pbs/appointment-schedule/:date', async (req: Request, res: Response) => {
    const user = await resolveApprovedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized appointment schedule request.' });
    }

    const date = String(req.params.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date — use YYYY-MM-DD.' });
    }

    if (!isPbsPartnerHubConfigured()) {
      return res.status(503).json({
        error: 'PBS PartnerHUB credentials are not configured on the server.',
      });
    }

    const db = getAdminFirestore();
    if (!db) {
      return res.status(503).json({
        error: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured — cannot load schedule.',
      });
    }

    try {
      const forceRefresh = req.query.refresh === '1';
      const result = await getOrHydrateDaySchedule(db, PBS_AUTOMATED_SYNC_DEALERSHIP_ID, date, {
        forceRefresh,
      });
      return res.json({
        date,
        dealershipId: PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
        appointments: result.appointments,
        source: result.source,
        hydrated: result.hydrated,
      });
    } catch (err) {
      return handlePbsError(res, err);
    }
  });
}
