import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Loader2, Database } from 'lucide-react';

interface ImportAuditEntry {
  id: string;
  filename?: string;
  type?: string;
  totalRecords?: number;
  newProfiles?: number;
  matchedProfiles?: number;
  username?: string;
  userId?: string;
  timestamp?: { toDate?: () => Date };
}

export function ImportHistoryPanel() {
  const [logs, setLogs] = useState<ImportAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'audit', 'imports');
    const q = query(ref, orderBy('timestamp', 'desc'), limit(80));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ImportAuditEntry[]);
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
        <Database size={12} />
        CRM & archive imports
      </div>
      <p className="text-xs text-slate-500 max-w-2xl">
        Historical import and archive payloads written to the audit imports collection.
      </p>
      <div className="card-base border border-white/5 overflow-hidden">
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 sticky top-0">
              <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3 text-right">Records</th>
                <th className="px-4 py-3 text-right">New</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No import history yet. CRM imports will appear here when logged to audit/imports.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-400 font-mono text-[10px]">
                      {log.timestamp?.toDate?.()?.toLocaleString?.() || '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-white truncate max-w-[200px]">
                      {log.filename || log.id}
                    </td>
                    <td className="px-4 py-3 uppercase text-[10px] text-slate-400">{log.type || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{log.username || log.userId || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{log.totalRecords ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">{log.newProfiles ?? '—'}</td>
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

export default ImportHistoryPanel;
