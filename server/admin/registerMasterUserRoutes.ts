import type { Express } from 'express';
import { getAdminAuth } from './initFirebaseAdmin.js';
import { requirePlatformAdmin, type PlatformAdminRequest } from './requirePlatformAdmin.js';

const PRIMARY_ADMIN_EMAIL = 'admin@hyundai.com';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isProtectedTargetEmail(email: string): boolean {
  return normalizeEmail(email) === PRIMARY_ADMIN_EMAIL;
}

export function registerMasterUserRoutes(app: Express): void {
  app.post(
    '/api/admin/master-users/:uid/send-password-reset',
    requirePlatformAdmin,
    async (req: PlatformAdminRequest, res) => {
      try {
        const auth = getAdminAuth();
        if (!auth) {
          return res.status(503).json({ error: 'Admin SDK not configured.' });
        }

        const { uid } = req.params;
        const userRecord = await auth.getUser(uid);
        if (!userRecord.email) {
          return res.status(400).json({ error: 'User has no email on file.' });
        }

        return res.json({
          success: true,
          email: userRecord.email,
          message: `Authorized password reset for ${userRecord.email}.`,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to generate reset link';
        console.error('[Master Users] send-password-reset:', error);
        return res.status(500).json({ error: message });
      }
    }
  );

  app.post(
    '/api/admin/master-users/:uid/set-password',
    requirePlatformAdmin,
    async (req: PlatformAdminRequest, res) => {
      try {
        const auth = getAdminAuth();
        if (!auth) {
          return res.status(503).json({ error: 'Admin SDK not configured.' });
        }

        const { uid } = req.params;
        const password = String(req.body?.password || '');
        if (password.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const existing = await auth.getUser(uid);
        if (existing.email && isProtectedTargetEmail(existing.email)) {
          return res.status(403).json({ error: 'This account is protected.' });
        }

        await auth.updateUser(uid, { password });
        return res.json({ success: true, message: 'Password updated successfully.' });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to set password';
        console.error('[Master Users] set-password:', error);
        return res.status(500).json({ error: message });
      }
    }
  );

  app.patch(
    '/api/admin/master-users/:uid/email',
    requirePlatformAdmin,
    async (req: PlatformAdminRequest, res) => {
      try {
        const auth = getAdminAuth();
        if (!auth) {
          return res.status(503).json({ error: 'Admin SDK not configured.' });
        }

        const { uid } = req.params;
        const email = normalizeEmail(String(req.body?.email || ''));
        if (!email || !email.includes('@')) {
          return res.status(400).json({ error: 'A valid email address is required.' });
        }

        const existing = await auth.getUser(uid);
        if (existing.email && isProtectedTargetEmail(existing.email)) {
          return res.status(403).json({ error: 'This account is protected.' });
        }

        await auth.updateUser(uid, { email });
        return res.json({ success: true, email });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update email';
        console.error('[Master Users] email:', error);
        return res.status(500).json({ error: message });
      }
    }
  );

  app.delete(
    '/api/admin/master-users/:uid/auth',
    requirePlatformAdmin,
    async (req: PlatformAdminRequest, res) => {
      try {
        const auth = getAdminAuth();
        if (!auth) {
          return res.status(503).json({ error: 'Admin SDK not configured.' });
        }

        const { uid } = req.params;
        const existing = await auth.getUser(uid);
        if (existing.email && isProtectedTargetEmail(existing.email)) {
          return res.status(403).json({ error: 'This account is protected.' });
        }

        await auth.deleteUser(uid);
        return res.json({ success: true, message: 'Authentication account deleted.' });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to delete auth user';
        console.error('[Master Users] delete auth:', error);
        return res.status(500).json({ error: message });
      }
    }
  );
}
