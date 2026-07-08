import type { Express, Request, Response } from 'express';
import { getAdminFirestore } from '../admin/initFirebaseAdmin.js';
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
  pbsRepairOrderGet,
} from '../pbs/partnerHubClient.js';
import { dealershipSettingsDoc } from '../pbs/pbsFirestore.js';
import {
  PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
  PBS_AUTOMATED_SYNC_DEALERSHIP_NAME,
} from '../pbs/pbsDealershipScope.js';
import { resolvePbsSyncCaller } from '../admin/requirePbsSyncCaller.js';
import { isPacificMorningSyncHour, runPbsSync } from '../pbs/pbsSync.js';
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
  app.post('/api/pbs/test-connection', async (_req, res) => {
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

  /** Lookup helpers for debugging / future sync jobs. */
  app.post('/api/pbs/contact-get', async (req: Request, res: Response) => {
    try {
      const data = await pbsContactGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/contact-vehicle-get', async (req: Request, res: Response) => {
    try {
      const data = await pbsContactVehicleGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/repair-order-get', async (req: Request, res: Response) => {
    try {
      const data = await pbsRepairOrderGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  app.post('/api/pbs/appointment-get', async (req: Request, res: Response) => {
    try {
      const data = await pbsAppointmentGet(req.body ?? {});
      res.json(data);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });

  /** Last PBS sync status (no secrets). */
  app.get('/api/pbs/sync/status', async (_req, res) => {
    const db = getAdminFirestore();
    if (!db) {
      return res.json({
        configured: isPbsPartnerHubConfigured(),
        firestoreAdmin: false,
        state: null,
      });
    }

    const dealershipId = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
    const snap = await dealershipSettingsDoc(db, dealershipId).get();
    const data = snap.data();
    const state = (data?.pbsSyncState as PbsSyncState | undefined) ?? null;
    const logs = (data?.pbsSyncLogs as PbsSyncLogEntry[] | undefined) ?? [];
    res.json({
      configured: isPbsPartnerHubConfigured(),
      firestoreAdmin: true,
      dealershipId,
      dealershipName: PBS_AUTOMATED_SYNC_DEALERSHIP_NAME,
      scopedDealerships: [PBS_AUTOMATED_SYNC_DEALERSHIP_ID],
      state,
      logs,
      nextScheduledWindow: 'Daily at 8:00 AM America/Los_Angeles (Hyundai only)',
    });
  });

  /**
   * Run PBS → Directory / Operations sync.
   * Auth: Firebase ID token (admin/manager) or PBS_SYNC_SECRET bearer.
   */
  app.post('/api/pbs/sync/run', async (req: Request, res: Response) => {
    const caller = await resolvePbsSyncCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Unauthorized PBS sync request.' });
    }

    const fullRefresh = req.body?.fullRefresh !== false;
    const force = Boolean(req.body?.force);
    const cron = Boolean(req.body?.cron);

    if (cron && !force && !isPacificMorningSyncHour()) {
      return res.json({
        ok: true,
        skipped: true,
        reason: 'Outside 8:00 AM America/Los_Angeles sync window.',
      });
    }

    try {
      const result = await runPbsSync({
        triggeredBy: cron ? 'cron' : 'manual',
        triggeredByEmail: caller.email,
        triggeredByUsername: caller.username,
        fullRefresh,
      });
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      return handlePbsError(res, err);
    }
  });
}
