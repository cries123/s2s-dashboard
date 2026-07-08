import type { Request } from 'express';
import { getAdminAuth, getAdminFirestore } from './initFirebaseAdmin.js';
import { isPbsSyncAuthorized } from '../pbs/pbsSyncAuth.js';
import {
  isPbsAutomatedSyncDealership,
  PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
} from '../pbs/pbsDealershipScope.js';

const PRIMARY_ADMIN_EMAIL = 'admin@hyundai.com';

export interface PbsSyncCaller {
  uid: string;
  email: string;
  username?: string;
  source: 'secret' | 'user';
}

export async function resolvePbsSyncCaller(req: Request): Promise<PbsSyncCaller | null> {
  if (isPbsSyncAuthorized(req)) {
    return {
      uid: 'pbs-sync-secret',
      email: 'system@pbs-sync',
      username: 'PBS Cron',
      source: 'secret',
    };
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  if (!auth || !db) return null;

  try {
    const token = header.slice(7);
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = (decoded.email || '').trim().toLowerCase();
    if (!email) return null;

    if (email === PRIMARY_ADMIN_EMAIL) {
      return { uid, email, username: 'Admin', source: 'user' };
    }

    const snap = await db.doc(`artifacts/hyundai-sales-to-service/public/data/users/${uid}`).get();
    if (!snap.exists) return null;

    const data = snap.data() as {
      role?: string;
      isManager?: boolean;
      username?: string;
      approved?: boolean;
      status?: string;
      dealershipId?: string;
    };

    const isAdmin = data.role === 'admin';
    const isManager =
      data.role === 'manager' || data.role === 'Manager' || data.isManager === true;
    const approved = data.approved === true || data.status === 'approved';

    if (!approved || (!isAdmin && !isManager)) return null;

    // Managers at other stores cannot trigger Hyundai-only PBS sync.
    if (!isAdmin && !isPbsAutomatedSyncDealership(data.dealershipId || PBS_AUTOMATED_SYNC_DEALERSHIP_ID)) {
      return null;
    }

    return {
      uid,
      email,
      username: data.username || email,
      source: 'user',
    };
  } catch {
    return null;
  }
}
