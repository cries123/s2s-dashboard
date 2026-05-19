import React, { useState } from 'react';
import { collection, query, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Customer } from '../../../types';
import { Search, Trash2, AlertTriangle, Loader2, Users, CheckCircle2, ChevronRight, Hash, Ban } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface DuplicateGroup {
  vin: string;
  customers: Customer[];
}

interface ScanStats {
  total: number;
  duplicatesFound: number;
  roCount: number;
  topVisitorName: string;
  topVisitorCount: number;
}

export function DuplicateDetector() {
  const [isScanning, setIsScanning] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [scanStats, setScanStats] = useState<ScanStats>({ 
    total: 0, 
    duplicatesFound: 0, 
    roCount: 0, 
    topVisitorName: '', 
    topVisitorCount: 0 
  });
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const scanForDuplicates = async () => {
    setIsScanning(true);
    setDuplicateGroups([]);
    
    try {
      const q = query(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'));
      const snapshot = await getDocs(q);
      const allCustomers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Customer[];
      
      const vinMap = new Map<string, Customer[]>();
      let totalROs = 0;
      let maxROs = 0;
      let topCustomer: Customer | null = null;
      
      allCustomers.forEach(customer => {
        // Track RO Count
        const visits = customer.recentVisits?.length || 0;
        totalROs += visits;
        
        if (visits > maxROs) {
          maxROs = visits;
          topCustomer = customer;
        }

        if (!customer.vinLast8) return;
        const normalizedVin = customer.vinLast8.toUpperCase().trim();
        if (!vinMap.has(normalizedVin)) {
          vinMap.set(normalizedVin, []);
        }
        vinMap.get(normalizedVin)?.push(customer);
      });
      
      const groups: DuplicateGroup[] = [];
      let duplicateCount = 0;
      
      vinMap.forEach((customers, vin) => {
        if (customers.length > 1) {
          groups.push({ vin, customers });
          duplicateCount += (customers.length - 1);
        }
      });
      
      setDuplicateGroups(groups);
      setScanStats({
        total: allCustomers.length,
        duplicatesFound: duplicateCount,
        roCount: totalROs,
        topVisitorName: topCustomer ? `${(topCustomer as Customer).lastName}, ${(topCustomer as Customer).firstName || ''}` : 'N/A',
        topVisitorCount: maxROs
      });
    } catch (error) {
      console.error("Duplicate Scan Error:", error);
      alert("Failed to complete system scan. Check console for details.");
    } finally {
      setIsScanning(false);
    }
  };

  const deleteCustomer = async (customerId: string, vin: string) => {
    if (!window.confirm("Confirm permanent removal of this duplicate profile? All associated data will be lost.")) return;
    
    setIsDeleting(customerId);
    try {
      await deleteDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customerId));
      
      // Update UI state
      setDuplicateGroups(prev => prev.map(group => {
        if (group.vin === vin) {
          return {
            ...group,
            customers: group.customers.filter(c => c.id !== customerId)
          };
        }
        return group;
      }).filter(group => group.customers.length > 1));
      
      setScanStats(prev => ({
        ...prev,
        duplicatesFound: prev.duplicatesFound - 1
      }));
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Permission denied. Failed to remove record.");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="card-base p-8 border-brand-secondary/20 bg-brand-secondary/5 ring-1 ring-brand-secondary/10 overflow-hidden relative">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Hash size={120} className="text-brand-secondary" />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="text-3xl font-black text-white uppercase tracking-tight italic">Directory <span className="text-brand-secondary">Core</span></h3>
            <span className="px-3 py-1 bg-brand-secondary/20 text-brand-secondary text-[10px] font-black rounded-lg border border-brand-secondary/30 uppercase tracking-widest italic animate-pulse">
              Archive: 2015 - 2026
            </span>
          </div>
          <p className="text-slate-400 font-medium max-w-lg leading-relaxed italic">
            Analyze the neural directory database for integrity, service frequency, and VIN duplications.
          </p>
        </div>

        <button
          onClick={scanForDuplicates}
          disabled={isScanning}
          className="group relative px-10 py-4 bg-brand-secondary text-white rounded-2xl font-black uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95 shadow-xl shadow-brand-secondary/20 disabled:opacity-50 flex items-center gap-3 overflow-hidden"
        >
          {isScanning ? <Loader2 className="animate-spin" /> : <Search size={22} />}
          {isScanning ? 'Scanned Core...' : 'Sync Directory Knowledge'}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {scanStats.total > 0 && !isScanning && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8"
          >
            <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Profiles</p>
              <p className="text-2xl font-black text-white italic">{scanStats.total}</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">RO Count</p>
              <p className="text-2xl font-black text-brand-primary italic">{scanStats.roCount}</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Top Visitor</p>
              <p className="text-sm font-black text-white italic truncate" title={scanStats.topVisitorName}>
                {scanStats.topVisitorName}
              </p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">{scanStats.topVisitorCount} Visits</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Duplications</p>
              <p className={cn("text-2xl font-black italic", scanStats.duplicatesFound > 0 ? "text-brand-secondary" : "text-emerald-500")}>
                {scanStats.duplicatesFound}
              </p>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Integrity Score</p>
              <p className="text-xl font-black text-white italic uppercase">
                {scanStats.duplicatesFound === 0 ? 'Optimal' : scanStats.duplicatesFound > 10 ? 'Degraded' : 'Nominal'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {duplicateGroups.length === 0 && !isScanning && scanStats.total > 0 && (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-950 rounded-3xl border border-white/5 border-dashed">
            <CheckCircle2 size={48} className="text-emerald-500 mb-4 opacity-50" />
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Database Integrity Verified. No duplicates detected.</p>
          </div>
        )}

        {duplicateGroups.map((group, idx) => (
          <motion.div
            key={group.vin}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-slate-950 rounded-3xl border border-white/5 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-brand-secondary/10 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-secondary text-white flex items-center justify-center font-black text-xs">
                  {group.customers.length}
                </div>
                <div>
                  <p className="text-[10px] font-black text-brand-secondary uppercase tracking-widest">VIN MATCH IDENTIFIED</p>
                  <p className="text-lg font-black text-white italic leading-none">{group.vin}</p>
                </div>
              </div>
              <AlertTriangle className="text-brand-secondary" size={20} />
            </div>

            <div className="divide-y divide-white/5">
              {group.customers.map((customer) => (
                <div key={customer.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center border border-white/5 text-slate-500">
                      <Users size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase italic">{customer.lastName}, {customer.firstName}</h4>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{customer.year} {customer.model}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-800" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{customer.mileage} Miles</span>
                        <div className="w-1 h-1 rounded-full bg-slate-800" />
                        <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">SOCount: {customer.recentVisits?.length || 0}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteCustomer(customer.id, group.vin)}
                    disabled={isDeleting === customer.id}
                    className="p-3 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {isDeleting === customer.id ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                  </button>
                </div>
              ))}
            </div>
            
            <div className="px-6 py-3 bg-slate-950 flex justify-end">
               <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest italic">
                 Manual Action Required: Retain the record with the most comprehensive service history.
               </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
