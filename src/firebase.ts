import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import appletConfig from "../firebase-applet-config.json";

function pickConfig(envValue: string | undefined, configValue: string | undefined) {
  const value = envValue || configValue;
  return value ? value : undefined;
}

const firebaseOptions = {
  apiKey: pickConfig(import.meta.env.VITE_FIREBASE_API_KEY, appletConfig.apiKey)!,
  authDomain: pickConfig(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, appletConfig.authDomain)!,
  projectId: pickConfig(import.meta.env.VITE_FIREBASE_PROJECT_ID, appletConfig.projectId)!,
  storageBucket: pickConfig(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, appletConfig.storageBucket)!,
  messagingSenderId: pickConfig(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appletConfig.messagingSenderId)!,
  appId: pickConfig(import.meta.env.VITE_FIREBASE_APP_ID, appletConfig.appId)!,
  measurementId: pickConfig(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, appletConfig.measurementId),
};

const firestoreDatabaseId = pickConfig(
  import.meta.env.VITE_FIREBASE_DATABASE_ID,
  appletConfig.firestoreDatabaseId
);

const app = initializeApp(firebaseOptions);
export const db = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
export const auth = getAuth(app);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

if (import.meta.env.DEV) {
  console.log(`[Firebase] Initialized with Project ID: ${firebaseOptions.projectId}`);
}
