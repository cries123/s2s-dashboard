import type { Request, Response, NextFunction } from 'express';
import { getAdminAuth, getAdminFirestore } from './initFirebaseAdmin.js';

const PRIMARY_ADMIN_EMAIL = 'admin@hyundai.com';

export interface PlatformAdminRequest extends Request {
  platformAdmin?: {
    uid: string;
    email: string;
  };
}

async function isCallerPlatformAdmin(uid: string, email: string): Promise<boolean> {
  if (email === PRIMARY_ADMIN_EMAIL) return true;

  const auth = getAdminAuth();
  if (!auth) return false;

  const db = getAdminFirestore();
  if (!db) return false;

  const snap = await db
    .doc(`artifacts/hyundai-sales-to-service/public/data/users/${uid}`)
    .get();

  if (!snap.exists) return false;
  const data = snap.data() as { role?: string; email?: string } | undefined;
  return data?.role === 'admin';
}

export async function requirePlatformAdmin(
  req: PlatformAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token.' });
    return;
  }

  const auth = getAdminAuth();
  if (!auth) {
    res.status(503).json({
      error:
        'Server admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON in the environment.',
    });
    return;
  }

  try {
    const token = header.slice(7);
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email || '').trim().toLowerCase();
    const uid = decoded.uid;

    if (!email) {
      res.status(403).json({ error: 'Signed-in account has no email address.' });
      return;
    }

    const allowed = await isCallerPlatformAdmin(uid, email);
    if (!allowed) {
      res.status(403).json({ error: 'Platform administrator access required.' });
      return;
    }

    req.platformAdmin = { uid, email };
    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid token';
    res.status(401).json({ error: message });
  }
}
