import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Loader2, Cpu, RefreshCw } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface AiUsageEntry {
  id: string;
  action?: string;
  userEmail?: string;
  dealershipId?: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  timestamp?: { toDate?: () => Date };
}

export function AiUsageLogsPanel() {
  const [logs, setLogs] = useState<AiUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'aiUsageLogs');
    const q = query(ref, orderBy('timestamp', 'desc'), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AiUsageEntry[]);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-brand-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="flex items-center gap-2 text-brand-primary text-[9px] font-black uppercase tracking-[0.25em]">
        <Cpu size={12} />
        Platform AI telemetry
      </div>
      <p className="text-xs text-slate-500 max-w-2xl">
        Token usage from Gemini/OpenAI parse routes. Admin read-only.
      </p>
      <div className="card-base border border-white/5 overflow-hidden">
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 sticky top-0">
              <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    No AI usage logged yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-400 font-mono text-[10px]">
                      {log.timestamp?.toDate?.()?.toLocaleString?.() || '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-white">{log.action || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{log.userEmail || '—'}</td>
                    <td className="px-4 py-3 text-brand-primary uppercase text-[10px] font-black">
                      {log.dealershipId || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">
                      {log.usage?.totalTokenCount?.toLocaleString() ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AiUsageLogsPanel;
