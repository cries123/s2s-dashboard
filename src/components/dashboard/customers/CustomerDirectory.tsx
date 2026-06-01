import React, { useState, useMemo, useEffect } from 'react';
import { Search, ListFilter, Users, CalendarDays, Loader2, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, User } from '../../../types';
import CustomerCard from './CustomerCard';
import { cn } from '../../../lib/utils';
import { usePreferences } from '../../../context/PreferencesContext';
import { isServiceAlertActive } from '../../../lib/alerts';
import { getStoredCrmSearch, setStoredCrmSearch } from '../../../lib/localPreferencesStorage';
import { LanguageFilter } from '../../../types';

interface CustomerDirectoryProps {
  customers: Customer[];
  currentUser: User;
  onViewProfile: (customer: Customer) => void;
  onViewLog: (customer: Customer) => void;
  onRefresh: (msg: string, isError?: boolean) => void;
}

export const CustomerDirectory: React.FC<CustomerDirectoryProps> = ({
  customers,
  currentUser,
  onViewProfile,
  onViewLog,
  onRefresh
}) => {
  const { preferences } = usePreferences();
  const [searchQuery, setSearchQuery] = useState(() => getStoredCrmSearch(currentUser.uid));
  const [alertsOnly, setAlertsOnly] = useState(preferences.crmDisplay.alertsOnlyDefault);
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>(
    preferences.crmDisplay.defaultLanguageFilter
  );

  useEffect(() => {
    setLanguageFilter(preferences.crmDisplay.defaultLanguageFilter);
  }, [preferences.crmDisplay.defaultLanguageFilter]);

  useEffect(() => {
    setAlertsOnly(preferences.crmDisplay.alertsOnlyDefault);
  }, [preferences.crmDisplay.alertsOnlyDefault]);

  useEffect(() => {
    setStoredCrmSearch(currentUser.uid, searchQuery);
  }, [searchQuery, currentUser.uid]);
  const [visibleCount, setVisibleCount] = useState(24);
  const [filterCategory, setFilterCategory] = useState<'All' | 'Hyundai' | 'Other'>('All');
  const [sortBy, setSortBy] = useState<'Recent' | 'Visits'>('Recent');

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    
    let result = customers.filter(c => {
      const matchesSearch = !q || (
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.vinLast8?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q)
      );

      const matchesCategory = filterCategory === 'All' || 
        (filterCategory === 'Hyundai' && c.make?.toLowerCase().includes('hyundai')) ||
        (filterCategory === 'Other' && !c.make?.toLowerCase().includes('hyundai'));

      const matchesLanguage =
        languageFilter === 'all' ||
        (languageFilter === 'english' && (c.language || 'English').toLowerCase().includes('english')) ||
        (languageFilter === 'spanish' && (c.language || '').toLowerCase().includes('spanish'));

      const matchesAlerts = !alertsOnly || isServiceAlertActive(c);

      return matchesSearch && matchesCategory && matchesLanguage && matchesAlerts;
    });

    // Helper for date parsing
    const getTime = (d: string | undefined | any) => {
      if (!d) return 0;
      if (typeof d === 'object' && d?.toDate) return d.toDate().getTime(); // Handle Timestamp
      const date = new Date(d);
      return isNaN(date.getTime()) ? 0 : date.getTime();
    };

    // Apply Sorting
    return result.sort((a, b) => {
      if (sortBy === 'Recent') {
        const timeA = getTime(a.lastServiceDate);
        const timeB = getTime(b.lastServiceDate);
        if (timeB !== timeA) return timeB - timeA; // Newest first
        return a.lastName.localeCompare(b.lastName);
      }
      
      if (sortBy === 'Visits') {
        const countA = a.recentVisits?.length || 0;
        const countB = b.recentVisits?.length || 0;
        if (countB !== countA) return countB - countA; // Most visited first
        
        // Priority Tie-breaker: Who was here most recently?
        const timeA = getTime(a.lastServiceDate);
        const timeB = getTime(b.lastServiceDate);
        if (timeB !== timeA) return timeB - timeA;

        return a.lastName.localeCompare(b.lastName);
      }

      return a.lastName.localeCompare(b.lastName);
    });
  }, [customers, searchQuery, filterCategory, sortBy, languageFilter, alertsOnly]);

  const displayCustomers = useMemo(() => {
    return filteredCustomers.slice(0, visibleCount);
  }, [filteredCustomers, visibleCount]);

  const stats = useMemo(() => {
    let totalROs = 0;
    let maxROs = 0;
    let topCustomer: Customer | null = null;
    
    // Helper for date parsing in stats
    const getTime = (d: string | undefined | any) => {
      if (!d) return 0;
      if (typeof d === 'object' && d?.toDate) return d.toDate().getTime();
      const date = new Date(d);
      return isNaN(date.getTime()) ? 0 : date.getTime();
    };

    customers.forEach(c => {
      const visits = c.recentVisits?.length || 0;
      totalROs += visits;
      
      // Better Top Visitor logic with tie-breakers
      const isNewLeader = !topCustomer || 
        visits > maxROs || 
        (visits === maxROs && (
          getTime(c.lastServiceDate) > getTime(topCustomer.lastServiceDate) ||
          (getTime(c.lastServiceDate) === getTime(topCustomer.lastServiceDate) && 
           c.lastName.localeCompare(topCustomer.lastName) < 0)
        ));

      if (isNewLeader) {
        maxROs = visits;
        topCustomer = c;
      }
    });

    return { totalROs, topCustomer, maxROs };
  }, [customers]);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Directory Header & Stats */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 pb-8 border-b border-white/5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
              <Users className="text-brand-primary" size={18} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em]">Operational Database</span>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[8px] font-black rounded border border-white/5 uppercase tracking-widest italic">
                Archive: 2015 - 2026
              </span>
            </div>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter uppercase italic">
            Customer <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary">Directory</span>
          </h2>
          <p className="text-slate-500 mt-2 font-medium leading-relaxed max-w-lg">
            Access and manage the complete synchronization records for your dealership's customer base.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 w-full lg:w-auto">
          <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 px-6 py-4 rounded-3xl flex flex-col min-w-[140px] group hover:border-brand-primary/30 transition-all">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-brand-primary transition-colors">Customers</span>
            <span className="text-3xl font-black text-white leading-none tracking-tight">{customers.length}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 px-6 py-4 rounded-3xl flex flex-col min-w-[140px] group hover:border-brand-primary/30 transition-all">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-brand-primary transition-colors">RO Count</span>
            <span className="text-3xl font-black text-white leading-none tracking-tight">{stats.totalROs}</span>
          </div>
          <button 
            onClick={() => stats.topCustomer && onViewProfile(stats.topCustomer)}
            disabled={!stats.topCustomer}
            className="bg-slate-900/50 backdrop-blur-md border border-white/5 px-6 py-4 rounded-3xl flex flex-col min-w-[160px] group hover:border-brand-secondary/50 hover:bg-brand-secondary/5 transition-all cursor-pointer text-left disabled:cursor-not-allowed"
          >
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-brand-secondary transition-colors">Top Visitor</span>
            {stats.topCustomer ? (
              <div>
                <span className="text-lg font-black text-white block truncate w-32 uppercase italic group-hover:text-brand-secondary transition-colors">
                  {stats.topCustomer.lastName}
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {stats.maxROs} Visits
                </span>
              </div>
            ) : (
              <span className="text-3xl font-black text-white italic">N/A</span>
            )}
          </button>
        </div>
      </div>

      {/* Toolbar - Search and Filtration */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center bg-white/[0.02] backdrop-blur-xl p-2 rounded-[2rem] border border-white/5 shadow-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary/50 group-focus-within:text-brand-primary transition-colors" size={20} />
          <input
            type="text"
            placeholder="Filter by name, phone, VIN, or model..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(24);
            }}
            className="w-full bg-transparent border-none rounded-2xl pl-14 pr-6 py-5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-0 font-bold text-sm tracking-tight"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1.5 rounded-[1.5rem] border border-white/5 justify-center lg:justify-start">
           <div className="flex items-center gap-1">
             {['All', 'Hyundai', 'Other'].map(cat => (
               <button 
                 key={cat} 
                 onClick={() => setFilterCategory(cat as any)}
                 className={cn(
                   "px-4 py-2.5 rounded-[1rem] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                   filterCategory === cat 
                     ? "bg-brand-primary text-white shadow-xl shadow-brand-primary/20" 
                     : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                 )}
               >
                 {cat}
               </button>
             ))}
           </div>

           <div className="hidden lg:block w-px h-6 bg-white/5 mx-1" />

           <div className="flex items-center gap-1">
             {([
               { id: 'all', label: 'All Lang' },
               { id: 'english', label: 'English' },
               { id: 'spanish', label: 'Spanish' },
             ] as const).map(({ id, label }) => (
               <button
                 key={id}
                 type="button"
                 onClick={() => setLanguageFilter(id)}
                 className={cn(
                   "px-3 py-2.5 rounded-[1rem] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                   languageFilter === id
                     ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                     : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                 )}
               >
                 {label}
               </button>
             ))}
           </div>

           <button
             type="button"
             onClick={() => setAlertsOnly(!alertsOnly)}
             className={cn(
               "px-3 py-2.5 rounded-[1rem] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
               alertsOnly
                 ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                 : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
             )}
           >
             Alerts only
           </button>

           <div className="hidden lg:block w-px h-6 bg-white/5 mx-1" />
           <div className="lg:hidden w-full h-px bg-white/5 my-0.5" />

           <div className="flex items-center gap-1">
             {[
               { id: 'Recent', label: 'Recently Visited' },
               { id: 'Visits', label: 'Most Visited' }
             ].map(sort => (
               <button 
                 key={sort.id} 
                 onClick={() => setSortBy(sort.id as any)}
                 className={cn(
                   "px-4 py-2.5 rounded-[1rem] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                   sortBy === sort.id 
                     ? "bg-brand-secondary text-white shadow-xl shadow-brand-secondary/20" 
                     : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                 )}
               >
                 {sort.label}
               </button>
             ))}
           </div>
        </div>
      </div>

      {/* Results Grid */}
      <AnimatePresence mode="wait">
        {filteredCustomers.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-32 text-center border-2 border-dashed border-slate-800 rounded-[3rem] bg-slate-900/10"
          >
            <div className="w-24 h-24 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-8 text-slate-700 border border-slate-800">
              <Search size={40} />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight">Zero Matches Found</h3>
            <p className="text-slate-500 mt-3 max-w-sm mx-auto font-medium italic">
              Ensure the VIN or name is correct. Our database is synchronized with realtime records.
            </p>
            <button 
              onClick={() => { setSearchQuery(''); setFilterCategory('All'); setLanguageFilter('all'); setAlertsOnly(false); }}
              className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Reset All Filters
            </button>
          </motion.div>
        ) : (
          <div className="space-y-12">
            <div className={cn(
              "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
              preferences.crmDisplay.density === 'compact' ? "gap-4" : "gap-8"
            )}>
              {displayCustomers.map((c, idx) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.05, 1) }}
                >
                  <CustomerCard 
                    customer={c} 
                    currentUser={currentUser}
                    onViewProfile={onViewProfile}
                    onViewLog={onViewLog}
                    onRefresh={onRefresh}
                  />
                </motion.div>
              ))}
            </div>

            {filteredCustomers.length > visibleCount && (
              <div className="flex justify-center pt-8 pb-12">
                <button 
                  onClick={() => setVisibleCount(prev => prev + 24)}
                  className="group relative px-12 py-5 bg-slate-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl hover:border-brand-primary/50 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-primary/0 via-brand-primary/5 to-brand-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <span className="relative z-10 flex items-center gap-3 text-[11px] font-black text-white uppercase tracking-[0.2em]">
                    Expand Database <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
