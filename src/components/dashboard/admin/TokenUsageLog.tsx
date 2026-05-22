import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { Calculator, Clock, Zap, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = () => {
    setLoading(true);
    setError(null);
    
    const q = query(
      collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'aiUsageLogs'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UsageLog));
      setLogs(logData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching AI usage logs:", err);
      const authStatus = auth.currentUser ? `Signed in as ${auth.currentUser.email}` : 'Not signed in';
      setError(`${err.message} (${authStatus})`);
      setLoading(false);
    });

    return unsubscribe;
  };

  useEffect(() => {
    const unsub = fetchLogs();
    return () => unsub();
  }, []);

  const totalTokensAllTime = logs.reduce((acc, log) => acc + log.usage.totalTokenCount, 0);

  // Pricing (based on standard Gemini 1.5 Flash rates)
  const INPUT_PRICE_PER_1M = 0.075;
  const OUTPUT_PRICE_PER_1M = 0.30;

  const calculateCost = (prompt: number, candidates: number) => {
    return (prompt * (INPUT_PRICE_PER_1M / 1000000)) + (candidates * (OUTPUT_PRICE_PER_1M / 1000000));
  };

  const totalCost = logs.reduce((acc, log) => acc + calculateCost(log.usage.promptTokenCount, log.usage.candidatesTokenCount), 0);

  return (
    <div className="card-base p-6 border-brand-primary/20 bg-brand-primary/5">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 text-brand-primary">
          <Zap size={20} />
          <h3 className="text-lg font-black uppercase tracking-widest text-white">AI Token Usage & Cost Log</h3>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[10px] font-bold text-rose-500">
              Error: {error.includes('permission') ? 'Admin Permissions Required' : error}
            </div>
          )}
          <button 
            onClick={() => fetchLogs()}
            disabled={loading}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 disabled:opacity-50"
            title="Refresh Data"
          >
            <Calculator size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400"
          >
            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Recent Total Tokens</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{totalTokensAllTime.toLocaleString()}</span>
            <span className="text-xs text-slate-500">tokens</span>
          </div>
        </div>
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Estimated Cost</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-brand-primary">
              ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
            </span>
            <span className="text-[10px] text-slate-500 uppercase font-bold">USD</span>
          </div>
        </div>
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Cost / Import</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              ${(logs.length > 0 ? totalCost / logs.length : 0).toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
            </span>
          </div>
        </div>
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Log Entries</p>
          <div className="flex items-baseline gap-1">
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
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3 text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {logs.map((log) => {
                const cost = calculateCost(log.usage.promptTokenCount, log.usage.candidatesTokenCount);
                return (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <Clock size={12} className="text-slate-600" />
                        {(() => {
                           if (!log.timestamp) return 'Just now';
                           try {
                             const date = typeof log.timestamp.toDate === 'function' ? log.timestamp.toDate() : new Date(log.timestamp);
                             return date.toLocaleString(undefined, {
                               month: 'short',
                               day: 'numeric',
                               hour: '2-digit',
                               minute: '2-digit'
                             });
                           } catch (e) {
                             return 'Invalid Date';
                           }
                        })()}
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-white font-mono">{log.usage.totalTokenCount.toLocaleString()}</span>
                        <span className="text-[8px] text-slate-500 font-mono">P: {log.usage.promptTokenCount.toLocaleString()} / O: {log.usage.candidatesTokenCount.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-[10px] font-black font-mono border border-green-500/20">
                        ${cost.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500 text-xs italic">
                    No token usage logs found in recent history.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      
    </div>
  );
};
