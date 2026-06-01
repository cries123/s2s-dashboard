import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDocs, getDoc, setDoc, where, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Customer } from '../../../types';
import { 
  Search, RefreshCw, User, ShieldAlert, CheckCircle2, 
  ChevronDown, ChevronUp, Wrench, Clock, Info, Shield, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';

interface VehicleRecall {
  id: string;
  customerId: string;
  customerName: string;
  advisorName: string;
  vin: string;
  vinLast8: string;
  year: string;
  make: string;
  model: string;
  campaignNumber: string;
  component: string;
  summary: string;
  remedy: string;
  checkedAt: string;
  status: 'Remedy Available' | 'Remedy Not Available';
  matchType?: 'vin' | 'ymm';
}

interface GroupedVehicleRecalls {
  customerId: string;
  customerName: string;
  advisorName: string;
  vin: string;
  vinLast8: string;
  year: string;
  make: string;
  model: string;
  checkedAt: string;
  recalls: VehicleRecall[];
}

interface WorkerStatus {
  isRecallWorkerRunning: boolean;
  status: {
    lastRun: string | null;
    status: string;
    processedCount: number;
    totalToProcess: number;
    errors: string[];
  };
}

export function VehicleRecalls({ onViewProfile }: { onViewProfile?: (customer: Customer) => void }) {
  const [recalls, setRecalls] = useState<VehicleRecall[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileLoadingId, setProfileLoadingId] = useState<string | null>(null);

  const handleViewCustomerProfile = async (customerId: string) => {
    if (!onViewProfile) return;
    setProfileLoadingId(customerId);
    try {
      const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customerId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const customerData = { id: docSnap.id, ...docSnap.data() } as Customer;
        onViewProfile(customerData);
      } else {
        showToast("Customer profile not found in directory.", true);
      }
    } catch (err: any) {
      console.error("Error retrieving customer profile:", err);
      showToast("Failed to retrieve customer profile.", true);
    } finally {
      setProfileLoadingId(null);
    }
  };
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAdvisor, setSelectedAdvisor] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedMatchType, setSelectedMatchType] = useState('ALL');
  
  // Expandable row state (keyed by customerId_vin)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  
  // Worker Sync states (Using client-side execution to ensure correct Google Sign-In security context)
  const [syncStatus, setSyncStatus] = useState<WorkerStatus | null>(() => {
    const cached = localStorage.getItem('recall_sync_status');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Reset running state if page gets refreshed mid-flight so it does not get stuck visible
        if (parsed.isRecallWorkerRunning) {
          parsed.isRecallWorkerRunning = false;
          parsed.status.status = "idle";
        }
        return parsed;
      } catch (e) {
        return null;
      }
    }
    return {
      isRecallWorkerRunning: false,
      status: {
        lastRun: null,
        status: "idle",
        processedCount: 0,
        totalToProcess: 0,
        errors: []
      }
    };
  });
  const [syncLoading, setSyncLoading] = useState(false);
  const [notification, setNotification] = useState<{ text: string; isError: boolean } | null>(null);

  const showToast = (text: string, isError = false) => {
    setNotification({ text, isError });
    setTimeout(() => setNotification(null), 4000);
  };

  // 1. Direct real-time listener to vehicleRecalls Firestore collection
  useEffect(() => {
    const q = query(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'vehicleRecalls'));
    
    // Check if we can synchronize current state on boot
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as VehicleRecall));
      
      // Sort in memory to show most recent checking first
      list.sort((a, b) => new Date(b.checkedAt || 0).getTime() - new Date(a.checkedAt || 0).getTime());
      
      setRecalls(list);
      setLoading(false);
    }, (error) => {
      console.error("[VehicleRecalls] Firestore query failed:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Helper sleep function for Sequential Throttling
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Trigger manual client-side sequential scan using standard user-session permissions
  const triggerSync = async () => {
    if (syncStatus?.isRecallWorkerRunning) return;
    setSyncLoading(true);

    const initialStatus: WorkerStatus = {
      isRecallWorkerRunning: true,
      status: {
        lastRun: syncStatus?.status?.lastRun || null,
        status: "running",
        processedCount: 0,
        totalToProcess: 0,
        errors: []
      }
    };

    setSyncStatus(initialStatus);
    localStorage.setItem('recall_sync_status', JSON.stringify(initialStatus));

    try {
      showToast("Manual sequential recall crawl started.");
      
      // Query customer data using client-side Firestore connection (possesses perfect active user login credentials)
      const q = query(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'));
      const snap = await getDocs(q);
      const customersList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      initialStatus.status.totalToProcess = customersList.length;
      setSyncStatus({ ...initialStatus });
      localStorage.setItem('recall_sync_status', JSON.stringify(initialStatus));

      for (const customer of customersList) {
        try {
          let vin = (customer.vin || "").trim().toUpperCase();
          let year = (customer.year || "").trim();
          let make = (customer.make || "").trim();
          let model = (customer.model || "").trim();

          // Step 1: Decode raw 17-digit VIN if valid to align model profile
          if (vin && vin.length === 17) {
            const decodeRes = await fetch(`/api/nhtsa/decode/${vin}`);
            if (decodeRes.ok) {
              const decodeData = await decodeRes.json();
              const results = decodeData.Results || [];
              const getVar = (name: string) => results.find((r: any) => r.Variable === name)?.Value || "";
              
              const vYear = getVar("Model Year");
              const vMake = getVar("Make");
              const vModel = getVar("Model");

              if (vYear) year = vYear.trim();
              if (vMake) make = vMake.trim();
              if (vModel) model = vModel.trim();
            }
          }

          // Standardize default fallback
          if (!make) make = customer.make || "Hyundai";
          if (!model) model = customer.model || "";
          if (!year) year = customer.year || "";

          // Clear previous cached recall records for this customer to prevent duplicate/stale records
          const prevRecallsQuery = query(
            collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'vehicleRecalls'),
            where('customerId', '==', customer.id)
          );
          const prevSnap = await getDocs(prevRecallsQuery);
          for (const prevDoc of prevSnap.docs) {
            await deleteDoc(prevDoc.ref);
          }

          let campaigns: any[] = [];
          let isFetched = false;
          let matchType: 'vin' | 'ymm' = 'ymm';

          // Step 2: Fetch safety recall campaigns. 
          // If a highly precise 17-character VIN is present, we look up by VIN directly (ensures 100% vehicle specificity!)
          if (vin && vin.length === 17) {
            const vinRecallRes = await fetch(`/api/nhtsa/recallsByVin/${encodeURIComponent(vin)}`);
            if (vinRecallRes.ok) {
              const recallData = await vinRecallRes.json();
              campaigns = recallData.results || recallData.Results || [];
              isFetched = true;
              matchType = 'vin';
            }
          }

          // Fallback matching general safety bulletins ONLY if VIN lookup is unavailable AND the vehicle does NOT have a full 17-char VIN
          if (!isFetched && (!vin || vin.length !== 17) && year && model) {
            const recallRes = await fetch(`/api/nhtsa/recalls?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`);
            if (recallRes.ok) {
              const recallData = await recallRes.json();
              campaigns = recallData.results || recallData.Results || [];
              matchType = 'ymm';
            }
          }

          if (campaigns.length > 0) {
            for (const campaign of campaigns) {
              const campaignNum = campaign.NHTSACampaignNumber || "unknown";
              const recallId = `${customer.id}_${campaignNum.replace(/[^a-zA-Z0-9_\-]/g, '')}`;
              
              const remedyText = campaign.Remedy || "";
              const lowercaseRemedy = remedyText.toLowerCase();

              const isRemedyNotAvailable = 
                lowercaseRemedy.includes("not yet available") || 
                lowercaseRemedy.includes("not available") || 
                lowercaseRemedy.includes("remedy is not") ||
                lowercaseRemedy.includes("remedy not available") ||
                lowercaseRemedy.includes("no remedy is available") ||
                remedyText.trim() === "";
              
              const statusValue = isRemedyNotAvailable ? "Remedy Not Available" : "Remedy Available";

              // Write the recall directly from user's active session, satisfying security rules!
              await setDoc(doc(db, "artifacts", "hyundai-sales-to-service", "public", "data", "vehicleRecalls", recallId), {
                id: recallId,
                customerId: customer.id,
                customerName: `${customer.firstName} ${customer.lastName}`,
                advisorName: customer.addedByUsername || "Legacy Staff",
                vin: customer.vin || customer.vinLast8 || "Unknown",
                vinLast8: customer.vinLast8 || "Unknown",
                year: year,
                make: make,
                model: model,
                campaignNumber: campaignNum,
                component: campaign.Component || "Unknown Component",
                summary: campaign.Summary || "No detailed defect description provided by manufacturer.",
                remedy: remedyText || "Remedy details are currently pending or unavailable.",
                checkedAt: new Date().toISOString(),
                status: statusValue,
                matchType: matchType
              });
            }
          }
        } catch (custErr: any) {
          console.error(`Error checking customer ${customer.id}:`, custErr);
          initialStatus.status.errors.push(`${customer.firstName} ${customer.lastName}: ${custErr.message || String(custErr)}`);
        }

        initialStatus.status.processedCount++;
        setSyncStatus({ ...initialStatus });
        localStorage.setItem('recall_sync_status', JSON.stringify(initialStatus));

        // Wait to throttle API rate consumption and prevent IP bans
        await sleep(1500);
      }

      initialStatus.isRecallWorkerRunning = false;
      initialStatus.status.status = "completed";
      initialStatus.status.lastRun = new Date().toISOString();
      setSyncStatus({ ...initialStatus });
      localStorage.setItem('recall_sync_status', JSON.stringify(initialStatus));
      showToast("Manual sequential recall scan finalized successfully.");
    } catch (err: any) {
      console.error("Crawl process error:", err);
      initialStatus.isRecallWorkerRunning = false;
      initialStatus.status.status = "error";
      initialStatus.status.errors.push(`Sync failed: ${err.message || String(err)}`);
      setSyncStatus({ ...initialStatus });
      localStorage.setItem('recall_sync_status', JSON.stringify(initialStatus));
      showToast(`Sync failed: ${err.message}`, true);
    } finally {
      setSyncLoading(false);
    }
  };

  // Helper selectors
  const toggleRow = (vehicleKey: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [vehicleKey]: !prev[vehicleKey]
    }));
  };

  // Extract list of unique advisors for filter list
  const advisors = ['ALL', ...Array.from(new Set(recalls.map(r => r.advisorName).filter(Boolean)))];

  // Apply search/filters over individuals first
  const filteredRecalls = recalls.filter(item => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      item.customerName.toLowerCase().includes(term) ||
      item.vin.toLowerCase().includes(term) ||
      item.campaignNumber.toLowerCase().includes(term) ||
      item.component.toLowerCase().includes(term) ||
      `${item.year} ${item.make} ${item.model}`.toLowerCase().includes(term);
    
    const matchesAdvisor = selectedAdvisor === 'ALL' || item.advisorName === selectedAdvisor;
    const matchesStatus = selectedStatus === 'ALL' || item.status === selectedStatus;
    
    const matchesMatchType = 
      selectedMatchType === 'ALL' || 
      (selectedMatchType === 'vin' && item.matchType === 'vin') || 
      (selectedMatchType === 'ymm' && (!item.matchType || item.matchType === 'ymm'));

    return matchesSearch && matchesAdvisor && matchesStatus && matchesMatchType;
  });

  // Compile individual recalls into customer cards / same car groups
  const groupedVehicles: GroupedVehicleRecalls[] = [];
  
  filteredRecalls.forEach(recall => {
    // Group keys of same car: customerId_vin
    const vehicleKey = `${recall.customerId}_${recall.vin}`;
    let group = groupedVehicles.find(g => `${g.customerId}_${g.vin}` === vehicleKey);
    if (!group) {
      group = {
        customerId: recall.customerId,
        customerName: recall.customerName,
        advisorName: recall.advisorName,
        vin: recall.vin,
        vinLast8: recall.vinLast8,
        year: recall.year,
        make: recall.make,
        model: recall.model,
        checkedAt: recall.checkedAt,
        recalls: []
      };
      groupedVehicles.push(group);
    }
    group.recalls.push(recall);
    // Keep the latest timestamp checked
    if (new Date(recall.checkedAt).getTime() > new Date(group.checkedAt).getTime()) {
      group.checkedAt = recall.checkedAt;
    }
  });

  const remedyNotAvailableCount = recalls.filter(r => r.status === 'Remedy Not Available').length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-semibold text-xs border uppercase tracking-wider",
              notification.isError 
                ? "bg-rose-950/90 text-rose-200 border-rose-500/20" 
                : "bg-emerald-950/90 text-emerald-200 border-emerald-500/20"
            )}
          >
            {notification.isError ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}
            <span>{notification.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-950/40 rounded-2xl border border-white/5 shadow-xl backdrop-blur-md">
        <div>
          <span className="text-[8px] font-black tracking-widest text-brand-primary uppercase bg-brand-primary/10 px-2 py-0.5 rounded-full">Automotive Safety</span>
          <h1 className="text-xl font-black text-white tracking-wide uppercase mt-1">NHTSA Repair Campaign Center</h1>
          <p className="text-slate-400 text-xs mt-1">Sequential caching of pending safety alerts to circumvent API rate constraints.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {remedyNotAvailableCount > 0 && (
            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">
              <ShieldAlert size={14} />
              <span>{remedyNotAvailableCount} Extreme Hazard Threats</span>
            </div>
          )}

          <button
            onClick={triggerSync}
            disabled={syncLoading || syncStatus?.isRecallWorkerRunning}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50",
              syncStatus?.isRecallWorkerRunning
                ? "bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold"
                : "bg-brand-primary/20 border-brand-primary/10 hover:border-brand-primary hover:bg-brand-primary/30 text-brand-primary shadow-brand-primary/5 active:scale-95 animate-pulse"
            )}
          >
            <RefreshCw className={cn("w-3 h-3", (syncLoading || syncStatus?.isRecallWorkerRunning) && "animate-spin")} />
            <span>
              {syncStatus?.isRecallWorkerRunning 
                ? "Syncing Directory..." 
                : "Start Off-Peak Scan"}
            </span>
          </button>
        </div>
      </div>

      {/* Synchronizer Status Banner */}
      {syncStatus && (
        <div className="p-4 bg-slate-900 border border-white/5 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-2 h-2 rounded-full",
              syncStatus.isRecallWorkerRunning ? "bg-amber-500 animate-ping" : "bg-emerald-500"
            )} />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-300">
                <span>Crawler Status:</span>
                <span className={cn(
                  syncStatus.isRecallWorkerRunning ? "text-amber-500" : "text-emerald-400"
                )}>
                  {syncStatus.isRecallWorkerRunning ? "Scanning..." : "Sync Idle"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                {syncStatus.isRecallWorkerRunning 
                  ? `Processed ${syncStatus.status.processedCount} of ${syncStatus.status.totalToProcess} directory vehicles sequentially.`
                  : syncStatus.status.lastRun 
                    ? `Last completed scan executed at: ${new Date(syncStatus.status.lastRun).toLocaleString()}`
                    : "No full sequential scans executed yet."}
              </p>
            </div>
          </div>

          {syncStatus.isRecallWorkerRunning && syncStatus.status.totalToProcess > 0 && (
            <div className="w-full md:w-48 bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-amber-500 h-full transition-all duration-300"
                style={{ width: `${(syncStatus.status.processedCount / syncStatus.status.totalToProcess) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Filter Action Controls */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch shadow-md">
        <div className="bg-slate-950/20 border border-white/5 p-1 rounded-xl flex-1 flex items-center gap-2 px-3 focus-within:border-brand-primary/40 transition-all">
          <Search className="text-slate-500" size={15} />
          <input
            type="text"
            placeholder="Search customer name, vehicle model, campaign, or full/partial VIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none text-slate-100 placeholder:text-slate-500 text-[11px] font-bold tracking-wide w-full focus:outline-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {/* Advisor SELECT */}
          <div className="bg-slate-950/20 border border-white/5 p-1.5 rounded-xl flex items-center gap-2 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <User size={13} className="text-slate-500" />
            <select
              value={selectedAdvisor}
              onChange={(e) => setSelectedAdvisor(e.target.value)}
              className="bg-transparent border-none text-slate-200 text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer pr-4"
            >
              <option value="ALL" className="bg-slate-900 text-slate-300">All Advisors</option>
              {advisors.filter(a => a !== 'ALL').map(adv => (
                <option key={adv} value={adv} className="bg-slate-900 text-slate-300">{adv}</option>
              ))}
            </select>
          </div>

          {/* Status SELECT */}
          <div className="bg-slate-950/20 border border-white/5 p-1.5 rounded-xl flex items-center gap-2 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <Filter size={13} className="text-slate-500" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent border-none text-slate-200 text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer pr-4"
            >
              <option value="ALL" className="bg-slate-900 text-slate-300">All Threats</option>
              <option value="Remedy Available" className="bg-slate-900 text-slate-300">Remedy Ready</option>
              <option value="Remedy Not Available" className="bg-slate-900 text-slate-300">Remedy Suspended</option>
            </select>
          </div>

          {/* Match Type SELECT */}
          <div className="bg-slate-950/20 border border-white/5 p-1.5 rounded-xl flex items-center gap-2 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <Shield size={13} className="text-slate-500" />
            <select
              value={selectedMatchType}
              onChange={(e) => setSelectedMatchType(e.target.value)}
              className="bg-transparent border-none text-slate-200 text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer pr-4"
            >
              <option value="ALL" className="bg-slate-900 text-slate-300">All Campaigns</option>
              <option value="vin" className="bg-slate-900 text-slate-300">Verified VIN Match</option>
              <option value="ymm" className="bg-slate-900 text-slate-300">YMM Line Bulletins</option>
            </select>
          </div>
        </div>
      </div>

      {/* Recalls Grid */}
      {loading ? (
        <div className="h-44 bg-slate-950/10 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="animate-spin text-brand-primary" size={24} />
          <span className="text-[10px] uppercase font-black tracking-widest leading-none">Connecting database cache...</span>
        </div>
      ) : groupedVehicles.length === 0 ? (
        <div className="h-44 bg-slate-950/10 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500">
          <Shield className="text-slate-600 mb-1" size={28} />
          <span className="text-[10px] uppercase font-black tracking-widest leading-none">No active recalls matched</span>
          <span className="text-[9px] text-slate-600 font-medium">Verify your filter overrides or execute an off-peak scan.</span>
        </div>
      ) : (
        <div className="bg-slate-950/20 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-900/60 border-b border-white/5 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4 font-black">Customer / Vehicle</th>
                  <th className="py-3.5 px-4 font-black">Advisor</th>
                  <th className="py-3.5 px-4 font-black">Outstanding Campaigns</th>
                  <th className="py-3.5 px-4 font-black">Targeted Components</th>
                  <th className="py-3.5 px-4 font-black text-center">Threat Class</th>
                  <th className="py-3.5 px-4 font-black text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {groupedVehicles.map((group) => {
                  const vehicleKey = `${group.customerId}_${group.vin}`;
                  const isExpanded = !!expandedRows[vehicleKey];
                  
                  // Component rollup
                  const uniqueComponents = Array.from(new Set(group.recalls.map(r => r.component)));
                  const componentsText = uniqueComponents.join(', ');

                  // Status rollup: if any has Remedy Not Available, mark entire vehicle as suspended
                  const hasRemedyNotAvailable = group.recalls.some(r => r.status === 'Remedy Not Available');
                  const overallStatus = hasRemedyNotAvailable ? 'Remedy Suspended' : 'Remedy Available';

                  return (
                    <React.Fragment key={vehicleKey}>
                      <tr className={cn(
                        "hover:bg-white/5 transition-all",
                        isExpanded ? "bg-slate-900/40" : ""
                      )}>
                        {/* Customer & Vehicle */}
                        <td className="py-4 px-4">
                          <div 
                            onClick={() => handleViewCustomerProfile(group.customerId)}
                            className={cn(
                              "font-extrabold text-[11px] leading-tight uppercase transition-colors flex items-center gap-1.5",
                              onViewProfile 
                                ? "text-brand-primary hover:text-brand-primary/80 hover:underline cursor-pointer" 
                                : "text-white"
                            )}
                            title={onViewProfile ? "Click to view full customer profile" : undefined}
                          >
                            {profileLoadingId === group.customerId ? (
                              <RefreshCw size={11} className="animate-spin text-brand-primary" />
                            ) : (
                              <User size={11} className="text-slate-400" />
                            )}
                            {group.customerName}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-slate-400 font-black tracking-wider uppercase text-[9px]">
                              {group.year} {group.make} {group.model}
                            </span>
                            <span className="text-[8px] font-mono text-slate-600 bg-slate-900 px-1 border border-white/5 rounded">
                              VIN: {group.vin}
                            </span>
                            {group.recalls.some(r => r.matchType === 'vin') ? (
                              <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 border border-emerald-500/20 rounded inline-flex items-center gap-1 uppercase tracking-wider" title="Matched directly via 17-character NHTSA VIN recall status check.">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                <span>Verified VIN Match</span>
                              </span>
                            ) : (
                              <span className="text-[8px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 border border-amber-500/20 rounded inline-flex items-center gap-1 uppercase tracking-wider" title="General safety bulletin matched via Year/Make/Model line fallback. Safe to check on official portal using complete VIN.">
                                <Info className="w-2.5 h-2.5 text-amber-500" />
                                <span>Unverified Bulletin</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Advisor */}
                        <td className="py-4 px-4 font-extrabold text-slate-300 uppercase tracking-widest text-[9.5px]">
                          {group.advisorName}
                        </td>

                        {/* Campaign Badges count */}
                        <td className="py-4 px-4">
                          <span className={cn(
                            "font-mono font-black border rounded-lg text-[9px] px-2.5 py-1 uppercase tracking-wider",
                            hasRemedyNotAvailable 
                              ? "bg-rose-950/20 border-rose-500/20 text-rose-400" 
                              : "bg-slate-900 border-white/10 text-slate-200"
                          )}>
                            {group.recalls.length} {group.recalls.length === 1 ? 'Campaign' : 'Campaigns'}
                          </span>
                        </td>

                        {/* Components */}
                        <td className="py-4 px-4 font-bold text-slate-200 uppercase max-w-[150px] truncate" title={componentsText}>
                          {componentsText}
                        </td>

                        {/* Unified Threat Indicator */}
                        <td className="py-4 px-4 text-center">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-wider leading-none",
                            overallStatus === 'Remedy Available'
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          )}>
                            {overallStatus === 'Remedy Available' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Remedy Ready</span>
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="w-3 h-3 text-rose-400 animate-pulse" />
                                <span>Remedy Suspended</span>
                              </>
                            )}
                          </span>
                        </td>

                        {/* Action details */}
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => toggleRow(vehicleKey)}
                            className="bg-white/5 border border-white/5 hover:border-slate-500 hover:bg-white/10 text-slate-300 font-bold px-2 py-1.5 rounded-lg active:scale-95 transition-all text-[9px] uppercase tracking-widest cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              {isExpanded ? (
                                <>
                                  <span>Close</span>
                                  <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  <span>Inspect</span>
                                  <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Info Detail Box (All Campaigns of Grouped Vehicle) */}
                      {isExpanded && (
                        <tr className="bg-slate-950/40 border-b border-white/5">
                          <td colSpan={6} className="p-0">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="p-6 space-y-5">
                                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-2 border-b border-white/5 pb-2">
                                  <Shield size={14} className="text-brand-primary" />
                                  <span>Detailed Repair Campaigns Affecting This Vehicle ({group.recalls.length})</span>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                  {group.recalls.map((recall, index) => (
                                    <div key={recall.id || index} className="p-5 rounded-xl bg-slate-950/80 border border-white/5 space-y-4">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-mono font-black text-white px-2.5 py-1 bg-slate-900 border border-white/10 rounded-lg text-[10px] uppercase tracking-wider">
                                            {recall.campaignNumber}
                                          </span>
                                          {recall.matchType === 'vin' ? (
                                            <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[8px] uppercase tracking-wider inline-flex items-center gap-1">
                                              <CheckCircle2 size={10} />
                                              <span>Verified Specific VIN Match</span>
                                            </span>
                                          ) : (
                                            <span className="font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-[8px] uppercase tracking-wider inline-flex items-center gap-1" title="General safety alert for Year/Make/Model line. Vehicle may not be individually affected.">
                                              <Info size={10} />
                                              <span>YMM Bulletin (Unverified Match)</span>
                                            </span>
                                          )}
                                          <span className="text-slate-500 font-extrabold mx-1">|</span>
                                          <span className="font-bold text-slate-200 uppercase text-[10px]">
                                            {recall.component}
                                          </span>
                                        </div>
                                        <span className={cn(
                                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider leading-none self-start sm:self-auto",
                                          recall.status === 'Remedy Available'
                                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                        )}>
                                          {recall.status === 'Remedy Available' ? (
                                            <>
                                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                              <span>Remedy Available</span>
                                            </>
                                          ) : (
                                            <>
                                              <ShieldAlert className="w-3 h-3 text-rose-400 animate-pulse" />
                                              <span>Remedy Not Available</span>
                                            </>
                                          )}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                                        {/* Defect Summary */}
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2 text-rose-400 text-[10px] uppercase font-bold tracking-wide">
                                            <ShieldAlert size={12} />
                                            <span>Official Defect Statement</span>
                                          </div>
                                          <p className="text-slate-300 font-semibold leading-relaxed text-[11px] bg-slate-900/40 p-3 rounded-lg border border-white/5">
                                            {recall.summary}
                                          </p>
                                        </div>

                                        {/* Remedy Strategy */}
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2 text-emerald-400 text-[10px] uppercase font-bold tracking-wide">
                                            <Wrench size={12} />
                                            <span>Service Remedy & Resolution Strategy</span>
                                          </div>
                                          <p className="text-slate-300 font-semibold leading-relaxed text-[11px] bg-slate-900/40 p-3 rounded-lg border border-white/5">
                                            {recall.remedy}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                
                                <div className="text-right text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                  NHTSA Last Verified Check: {new Date(group.checkedAt).toLocaleString()}
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
