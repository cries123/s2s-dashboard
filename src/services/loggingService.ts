import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

export interface TokenUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed:', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

export const logAIUsage = async (action: string, usage: TokenUsage, userEmail?: string, dealershipId?: string) => {
  const path = 'artifacts/hyundai-sales-to-service/public/data/aiUsageLogs';
  try {
    const logsRef = collection(db, path);
    await addDoc(logsRef, {
      action,
      usage,
      userEmail: userEmail || auth.currentUser?.email || 'unknown',
      dealershipId: dealershipId || 'unknown',
      timestamp: serverTimestamp()
    });
    console.log(`[AI Logging Service] Successfully logged usage for: ${action}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const logSystemAction = async (
  action: string,
  details: string,
  category: 'demographics' | 'scanner' | 'appointments' | 'settings' | 'sync' | 'auth',
  userEmail?: string,
  username?: string,
  dealershipId?: string
) => {
  const path = 'artifacts/hyundai-sales-to-service/public/audit/systemLogs';
  try {
    const logsRef = collection(db, path);
    await addDoc(logsRef, {
      action,
      details,
      category,
      userEmail: userEmail || auth.currentUser?.email || 'unknown',
      username: username || 'System/Guest',
      dealershipId: dealershipId || 'hyundai',
      timestamp: serverTimestamp()
    });
    console.log(`[System Logging Service] Successfully logged: ${action} - ${details}`);
  } catch (error) {
    console.error('[System Logging Service] Failed to log activity:', error);
  }
};
