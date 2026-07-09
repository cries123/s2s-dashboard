import type { Request } from 'express';
import { getAdminAuth, getAdminFirestore } from './initFirebaseAdmin.js';

const PRIMARY_ADMIN_EMAIL = 'admin@hyundai.com';

export interface ApprovedUser {
  uid: string;
  email: string;
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

    if (email === PRIMARY_ADMIN_EMAIL) {
      return { uid, email };
    }

    const snap = await db.doc(`artifacts/hyundai-sales-to-service/public/data/users/${uid}`).get();
    if (!snap.exists) return null;

    const data = snap.data() as { approved?: boolean; status?: string; role?: string };
    const approved = data.approved === true || data.status === 'approved';
    const isAdmin = data.role === 'admin';

    if (!approved && !isAdmin) return null;

    return { uid, email };
  } catch {
    return null;
  }
}
