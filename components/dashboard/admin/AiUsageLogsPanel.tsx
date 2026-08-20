import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Cpu } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { TableSkeleton } from '../../ui/Skeleton';

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
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-brand-primary text-[9px] font-black uppercase tracking-[0.25em]">
          <Cpu size={12} />
          Platform AI telemetry
        </div>
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="flex items-center gap-2 text-brand-primary text-[9px] font-black uppercase tracking-[0.25em]">
        <Cpu size={12} />
        Platform AI telemetry
      </div>
      <p className="text-xs max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
        Token usage from Gemini/OpenAI parse routes. Admin read-only.
      </p>

      {logs.length === 0 ? (
        <EmptyState
          title="No AI usage logged yet."
          description="Token usage from AI parse routes will appear here once activity is recorded."
        />
      ) : (
        <>
          {/* Mobile — one card per log row */}
          <div className="lg:hidden space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="card-base p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    {log.action || '—'}
                  </span>
                  <span className="text-right font-mono text-xs text-emerald-500 dark:text-emerald-400 shrink-0">
                    {log.usage?.totalTokenCount?.toLocaleString() ?? '—'} tok
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>{log.timestamp?.toDate?.()?.toLocaleString?.() || '—'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span style={{ color: 'var(--color-text-secondary)' }}>{log.userEmail || '—'}</span>
                  <span className="text-brand-primary uppercase font-black">
                    {log.dealershipId || '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop — table */}
          <div className="hidden lg:block card-base overflow-hidden">
            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
                  <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Store</th>
                    <th className="px-4 py-3 text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/5 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-mono text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {log.timestamp?.toDate?.()?.toLocaleString?.() || '—'}
                      </td>
                      <td className="px-4 py-3 font-bold" style={{ color: 'var(--color-text-primary)' }}>{log.action || '—'}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{log.userEmail || '—'}</td>
                      <td className="px-4 py-3 text-brand-primary uppercase text-[10px] font-black">
                        {log.dealershipId || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-500 dark:text-emerald-400">
                        {log.usage?.totalTokenCount?.toLocaleString() ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AiUsageLogsPanel;
