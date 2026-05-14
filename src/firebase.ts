import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = { 
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAQkSUl1cyEvMG1cMSb343Mij0eY7VaWm4", 
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "hyundai-sales-to-service.firebaseapp.com", 
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "hyundai-sales-to-service", 
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "hyundai-sales-to-service.firebasestorage.app", 
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "225659307146", 
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:225659307146:web:bfbd97061c835146b31973", 
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-LS0R1182ZF" 
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
