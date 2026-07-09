import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const db = firebaseConfig.databaseId
  ? getFirestore(app, firebaseConfig.databaseId)
  : getFirestore(app);
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
