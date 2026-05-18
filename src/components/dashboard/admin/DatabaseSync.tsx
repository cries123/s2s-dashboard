import React, { useState, useRef, useEffect } from 'react';
import { FileUp, Database, Loader2, CheckCircle2, AlertCircle, Users, HardDriveDownload, Search, FileCode, History as HistoryIcon, Clock, User as UserIcon } from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../firebase';
import { User, ServiceVisit, Customer, ImportLog } from '../../../types';
import { cn } from '../../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';

interface DatabaseSyncProps {
  currentUser: User;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

interface SyncStats {
  total: number;
  processed: number;
  newCustomers: number;
  existingCustomers: number;
  visitsAdded: number;
  duplicates: number;
}

export const DatabaseSync: React.FC<DatabaseSyncProps> = ({ currentUser, onSuccess, onError }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setSyncStats] = useState<SyncStats | null>(null);
  const [syncLogs, setSyncLogs] = useState<{ msg: string, status: 'new' | 'match' | 'duplicate' | 'error' }[]>([]);
  const [currentAction, setCurrentAction] = useState<string>('');
  const [pastImports, setPastImports] = useState<ImportLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFileNameRef = useRef<string>('');
  const currentFileTypeRef = useRef<string>('');

  useEffect(() => {
    fetchImportHistory();
  }, []);

  const fetchImportHistory = async () => {
    try {
      const q = query(
        collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'audit', 'imports'),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ImportLog[];
      setPastImports(logs);
    } catch (error) {
      console.error("Error fetching import history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = file.name.split('.').pop()?.toLowerCase();
    currentFileNameRef.current = file.name;
    currentFileTypeRef.current = fileType || '';
    
    if (fileType !== 'pdf' && fileType !== 'csv') {
      onError?.("Please upload a PDF or CSV file.");
      return;
    }

    setIsUploading(true);
    setSyncLogs([]);
    setCurrentAction('Processing file...');

    try {
      if (fileType === 'csv') {
        const text = await file.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            const visits = results.data.map((row: any) => {
              const nameParts = (row['Contact Name'] || '').split(',');
              const lastName = nameParts[0]?.trim() || 'Unknown';
              const firstName = (nameParts[1] || '').trim();

              return {
                firstName,
                lastName,
                phone: row['Cell Phone'] || '',
                vin: row['VIN'] || '',
                make: 'Hyundai',
                model: row['Model'] || '',
                year: row['Year'] || '',
                soNumber: row['SO Number'] || row['soNumber'] || '',
                date: row['Open Date'] || row['date'] || '',
                mileage: parseInt((row['Odom In'] || row['mileage'] || '0').toString().replace(/,/g, '')),
                advisor: row['CSR Code'] || row['advisor'] || '',
                requests: row['Requests'] || row['requests'] || ''
              };
            });
            await processVisits(visits);
          },
          error: (error) => {
            throw new Error(`CSV Parse Error: ${error.message}`);
          }
        });
      } else {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });

