import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;

export function getFirebaseAdminApp(): App | null {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    console.warn(
      '[Master Users Admin] FIREBASE_SERVICE_ACCOUNT_JSON is not set — email/password admin actions are disabled.'
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    adminApp = initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    });
    console.log('[Master Users Admin] Firebase Admin SDK initialized.');
    return adminApp;
  } catch (error) {
    console.error('[Master Users Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error);
    return null;
  }
}

export function getAdminAuth() {
  const app = getFirebaseAdminApp();
  return app ? getAuth(app) : null;
}

export function getAdminFirestore() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID?.trim();
  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export function isMasterUserAdminConfigured(): boolean {
  return getFirebaseAdminApp() !== null;
}
