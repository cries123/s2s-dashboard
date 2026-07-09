import React, { useState, useMemo, useEffect } from 'react';
import { Search, Users, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, User } from '../../../types';
import CustomerCard from './CustomerCard';
import { cn } from '../../../lib/utils';
import { PageHeader } from '../../layout/PageHeader';
import { DataTable } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import {
  directoryMakeFiltersForDealership,
  DirectoryMakeFilter,
  matchesDirectoryMakeFilter,
} from '../../../lib/directoryMakeFilters';
import { formatCustomerDisplayName } from '../../../lib/customerName';

interface CustomerDirectoryProps {
  customers: Customer[];
  currentUser: User;
  currentDealershipId: string;
  onViewProfile: (customer: Customer) => void;
  onViewLog: (customer: Customer) => void;
  onRefresh: (msg: string, isError?: boolean) => void;
}

export const CustomerDirectory: React.FC<CustomerDirectoryProps> = ({
  customers,
  currentUser,
  currentDealershipId,
  onViewProfile,
  onViewLog,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const [filterCategory, setFilterCategory] = useState<DirectoryMakeFilter>('All');
  const [sortBy, setSortBy] = useState<'Recent' | 'Visits'>('Recent');

  const makeFilters = useMemo(
    () => directoryMakeFiltersForDealership(currentDealershipId),
    [currentDealershipId]
  );

  useEffect(() => {
    if (!makeFilters.includes(filterCategory)) {
      setFilterCategory('All');
    }
  }, [makeFilters, filterCategory]);

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

      return matchesSearch && matchesCategory;
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
  }, [customers, searchQuery, filterCategory, sortBy]);

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

  const tableColumns = [
    {
      key: 'name',
      header: 'Customer',
      render: (c: Customer) => (
        <div>
          <p className="font-medium">{formatCustomerDisplayName(c.firstName, c.lastName)}</p>
          <p className="crm-label text-xs">{c.phone || 'No phone'}</p>
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (c: Customer) => (
        <span className="text-sm">{c.year ? `${c.year} ` : ''}{c.make} {c.model}</span>
      ),
    },
    { key: 'vin', header: 'VIN (last 8)', render: (c: Customer) => <span className="font-mono text-xs">{c.vinLast8}</span> },
    {
      key: 'visits',
      header: 'Visits',
      className: 'text-right',
      render: (c: Customer) => <span className="tabular-nums">{c.recentVisits?.length || 0}</span>,
    },
    {
      key: 'last',
      header: 'Last service',
      render: (c: Customer) => (
        <span className="crm-label">{c.lastServiceDate ? String(c.lastServiceDate).slice(0, 10) : '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customer directory"
        description="Search and open customer profiles, service history, and contact logs."
        breadcrumbs={[{ label: 'Service' }, { label: 'Directory' }]}
        actions={
          <div className="flex gap-2 text-sm">
            <span className="badge badge-info">{customers.length} customers</span>
            <span className="badge badge-info">{stats.totalROs} ROs</span>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center card-base p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search name, phone, VIN, model..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(24);
            }}
            className="input-field pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border" style={{ borderColor: 'var(--color-surface-border)' }}>
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
          <EmptyState
            title="No customers match your search"
            description="Try a different name, phone number, or VIN. Clear filters to see the full directory."
            action={
              <button type="button" onClick={() => { setSearchQuery(''); setFilterCategory('All'); }} className="btn-secondary">
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            <div className="hidden lg:block">
              <DataTable
                columns={tableColumns}
                data={displayCustomers}
                rowKey={(c) => c.id}
                onRowClick={onViewProfile}
              />
              <p className="crm-label mt-2 px-1">
                Showing {displayCustomers.length} of {filteredCustomers.length} matches
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
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
