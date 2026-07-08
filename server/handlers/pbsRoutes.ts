import type { Express, Request, Response } from 'express';
import {
  getPbsPartnerHubPublicStatus,
  isPbsPartnerHubConfigured,
} from '../pbs/partnerHubConfig.js';
import {
  PbsPartnerHubError,
  pbsAppointmentGet,
  pbsContactGet,
  pbsContactVehicleGet,
  pbsRepairOrderGet,
} from '../pbs/partnerHubClient.js';

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
          contactVehicles: contactVehicles.ContactVehicles?.length ?? 0,
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
}
