import { useEffect, useState } from 'react';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { isPreviewMode } from '../lib/previewMode';
import { performanceDocId } from '../lib/operationsViewPeriod';

export function usePerformanceReport(base: string, dealershipId: string, month: string) {
  const id = performanceDocId(base, dealershipId, month);
  const [state, setState] = useState<{
    id: string; data: DocumentData | null; status: 'loading' | 'ready' | 'missing' | 'error';
  }>({ id: '', data: null, status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ id, data: null, status: 'loading' });
    if (isPreviewMode || !dealershipId) {
      setState({ id, data: null, status: 'missing' });
      return;
    }
    const stop = onSnapshot(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', id), snap => {
      if (!active) return;
      setState({ id, data: snap.exists() ? snap.data() : null, status: snap.exists() ? 'ready' : 'missing' });
    }, () => {
      if (active) setState({ id, data: null, status: 'error' });
    });
    return () => { active = false; stop(); };
  }, [id, dealershipId]);

  // Never render the previous store/month while the new listener is starting.
  return state.id === id ? state : { id, data: null, status: 'loading' as const };
}
