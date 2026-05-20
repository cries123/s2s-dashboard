import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Calculator, Clock, User, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface UsageLog {
  id: string;
  action: string;
  usage: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  userEmail: string;
  dealershipId: string;
  timestamp: any;
}

export const TokenUsageLog: React.FC = () => {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'aiUsageLogs'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UsageLog));
      setLogs(logData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching AI usage logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const totalTokensAllTime = logs.reduce((acc, log) => acc + log.usage.totalTokenCount, 0);

  return (
    <div className="card-base p-6 border-brand-primary/20 bg-brand-primary/5">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 text-brand-primary">
          <Zap size={20} />
          <h3 className="text-lg font-black uppercase tracking-widest text-white">AI Token Usage Log</h3>
        </div>
        <button 
          onClick={() => setExpanded(!expanded)}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400"
        >
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Recent Total Tokens</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{totalTokensAllTime.toLocaleString()}</span>
            <span className="text-xs text-slate-500">tokens</span>
          </div>
        </div>
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Average per Request</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {logs.length > 0 ? Math.round(totalTokensAllTime / logs.length).toLocaleString() : 0}
            </span>
            <span className="text-xs text-slate-500">tokens</span>
          </div>
        </div>
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Log Entries</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{logs.length}</span>
            <span className="text-xs text-slate-500">actions</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto animate-in fade-in slide-in-from-top-2 duration-300">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3 text-right">Prompt</th>
                <th className="px-4 py-3 text-right">Output</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <Clock size={12} className="text-slate-600" />
                      {log.timestamp?.toDate().toLocaleString(undefined, { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold text-white whitespace-nowrap">{log.action}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium text-slate-400 truncate max-w-[120px]">{log.userEmail}</span>
                      <span className="text-[8px] font-black text-brand-primary uppercase tracking-tighter">{log.dealershipId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-[10px] font-mono text-slate-500">
                    {log.usage.promptTokenCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-[10px] font-mono text-slate-500">
                    {log.usage.candidatesTokenCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[10px] font-black font-mono border border-brand-primary/20">
                      {log.usage.totalTokenCount.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-xs italic">
                    No token usage maps found in recent history.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {!expanded && logs.length > 0 && (
        <p className="text-[9px] text-slate-500 italic text-center mt-2">
          Click the arrow to view detailed per-request token breakdown.
        </p>
      )}
    </div>
  );
};
