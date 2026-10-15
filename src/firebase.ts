import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';
import appletConfig from '../firebase-applet-config.json';

function envOrApplet(key: keyof typeof appletConfig, envValue: string | undefined): string {
  if (envValue && envValue.trim()) return envValue.trim();
  if (import.meta.env.DEV) {
    const value = appletConfig[key];
    return typeof value === 'string' ? value : '';
  }
  return '';
}

const firebaseConfig = {
  apiKey: envOrApplet('apiKey', import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: envOrApplet('authDomain', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: envOrApplet('projectId', import.meta.env.VITE_FIREBASE_PROJECT_ID),
  databaseId: (() => {
    const fromEnv = import.meta.env.VITE_FIREBASE_DATABASE_ID?.trim();
    if (fromEnv) return fromEnv;
    if (import.meta.env.DEV && appletConfig.firestoreDatabaseId) {
      return appletConfig.firestoreDatabaseId;
    }
    return undefined;
  })(),
  storageBucket: envOrApplet('storageBucket', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: envOrApplet('messagingSenderId', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: envOrApplet('appId', import.meta.env.VITE_FIREBASE_APP_ID),
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() ||
    (import.meta.env.DEV ? appletConfig.measurementId : undefined) ||
    undefined,
};

if (!firebaseConfig.apiKey) {
  throw new Error(
    'Firebase is not configured. Add VITE_FIREBASE_* to .env.local for local development.'
  );
}

const app = initializeApp(firebaseConfig);

/**
 * Firestore with an on-device cache.
 *
 * Without it, every open downloaded every record the screens listen to from
 * scratch, and the app sat blank until that finished. With it, data from the
 * last visit is shown immediately and only what changed comes over the network.
 * The multi-tab manager lets two tabs share one cache instead of the second
 * one failing to get it.
 *
 * Some browsers refuse on-device storage — private windows, a full disk, a
 * locked-down device. The app then falls back to the old behaviour, slower but
 * working, rather than not starting at all.
 */
function createFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
      firebaseConfig.databaseId
    );
  } catch (err) {
    console.warn('[Firebase] On-device cache unavailable; using memory only.', err);
    return firebaseConfig.databaseId ? getFirestore(app, firebaseConfig.databaseId) : getFirestore(app);
  }
}

export const db = createFirestore();
export const auth = getAuth(app);

let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  try {
    analytics = getAnalytics(app);
  } catch {
    analytics = null;
  }
}
export { analytics };

if (import.meta.env.DEV) {
  console.log(`[Firebase] Project: ${firebaseConfig.projectId}`);
}
