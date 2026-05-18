import React, { useState, useMemo } from 'react';
import { Search, ListFilter, Users, CalendarDays, Loader2, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, User } from '../../../types';
import CustomerCard from './CustomerCard';
import { cn } from '../../../lib/utils';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const [filterCategory, setFilterCategory] = useState<'All' | 'Hyundai' | 'Other'>('All');

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    
    return customers.filter(c => {
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

      return matchesSearch && matchesCategory;
    });
  }, [customers, searchQuery, filterCategory]);

  const displayCustomers = useMemo(() => {
    return filteredCustomers.slice(0, visibleCount);
  }, [filteredCustomers, visibleCount]);

  const monthlyAddedCount = useMemo(() => {
    return customers.filter(c => {
      const date = c.createdAt?.toDate ? (c.createdAt as any).toDate() : new Date();
      return date.getMonth() === new Date().getMonth();
    }).length;
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
            <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em]">Operational Database</span>
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
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-brand-primary transition-colors">Historical Records</span>
            <span className="text-3xl font-black text-white leading-none tracking-tight">{customers.length}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 px-6 py-4 rounded-3xl flex flex-col min-w-[140px] group hover:border-brand-secondary/30 transition-all">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={10} className="text-brand-secondary" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover:text-brand-secondary transition-colors">Fresh Intake</span>
            </div>
            <span className="text-3xl font-black text-white leading-none tracking-tight">{monthlyAddedCount}</span>
          </div>
        </div>
      </div>

      {/* Toolbar - Search and Filtration */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white/[0.02] backdrop-blur-xl p-2 rounded-3xl border border-white/5 shadow-2xl">
        <div className="relative flex-1 w-full">
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
        
        <div className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-[1.25rem] border border-white/5 w-full md:w-auto">
           {['All', 'Hyundai', 'Other'].map(cat => (
             <button 
               key={cat} 
               onClick={() => setFilterCategory(cat as any)}
               className={cn(
                 "px-6 py-3 rounded-[1rem] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                 filterCategory === cat 
                   ? "bg-brand-primary text-white shadow-xl shadow-brand-primary/20" 
                   : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
               )}
             >
               {cat}
             </button>
           ))}
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
              onClick={() => { setSearchQuery(''); setFilterCategory('All'); }}
              className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Reset All Filters
            </button>
          </motion.div>
        ) : (
          <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
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
