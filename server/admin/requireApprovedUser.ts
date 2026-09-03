import type { Request } from 'express';
import { getAdminAuth, getAdminFirestore } from './initFirebaseAdmin.js';

const PRIMARY_ADMIN_EMAIL = 'admin@hyundai.com';

export interface ApprovedUser {
  uid: string;
  email: string;
  /** Store the caller belongs to. Routes that serve store-scoped data MUST check this. */
  dealershipId: string;
  tenantId: string;
  isAdmin: boolean;
}

function dealershipIdFromTenantId(tenantId: string | undefined): string {
  if (tenantId === 'nissan-mazda') return 'nissan';
  if (tenantId === 'ford-lincoln') return 'ford';
  return 'hyundai';
}

function tenantIdFromDealershipId(dealershipId: string | undefined): string {
  if (dealershipId === 'nissan') return 'nissan-mazda';
  if (dealershipId === 'ford') return 'ford-lincoln';
  return 'hyundai';
}

export async function resolveApprovedUser(req: Request): Promise<ApprovedUser | null> {
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

    const snap = await db.doc(`artifacts/hyundai-sales-to-service/public/data/users/${uid}`).get();
    const data = (snap.exists ? snap.data() : {}) as {
      approved?: boolean;
      status?: string;
      role?: string;
      dealershipId?: string;
      tenantId?: string;
    };

    const isAdmin = data.role === 'admin' || email === PRIMARY_ADMIN_EMAIL;

    // The primary admin account is allowed through without a user doc; everyone else
    // must have one and must be approved.
    if (!isAdmin) {
      if (!snap.exists) return null;
      if (data.approved !== true && data.status !== 'approved') return null;
    }

    const dealershipId =
      data.dealershipId || dealershipIdFromTenantId(data.tenantId);
    const tenantId = data.tenantId || tenantIdFromDealershipId(data.dealershipId);

    return { uid, email, dealershipId, tenantId, isAdmin };
  } catch {
    return null;
  }
}
