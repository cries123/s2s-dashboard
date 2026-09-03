import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  FileText, Search, Filter, User, Calendar,
  Settings, Database, Shield, ShieldCheck, HelpCircle, Laptop, Clock
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';
import { isPlatformAdmin, resolveUserDealershipId } from '../../../lib/rbac';
import { OperationType, handleFirestoreError } from '../../../services/loggingService';

interface LogEntry {
  id: string;
  action: string;
  details: string;
  category: 'demographics' | 'scanner' | 'appointments' | 'settings' | 'sync' | 'auth';
  userEmail: string;
  username: string;
  dealershipId: string;
  timestamp: any; // Firestore Timestamp
}

const CATEGORIES = [
  { id: 'all', label: 'All Categories', icon: FileText },
  { id: 'demographics', label: 'Drivers / Demographics', icon: User },
  { id: 'scanner', label: 'Form Scanner', icon: Laptop },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'settings', label: 'System Settings', icon: Settings },
  { id: 'auth', label: 'Authentication', icon: Shield },
];

interface SystemLogsProps {
  dealershipId?: string;
  tenantScope?: boolean;
}

export function SystemLogs({ dealershipId, tenantScope = false }: SystemLogsProps) {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    // Admins may inspect another store via the prop; everyone else is pinned to
    // their own, matching what the security rules will actually allow.
    const scopedDealershipId = isPlatformAdmin(user)
      ? (dealershipId || resolveUserDealershipId(user))
      : resolveUserDealershipId(user);

    const path = 'artifacts/hyundai-sales-to-service/public/audit/systemLogs';
    const logsRef = collection(db, path);
    const q = query(
      logsRef,
      where('dealershipId', '==', scopedDealershipId),
      orderBy('timestamp', 'desc'),
      limit(150)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LogEntry[];
      
      setLogs(logsList);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user, authLoading, dealershipId]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'demographics': return <User size={13} className="text-blue-400" />;
      case 'scanner': return <Laptop size={13} className="text-purple-400" />;
      case 'appointments': return <Calendar size={13} className="text-indigo-400" />;
      case 'settings': return <Settings size={13} className="text-amber-400" />;
      case 'sync': return <Database size={13} className="text-emerald-400" />;
      case 'auth': return <Shield size={13} className="text-rose-400" />;
      default: return <HelpCircle size={13} className="text-slate-400" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    const classes = {
      demographics: "bg-blue-500/10 text-blue-400 border border-blue-500/15",
      scanner: "bg-purple-500/10 text-purple-400 border border-purple-500/15",
      appointments: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/15",
      settings: "bg-amber-500/10 text-amber-500 border border-amber-500/15",
      sync: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15",
      auth: "bg-rose-500/10 text-rose-400 border border-rose-500/15"
    }[category] || "bg-slate-500/10 text-slate-400 border border-slate-500/15";

    return (
      <span className={cn("px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0", classes)}>
        {getCategoryIcon(category)}
        {category}
      </span>
    );
  };

  const filteredLogs = logs.filter(log => {
    const matchesCategory = selectedCategory === 'all' || log.category === selectedCategory;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      (log.action || '').toLowerCase().includes(searchLower) ||
      (log.details || '').toLowerCase().includes(searchLower) ||
      (log.userEmail || '').toLowerCase().includes(searchLower) ||
      (log.username || '').toLowerCase().includes(searchLower);

    const matchesTenant =
      !tenantScope ||
      !dealershipId ||
      !log.dealershipId ||
      log.dealershipId === dealershipId;

    return matchesCategory && matchesSearch && matchesTenant;
  });

  const formatTimestamp = (ts: any) => {
    if (!ts) return "Just now";
    
    let date: Date;
    if (ts instanceof Timestamp) {
      date = ts.toDate();
    } else if (ts.seconds) {
      date = new Date(ts.seconds * 1000);
    } else {
      date = new Date(ts);
    }

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {tenantScope && dealershipId && (
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
          Showing logs for <span className="text-brand-primary">{dealershipId.toUpperCase()}</span> only
        </p>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-5">
        <div>
          <h4 className="text-lg font-black uppercase tracking-widest text-white">System Trail Logs</h4>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl font-medium">
            Real-time audit log tracking administrative overrides, demographics data entry, AI scanning, database synchronizations, and system parameters edits.
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 text-xs font-black uppercase tracking-widest rounded-xl text-slate-300 border border-white/5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary" size={16} />
          <input
            type="text"
            placeholder="Search action logs by username, email, descriptive keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all font-medium"
          />
        </div>

        {/* Category pills wrap list */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all justify-center border whitespace-nowrap",
                  isSelected
                    ? "bg-brand-primary text-black border-brand-primary shadow-lg shadow-brand-primary/15"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                )}
              >
                <Icon size={12} />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Logs Display Screen */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[#0a0e1a]/40 rounded-3xl border border-white/5">
          <Clock className="animate-spin text-brand-primary" size={32} />
          <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">Streaming System Audit Logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-[#0a0e1a]/40 rounded-3xl border border-white/5">
          <div className="p-4 bg-slate-900 rounded-full text-slate-500">
            <FileText size={24} />
          </div>
          <p className="text-slate-300 font-black uppercase tracking-widest text-xs">No Audit Logs Found</p>
          <p className="text-[11px] text-slate-500 max-w-sm text-center leading-relaxed">
            No activities matched your filter or search key. Try expanding the query.
          </p>
        </div>
      ) : (
        <div className="border border-white/5 bg-[#0a0e1a]/50 rounded-2xl overflow-hidden shadow-xl">
          <div className="max-h-[550px] overflow-y-auto divide-y divide-white/5 no-scrollbar">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.01] transition-all relative group">
                {/* Visual marker bar on hover */}
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-primary opacity-0 group-hover:opacity-100 transition-all" />
                
                <div className="flex items-start gap-4">
                  {/* Category bullet indicator */}
                  <div className="p-2.5 bg-slate-950 border border-white/5 rounded-xl shrink-0 mt-0.5">
                    {getCategoryIcon(log.category)}
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-slate-200 tracking-wide uppercase">{log.action || "System Trigger"}</span>
                      {getCategoryBadge(log.category)}
                    </div>
                    
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">{log.details}</p>
                    
                    {/* User identifier detail line */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[10px] text-slate-500 font-semibold font-mono">
                      <div className="flex items-center gap-1.5">
                        <User size={11} className="text-slate-600" />
                        <span>{log.username || "System"}</span>
                        <span className="text-slate-700 bg-slate-950/40 px-1.5 py-0.5 rounded border border-white/5 font-sans font-black text-[9px] uppercase tracking-wider">{log.userEmail || "system@active"}</span>
                      </div>
                      <span className="hidden sm:inline text-slate-700">|</span>
                      <span>ID: {log.id.slice(0, 8)}</span>
                      <span className="hidden sm:inline text-slate-700">|</span>
                      <span className="text-[9px] text-brand-primary font-sans font-black uppercase tracking-widest">{log.dealershipId ? log.dealershipId.toUpperCase() : "HYUNDAI"}</span>
                    </div>
                  </div>
                </div>

                {/* Date/Time Indicator */}
                <span className="text-[10px] sm:text-xs font-black text-slate-500 font-mono text-left md:text-right flex items-center gap-1.5 shrink-0 select-none">
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-slate-950/60 border-t border-white/5 flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              Live Feed Connected
            </span>
            <span className="text-[10px] font-mono text-slate-500 font-bold whitespace-nowrap">
              Showing {filteredLogs.length} of {logs.length} tracked items
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
