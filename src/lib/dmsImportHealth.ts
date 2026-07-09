import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { DmsImportFailureEntry, DmsImportHealthEntry, DmsImportKind } from '../types';

const MAX_FAILURES = 25;

function settingsRef(dealershipId: string) {
  return doc(
    db,
    'artifacts',
    'hyundai-sales-to-service',
    'public',
    'data',
    'dealershipSettings',
    dealershipId
  );
}

export async function recordDmsImportSuccess(
  dealershipId: string,
  entry: Omit<DmsImportHealthEntry, 'at'> & { at?: string }
): Promise<void> {
  if (!dealershipId) return;
  const ref = settingsRef(dealershipId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data()?.dmsImportHealth : undefined;
  await setDoc(
    ref,
    {
      id: dealershipId,
      dmsImportHealth: {
        ...existing,
        lastSuccess: {
          at: entry.at ?? new Date().toISOString(),
          filename: entry.filename,
          importKind: entry.importKind,
          userEmail: entry.userEmail,
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function recordDmsImportFailure(
  dealershipId: string,
  entry: Omit<DmsImportFailureEntry, 'at'> & { at?: string }
): Promise<void> {
  if (!dealershipId) return;
  const ref = settingsRef(dealershipId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data()?.dmsImportHealth : undefined;
  const failure: DmsImportFailureEntry = {
    at: entry.at ?? new Date().toISOString(),
    filename: entry.filename,
    importKind: entry.importKind,
    userEmail: entry.userEmail,
    error: entry.error.slice(0, 500),
  };
  const recentFailures = [failure, ...(existing?.recentFailures ?? [])].slice(0, MAX_FAILURES);
  await setDoc(
    ref,
    {
      id: dealershipId,
      dmsImportHealth: {
        ...existing,
        recentFailures,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function dmsImportKindLabel(kind: DmsImportKind): string {
  switch (kind) {
    case 'appointments':
      return 'Appointments';
    case 'advisor_performance':
      return 'Advisor performance';
    case 'technician_productivity':
      return 'Technician productivity';
    case 'fixed_ops_forecast':
      return 'Fixed ops forecast';
    case 'pot_of_gold':
      return 'Pot of Gold';
    default:
      return 'Other';
  }
}