        const response = await fetch('/api/parse-service-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 })
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 429 || errorData.isQuotaError) {
            throw new Error("QUOTA_EXHAUSTED");
          }
          throw new Error(errorData.error || "Failed to parse document");
        }
        const data = await response.json();
        
        if (data.visits) {
          await processVisits(data.visits);
        }
      }
    } catch (err: any) {
      console.error("Sync Error:", err);
      if (err.message === "QUOTA_EXHAUSTED") {
        setSyncLogs(prev => [{ msg: "SYSTEM LIMIT REACHED: Free Tier Quota Exhausted.", status: 'error' }, ...prev]);
        onError?.("Gemini usage limit reached. Please use CSV format for high volume imports.");
      } else {
        onError?.(err.message || "Failed to process database sync");
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const processVisits = async (visits: any[]) => {
    setIsProcessing(true);
    const syncResults: SyncStats = {
      total: visits.length,
      processed: 0,
      newCustomers: 0,
      existingCustomers: 0,
      visitsAdded: 0,
      duplicates: 0
    };
    setSyncStats(syncResults);
    setSyncLogs([]);

    for (const v of visits) {
      if (!v.lastName || !v.vin || !v.soNumber) {
        syncResults.processed++;
        setSyncStats({ ...syncResults });
        continue;
      }

      setCurrentAction(`Syncing: ${v.lastName}, ${v.firstName || ''} (${v.soNumber})`);
      
      try {
        // 1. Cross-reference customer by VIN
        const customersRef = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers');
        const q = query(customersRef, where('vinLast8', '==', v.vin.slice(-8)));
        const snapshot = await getDocs(q);
        
        let customerId: string;
        let existingCustomer: Customer | null = null;

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          existingCustomer = { id: doc.id, ...doc.data() } as Customer;
          customerId = existingCustomer.id;
          syncResults.existingCustomers++;
          setSyncLogs(prev => [{ msg: `Matched ${v.lastName} (${v.vin.slice(-8)})`, status: 'match' }, ...prev].slice(0, 50));
        }

        // 2. Prepare Visit Object
        const serviceVisit: ServiceVisit = {
          id: Math.random().toString(36).substring(2, 9),
          soNumber: v.soNumber.toString(),
          date: v.date,
          mileage: typeof v.mileage === 'number' ? v.mileage : parseInt(v.mileage || '0'),
          advisor: v.advisor || 'System',
          requests: v.requests || 'No request details provided.',
          createdAt: Timestamp.now()
        };
        
        if (!existingCustomer) {
          // Create new customer profile WITH initial visit
          const newCustomer = {
            firstName: v.firstName || '',
            lastName: v.lastName,
            phone: v.phone || '',
            email: '',
            make: v.make || 'Hyundai',
            model: v.model || '',
            year: v.year || '',
            vinLast8: v.vin.slice(-8),
            mileage: (v.mileage || 0).toString(),
            soldDate: '',
            language: 'English',
            enableServiceAlert: true,
            serviceAlertTriggered: false,
            createdAt: serverTimestamp(),
            addedBy: currentUser?.uid || "unknown",
            addedByUsername: currentUser?.username || "System",
            dealershipId: currentUser?.dealershipId || 'hyundai',
            recentVisits: [serviceVisit],
            lastServiceDate: v.date
          };
          
          await addDoc(customersRef, newCustomer);
          syncResults.newCustomers++;
          syncResults.visitsAdded++;
          setSyncLogs(prev => [{ msg: `Created profile & logged SO #${v.soNumber} for ${v.lastName}`, status: 'new' }, ...prev].slice(0, 50));
        } else {
          // Update existing customer
          const customerDocRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customerId);
          const updates: any = {};
          
          // Update mileage if more recent
          const currentMileage = parseInt(existingCustomer.mileage || '0');
          if (serviceVisit.mileage > currentMileage) {
            updates.mileage = serviceVisit.mileage.toString();
          }

          // Force update lastServiceDate
          updates.lastServiceDate = v.date;
          
          // Add to recentVisits if not duplicate
          let visitsArray = existingCustomer.recentVisits || [];
          if (!visitsArray.some(ev => ev.soNumber === serviceVisit.soNumber)) {
             visitsArray = [serviceVisit, ...visitsArray].slice(0, 30); // Keep last 30
             updates.recentVisits = visitsArray;
             syncResults.visitsAdded++;
             setSyncLogs(prev => [{ msg: `Logged visit SO #${v.soNumber} for ${v.lastName}`, status: 'match' }, ...prev].slice(0, 50));
          } else {
            syncResults.duplicates++;
            setSyncLogs(prev => [{ msg: `SO #${v.soNumber} already exists for ${v.lastName}. Skipping.`, status: 'duplicate' }, ...prev].slice(0, 50));
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(customerDocRef, updates);
          }
        }

      } catch (err) {
        console.error("Error processing visit:", v.soNumber, err);
        setSyncLogs(prev => [{ msg: `Error processing ${v.lastName} (SO #${v.soNumber})`, status: 'error' }, ...prev].slice(0, 50));
      }

      syncResults.processed++;
      setSyncStats({ ...syncResults });
    }

    setIsProcessing(false);
    
    // Save Import Log
    try {
      const logData: Omit<ImportLog, "id"> = {
        timestamp: Timestamp.now(),
        userId: currentUser?.uid || "unknown",
        username: currentUser?.username || "System",
        filename: currentFileNameRef.current || "Unknown File",
        totalRecords: syncResults.total,
        newProfiles: syncResults.newCustomers,
        matchedProfiles: syncResults.existingCustomers,
        visitsLogged: syncResults.visitsAdded,
        duplicates: syncResults.duplicates,
        type: (currentFileTypeRef.current === "pdf" || currentFileTypeRef.current === "csv") 
          ? currentFileTypeRef.current 
          : "csv"
      };
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'audit', 'imports'), logData);
      fetchImportHistory();
    } catch (e) {
      console.error("Failed to save import log:", e);
    }

    onSuccess?.(`Database synchronized: ${syncResults.visitsAdded} visits recorded and ${syncResults.newCustomers} profiles created.`);
  };

  return (
    <div className="card-base p-10 bg-slate-900 shadow-2xl relative overflow-hidden group border-brand-primary/20">
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl group-hover:bg-brand-primary/10 transition-colors duration-1000"></div>
      
      <div className="relative z-10 flex flex-col items-center text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shadow-inner border border-brand-primary/20">
          <Database size={40} />
        </div>

        <div className="space-y-2">
          <h3 className="text-3xl font-black text-white uppercase tracking-tight italic">Ultimate Database <span className="text-brand-primary">Sync</span></h3>
          <p className="text-slate-400 font-medium max-w-lg mx-auto leading-relaxed italic">
            "We aren't just selling cars, we're building a legacy of service history."
          </p>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-950/50 px-4 py-2 rounded-lg border border-white/5 inline-block">
             No AI assistance? Upload .CSV files for high-volume, free processing.
          </p>
        </div>

        {!isProcessing && !isUploading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group relative px-10 py-5 bg-brand-primary text-white rounded-2xl font-black uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95 shadow-xl shadow-brand-primary/20 flex items-center gap-3 overflow-hidden"
              >
                <HardDriveDownload size={22} />
                Import File
              </button>
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.csv"
            />
            
            <div className="grid grid-cols-2 gap-4 mt-2">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-xl border border-white/5">
                 <div className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
                 <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">PDF (AI-Powered)</span>
               </div>
               <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-xl border border-white/5">
                 <div className="w-2 h-2 rounded-full bg-emerald-500" />
                 <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">CSV (Direct Engine)</span>
               </div>
            </div>
            
            {syncLogs.some(log => log.msg.includes("Quota Exhausted")) && (
              <div className="mt-4 p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col items-center gap-3 max-w-md">
                 <AlertCircle className="text-amber-500" size={24} />
                 <p className="text-xs font-bold text-amber-400">Monthly Free AI Limit Reached.</p>
                 <p className="text-[9px] text-slate-500 uppercase font-black text-center">Switch to CSV format for unlimited free imports or add an API key at ai.studio</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full space-y-8 animate-in fade-in duration-500">
             <div className="space-y-3">
               <div className="flex justify-between items-end">
                 <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">{currentAction}</span>
                 <span className="text-xl font-black text-white">{Math.round((stats?.processed || 0) / (stats?.total || 1) * 100)}%</span>
               </div>
               <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-white/5 p-0.5">
                 <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${((stats?.processed || 0) / (stats?.total || 1)) * 100}%` }}
                   className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary rounded-full shadow-[0_0_15px_rgba(235,0,42,0.4)]"
                 />
               </div>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'Identified', value: stats?.total, color: 'text-white' },
                  { label: 'New Profiles', value: stats?.newCustomers, color: 'text-brand-secondary' },
                  { label: 'Matched', value: stats?.existingCustomers, color: 'text-emerald-500' },
                  { label: 'Visits Logged', value: stats?.visitsAdded, color: 'text-brand-primary' },
                  { label: 'Existing SOs', value: stats?.duplicates, color: 'text-slate-500' },
                ].map((s, i) => (
                  <div key={i} className="bg-slate-950 p-4 rounded-2xl border border-white/5 shadow-inner">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={cn("text-2xl font-black", s.color)}>{s.value}</p>
                  </div>
                ))}
             </div>

             <div className="text-left space-y-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <FileCode size={12} className="text-brand-primary" />
                  <span className="text-[9px] font-black uppercase tracking-widest italic">Engine Execution Log</span>
                </div>
                <div className="bg-slate-950 rounded-2xl border border-white/5 h-48 overflow-y-auto p-4 custom-scrollbar space-y-2">
                   {syncLogs.length === 0 && (
                     <div className="h-full flex items-center justify-center text-slate-700 text-[10px] font-bold uppercase tracking-widest italic">
                        Initializing Import Sequence...
                     </div>
                   )}
                   {syncLogs.map((log, i) => (
                     <motion.div 
                       key={i}
                       initial={{ opacity: 0, x: -10 }}
                       animate={{ opacity: 1, x: 0 }}
                       className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0"
                     >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          log.status === 'new' ? "bg-brand-secondary shadow-[0_0_8px_rgba(255,107,0,0.5)]" :
                          log.status === 'match' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                          log.status === 'duplicate' ? "bg-slate-600" :
                          "bg-red-500"
                        )}></div>
                        <span className={cn(
                          "text-[10px] font-medium tracking-tight truncate",
                          log.status === 'error' ? "text-red-400" : "text-slate-400"
                        )}>{log.msg}</span>
                     </motion.div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {/* Import History Table */}
        <div className="mt-12 w-full max-w-4xl mx-auto pt-12 border-t border-white/5">
           <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center border border-white/5 text-brand-primary shadow-inner">
                  <HistoryIcon size={20} />
                </div>
                <div className="text-left">
                  <h4 className="text-xl font-black text-white uppercase italic tracking-tight">Import Master <span className="text-brand-primary">History</span></h4>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mt-1">Audit trail for database synchronization events</p>
                </div>
              </div>
           </div>

           <div className="bg-slate-950/50 rounded-3xl border border-white/5 overflow-hidden backdrop-blur-sm">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="border-b border-white/5 bg-slate-950/80">
                   <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Date / User</th>
                   <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Type / File</th>
                   <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Summary</th>
                   <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Records</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5 text-left">
                 {isLoadingHistory ? (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center">
                       <Loader2 className="animate-spin mx-auto text-slate-700" size={32} />
                     </td>
                   </tr>
                 ) : pastImports.length === 0 ? (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-bold text-xs">
                       No synchronization events recorded yet.
                     </td>
                   </tr>
                 ) : (
                   pastImports.map((log) => (
                     <tr key={log.id} className="group hover:bg-white/[0.02] transition-colors">
                       <td className="px-6 py-4">
                         <div className="flex flex-col">
                           <div className="text-xs font-black text-white flex items-center gap-2">
                             <Clock size={10} className="text-brand-secondary" />
                             {log.timestamp instanceof Timestamp ? log.timestamp.toDate().toLocaleString() : 'Recent'}
                           </div>
                           <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                             <UserIcon size={10} /> {log.username}
                           </div>
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex flex-col">
                           <div className="flex items-center gap-2">
                              {log.type === 'pdf' ? (
                                <span className="px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary text-[8px] font-black rounded uppercase border border-brand-primary/20">AI-PDF</span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black rounded uppercase border border-emerald-500/20">RAW-CSV</span>
                              )}
                           </div>
                           <div className="text-[10px] font-medium text-slate-400 truncate max-w-[150px] mt-1 italic">
                             {log.filename}
                           </div>
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex items-center justify-center gap-4">
                            <div className="text-center">
                               <p className="text-[8px] font-black text-slate-600 uppercase">New</p>
                               <p className="text-xs font-black text-brand-secondary">{log.newProfiles}</p>
                            </div>
                            <div className="text-center">
                               <p className="text-[8px] font-black text-slate-600 uppercase">SO</p>
                               <p className="text-xs font-black text-brand-primary">{log.visitsLogged}</p>
                            </div>
                         </div>
                       </td>
                       <td className="px-6 py-4 text-right">
                         <p className="text-lg font-black text-white tabular-nums leading-none italic">{log.totalRecords}</p>
                         <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">TTL Rows</p>
                       </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    </div>
  );
};
