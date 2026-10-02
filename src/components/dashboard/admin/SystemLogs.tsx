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
import { isPreviewMode } from '../../../lib/previewMode';

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
  { id: 'all', label: 'All', icon: FileText },
  { id: 'demographics', label: 'Customers', icon: User },
  { id: 'scanner', label: 'Document scans', icon: Laptop },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'auth', label: 'Sign-ins', icon: Shield },
];

interface SystemLogsProps {
  dealershipId?: string;
  tenantScope?: boolean;
}

export function SystemLogs({ dealershipId, tenantScope = false }: SystemLogsProps) {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadedScope, setLoadedScope] = useState('');
  const scopedDealershipId = user && isPlatformAdmin(user) ? (dealershipId || resolveUserDealershipId(user)) : user ? resolveUserDealershipId(user) : '';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (authLoading) return;
    setLogs([]);
    setLoadedScope('');
    setLoading(true);
    setLoadError(false);
    if (!user || isPreviewMode) {
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
      
      setLoadedScope(scopedDealershipId);
      setLogs(logsList);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      setLogs([]);
      setLoadError(true);
      console.error('[SystemLogs] Could not load logs', error);
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
      <span className={cn("px-2.5 py-1 rounded-md text-xs font-semibold normal-case tracking-normal flex items-center gap-1.5 shrink-0", classes)}>
        {getCategoryIcon(category)}
        {category}
      </span>
    );
  };

  const filteredLogs = (loadedScope === scopedDealershipId ? logs : []).filter(log => {
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
      {loadError && (
        <div role="alert" className="card-base p-4">
          <p className="text-sm font-semibold">Couldn't load the logs</p>
          <p className="crm-label mt-1">Check your connection, then reload the page.</p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            type="search"
            placeholder="Search logs"
            aria-label="Search logs by name, email or description"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        {/* Category chips: one scrolling row on phones instead of a three-row wall. */}
        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 sm:pb-0">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold transition-colors justify-center border whitespace-nowrap",
                  isSelected
                    ? "bg-brand-primary/15 text-brand-primary border-brand-primary/40"
                    : "border-surface-border text-text-secondary hover:text-text-primary"
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
          <p className="crm-label">Loading logs…</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-[#0a0e1a]/40 rounded-3xl border border-white/5">
          <div className="p-4 bg-slate-900 rounded-full text-slate-500">
            <FileText size={24} />
          </div>
          <p className="text-sm font-semibold">{logs.length ? 'No matching entries' : 'No activity yet'}</p>
          <p className="crm-label max-w-sm text-center">
            {logs.length ? 'Try a different search or category.' : 'Actions taken in the app will appear here.'}
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
                      <span className="text-xs font-semibold text-slate-200 tracking-wide normal-case">{log.action || "System event"}</span>
                      {getCategoryBadge(log.category)}
                    </div>
                    
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">{log.details}</p>
                    
                    {/* User identifier detail line */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-slate-500 font-semibold font-mono">
                      <div className="flex items-center gap-1.5">
                        <User size={11} className="text-slate-600" />
                        <span>{log.username || "System"}</span>
                        <span className="text-slate-700 bg-slate-950/40 px-1.5 py-0.5 rounded border border-white/5 font-sans font-semibold text-xs normal-case tracking-normal">{log.userEmail || "—"}</span>
                      </div>
                      <span className="hidden sm:inline text-slate-700">|</span>
                      <span>ID: {log.id.slice(0, 8)}</span>
                      <span className="hidden sm:inline text-slate-700">|</span>
                      <span className="text-xs text-brand-primary font-sans font-semibold normal-case tracking-normal">{log.dealershipId ? log.dealershipId.toUpperCase() : "HYUNDAI"}</span>
                    </div>
                  </div>
                </div>

                {/* Date/Time Indicator */}
                <span className="text-xs sm:text-xs font-semibold text-slate-500 font-mono text-left md:text-right flex items-center gap-1.5 shrink-0 select-none">
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-slate-950/60 border-t border-white/5 flex items-center justify-between">
            <span className="crm-label">Updates automatically</span>
            <span className="crm-label tabular-nums whitespace-nowrap">
              {filteredLogs.length} of {logs.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
