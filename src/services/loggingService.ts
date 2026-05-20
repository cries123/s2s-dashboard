import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface TokenUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export const logAIUsage = async (action: string, usage: TokenUsage, userEmail?: string, dealershipId?: string) => {
  try {
    const logsRef = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'aiUsageLogs');
    await addDoc(logsRef, {
      action,
      usage,
      userEmail: userEmail || 'unknown',
      dealershipId: dealershipId || 'unknown',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log AI usage:', error);
  }
};
