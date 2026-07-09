import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccountFromEnv } from './parseServiceAccountJson.js';

let adminApp: App | null = null;
let lastInitError: string | null = null;

export function getFirebaseAdminInitError(): string | null {
  return lastInitError;
}

export function getFirebaseAdminApp(): App | null {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const loaded = loadServiceAccountFromEnv();
  if (loaded.status !== 'ready' || !loaded.serviceAccount) {
    lastInitError = loaded.message;
    console.warn('[Master Users Admin]', loaded.message);
    return null;
  }

  try {
    adminApp = initializeApp({
      credential: cert(loaded.serviceAccount as Parameters<typeof cert>[0]),
    });
    lastInitError = null;
    console.log('[Master Users Admin] Firebase Admin SDK initialized.');
    return adminApp;
  } catch (error) {
    lastInitError =
      error instanceof Error
        ? `Firebase Admin init failed: ${error.message}`
        : 'Firebase Admin init failed.';
    console.error('[Master Users Admin]', lastInitError);
    return null;
  }
}

export function getAdminAuth() {
  const app = getFirebaseAdminApp();
  return app ? getAuth(app) : null;
}

let firestoreSettingsApplied = false;

export function getAdminFirestore() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID?.trim();
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  if (!firestoreSettingsApplied) {
    db.settings({ ignoreUndefinedProperties: true });
    firestoreSettingsApplied = true;
  }
  return db;
}

export function isMasterUserAdminConfigured(): boolean {
  return getFirebaseAdminApp() !== null;
}
