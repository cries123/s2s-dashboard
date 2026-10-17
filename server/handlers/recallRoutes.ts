import type { Express, Request, Response } from 'express';
import { getAdminFirestore } from '../admin/initFirebaseAdmin.js';
import type { ApprovedUser } from '../admin/requireApprovedUser.js';
import { checkVinRecalls, RecallLookupError } from '../recalls/checkVinRecalls.js';

/**
 * GET /api/recalls/vin/:vin — the recalls NHTSA lists for this car's model,
 * each checked against the car's repair orders (server/recalls). Behind the
 * approved-user gate in server.ts, because it reads customer service history.
 */
export function registerRecallRoutes(app: Express) {
  app.get('/api/recalls/vin/:vin', async (req: Request, res: Response) => {
    const user = (req as Request & { approvedUser?: ApprovedUser }).approvedUser;
    if (!user) return res.status(401).json({ error: 'Sign in again.' });
    try {
      const report = await checkVinRecalls(getAdminFirestore(), req.params.vin, user);
      return res.json(report);
    } catch (err) {
      if (err instanceof RecallLookupError) return res.status(502).json({ error: err.message });
      console.error('[recalls/vin]', err);
      return res.status(500).json({ error: "The recall check didn't finish. Try again." });
    }
  });
}
