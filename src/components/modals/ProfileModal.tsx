import React, { useState, useEffect } from 'react';
import { 
  X, Save, Edit2, Trash2, User as UserIcon, Phone, Mail, MapPin, Car, Calendar, 
  Gauge, History, Database, Wrench, Droplet, Activity, Copy, Check, ChevronRight, 
  AlertTriangle, ShieldCheck, MessageSquare, Info, Shield, HelpCircle, ArrowRight,
  Sparkles, CheckCircle2, Languages, Clock, Loader2
} from 'lucide-react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Customer, User } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { getAverageServiceIntervalMonths, getLastServiceDate, getNextServiceMilestone } from '../../lib/alerts';

interface ProfileModalProps {
  customer: Customer;
  currentUser?: User;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}

type TabType = 'overview' | 'demographics' | 'history' | 'campaigns';

export default function ProfileModal({ customer, currentUser, onClose, onDelete }: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ ...customer });
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customerNotes, setCustomerNotes] = useState(customer.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  useEffect(() => {
    setFormData({ ...customer });
    setCustomerNotes(customer.notes || '');
  }, [customer]);

  const handleSaveNotesInline = async () => {
    setIsSavingNotes(true);
    try {
      const customerRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id);
      await updateDoc(customerRef, {
        notes: customerNotes
      });
      customer.notes = customerNotes;
      setFormData(prev => ({ ...prev, notes: customerNotes }));
    } catch (err) {
      console.error(err);
      alert("Failed to save customer notes. Please try again.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  useEffect(() => {
    // Lock background body and document Element scroll behaviors when profile modal is open
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    return () => {
      // Revert back when modal gets closed
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  const [isSuspendingAlerts, setIsSuspendingAlerts] = useState(false);
  const [suspendReason, setSuspendReason] = useState('Customer Opted-Out');
  const [suspendNotes, setSuspendNotes] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const handleSuspendAlerts = async () => {
    setIsProcessingAction(true);
    try {
      const stopInfo = {
        reason: suspendReason,
        notes: suspendNotes,
        stoppedBy: currentUser?.username || 'Staff Member',
        stoppedAt: Timestamp.now()
      };

      const updatedData = {
        ...formData,
        enableServiceAlert: false,
        stopAlertInfo: stopInfo
      };

      const customerRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id);
      await updateDoc(customerRef, {
        enableServiceAlert: false,
        stopAlertInfo: stopInfo
      });

      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id, 'contactLog'), {
        timestamp: serverTimestamp(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'Staff Member',
        outcome: 'Campaign Suspended',
        notes: `Alerts stopped. Reason: ${suspendReason}. Notes: ${suspendNotes}`,
        appointmentSet: false
      });

      setFormData(updatedData);
      Object.assign(customer, updatedData);

      setIsSuspendingAlerts(false);
      setSuspendNotes('');
    } catch (err) {
      console.error(err);
      alert("Failed to suspend alerts. Please try again.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReinstateAlerts = async () => {
    if (!confirm("Are you sure you want to reinstate automated service reminders for this customer?")) return;
    setIsProcessingAction(true);
    try {
      const customerRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id);
      
      const { deleteField } = await import('firebase/firestore');
      await updateDoc(customerRef, {
        enableServiceAlert: true,
        stopAlertInfo: deleteField()
      });

      const updatedData = { ...formData, enableServiceAlert: true };
      delete updatedData.stopAlertInfo;

      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id, 'contactLog'), {
        timestamp: serverTimestamp(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'Staff Member',
        outcome: 'Campaign Reinstated',
        notes: 'Automated service cycle alerts reinstated by choice.',
        appointmentSet: false
      });

      setFormData(updatedData);
      delete customer.stopAlertInfo;
      customer.enableServiceAlert = true;
    } catch (err) {
      console.error(err);
      alert("Failed to reinstate alerts. Please try again.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCopyVin = () => {
    if (formData.vinLast8) {
      navigator.clipboard.writeText(formData.vinLast8);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const calculateOilChangeInterval = () => {
    const visits = customer.recentVisits || [];
    if (visits.length === 0) return null;

    const isOilChangeText = (text: string) => {
      if (!text) return false;
      const lower = text.toLowerCase();
      return (
        lower.includes("oil change") ||
        lower.includes("oil & filter") ||
        lower.includes("oil/filter") ||
        lower.includes(" lof") ||
        lower.startsWith("lof ") ||
        lower === "lof" ||
        lower.includes("lube, oil") ||
        lower.includes("lube oil") ||
        lower.includes("synthetic oil") ||
        lower.includes("engine oil") ||
        lower.includes("0w-20") ||
        lower.includes("5w-20") ||
        lower.includes("5w-30")
      );
    };

    const oilVisits = [...visits]
      .filter(v => isOilChangeText(v.requests))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (oilVisits.length === 0) {
      return {
        hasData: false,
        message: "No recorded oil changes found in service history."
      };
    }

    if (oilVisits.length === 1) {
      return {
        hasData: false,
        count: 1,
        lastDate: oilVisits[0].date,
        lastMileage: oilVisits[0].mileage,
        message: "Only 1 oil change recorded. (Need at least 2 visits to compute average interval)"
      };
    }

    let totalDays = 0;
    let totalMiles = 0;
    let calculationCount = 0;

    for (let i = 1; i < oilVisits.length; i++) {
      const prev = oilVisits[i - 1];
      const curr = oilVisits[i];

      const prevTime = new Date(prev.date).getTime();
      const currTime = new Date(curr.date).getTime();

      if (!isNaN(prevTime) && !isNaN(currTime)) {
        const daysDiff = (currTime - prevTime) / (1000 * 60 * 60 * 24);
        if (daysDiff > 0) {
          totalDays += daysDiff;
          totalMiles += Math.abs(curr.mileage - prev.mileage);
          calculationCount++;
        }
      }
    }

    if (calculationCount === 0) {
      return {
        hasData: false,
        count: oilVisits.length,
        lastDate: oilVisits[oilVisits.length - 1].date,
        lastMileage: oilVisits[oilVisits.length - 1].mileage,
        message: "Duplicate or invalid dates in oil change records."
      };
    }

    const avgDays = totalDays / calculationCount;
    const avgMiles = Math.round(totalMiles / calculationCount);
    const avgMonths = Number((avgDays / 30.4375).toFixed(1));

    const lastOilVisit = oilVisits[oilVisits.length - 1];
    const lastDateObj = new Date(lastOilVisit.date);
    
    let nextDateStr = "N/A";
    if (!isNaN(lastDateObj.getTime())) {
      const nextDateObj = new Date(lastDateObj.getTime() + avgDays * 24 * 60 * 60 * 1000);
      nextDateStr = nextDateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }

    const nextMileage = lastOilVisit.mileage + avgMiles;

    return {
      hasData: true,
      count: oilVisits.length,
      avgDays: Math.round(avgDays),
      avgMonths,
      avgMiles,
      lastDate: lastOilVisit.date,
      lastMileage: lastOilVisit.mileage,
      nextDate: nextDateStr,
      nextMileage
    };
  };

  const oilAnalysis = calculateOilChangeInterval();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { id, ...updates } = formData;
      await updateDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', id), updates as any);
      Object.assign(customer, updates);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert("Failed to update profile changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const getAvatarGradient = (first: string, last: string) => {
    const sum = (first || '').charCodeAt(0) + (last || '').charCodeAt(0);
    const gradients = [
      'from-indigo-600 to-violet-700 shadow-indigo-500/20',
      'from-blue-600 to-cyan-600 shadow-blue-500/20',
      'from-violet-600 to-fuchsia-700 shadow-violet-500/20',
      'from-emerald-600 to-teal-600 shadow-emerald-500/20',
      'from-pink-600 to-rose-700 shadow-pink-500/20'
    ];
    return gradients[isNaN(sum) ? 0 : sum % gradients.length];
  };

  const initials = `${(customer.firstName || '').charAt(0)}${(customer.lastName || '').charAt(0)}`.toUpperCase() || 'CU';

  return (
    <div className="modal-overlay sm:p-4 p-0 !items-start sm:!items-center overflow-y-auto scroll-smooth">
      <div className="modal-content !max-w-6xl w-full h-auto min-h-[100dvh] sm:min-h-0 sm:h-[90vh] rounded-none sm:rounded-[24px] !bg-[#0b0f1a] border border-white/5 shadow-2xl relative flex flex-col overflow-visible sm:overflow-hidden animate-zoom-in">
        
        {/* Banner with gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-[120px] bg-gradient-to-r from-brand-primary/10 via-brand-secondary/5 to-transparent border-b border-white/5 opacity-50 z-0 pointer-events-none" />

        {/* Modal Header Dossier Card */}
        <div className="p-4 sm:p-6 md:p-8 border-b border-white/5 bg-slate-950/40 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 shrink-0">
          <div className="flex items-center gap-3 sm:gap-5">
            {/* High-end avatar */}
            <div className={cn(
              "w-14 h-14 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-gradient-to-br flex items-center justify-center text-white font-sans text-lg sm:text-2xl font-black shadow-lg shrink-0",
              getAvatarGradient(customer.firstName, customer.lastName)
            )}>
              {initials}
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                <h3 className="text-lg sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                  {customer.firstName} {customer.lastName}
                </h3>
                <span className={cn(
                  "badge text-[8px] sm:text-[9px] font-black tracking-widest uppercase py-0.5 sm:py-1 px-1.5 sm:px-2.5 rounded-md sm:rounded-lg",
                  customer.serviceAlertTriggered ? "badge-success" : "badge-info"
                )}>
                  {customer.serviceAlertTriggered ? "Alert Sourced" : "S2S Optimized"}
                </span>
              </div>
              
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] sm:text-xs font-medium text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar size={12} className="text-brand-primary" />
                  Acquired {new Date(customer.createdAt.toMillis()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="hidden sm:inline text-slate-700">•</span>
                <span className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px] bg-slate-900 border border-white/5 px-1.5 sm:px-2 py-0.5 rounded text-brand-secondary" title={customer.vin ? `Full VIN: ${customer.vin}` : `VIN Last 8: ${customer.vinLast8}`}>
                  VIN: {customer.vin || customer.vinLast8}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto self-stretch md:self-auto justify-end mt-2 md:mt-0">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="btn-secondary py-2 px-3.5 sm:py-2.5 sm:px-5 text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1.5 sm:gap-2"
              >
                <Edit2 size={13} /> Edit Profile
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-1 md:flex-none">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="btn-secondary py-2 px-3.5 sm:py-2.5 sm:px-5 text-[10px] sm:text-xs font-black uppercase tracking-widest flex-1 md:flex-none"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="btn-primary py-2 px-3.5 sm:py-2.5 sm:px-5 text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1.5 sm:gap-2 flex-1 md:flex-none"
                >
                  {isSaving ? "Saving..." : <><Save size={13} /> Save Profile</>}
                </button>
              </div>
            )}
            
            <button 
              onClick={() => onDelete(customer.id, `${customer.firstName} ${customer.lastName}`)}
              className="p-2 sm:p-3 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg sm:rounded-xl transition-all"
              title="Delete Customer Profile"
            >
              <Trash2 size={16} />
            </button>
            
            <button 
              onClick={onClose} 
              className="p-2 sm:p-3 text-slate-400 hover:text-white hover:bg-slate-900 border border-white/5 rounded-lg sm:rounded-xl transition-all ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quick Premium Bento Matrix */}
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-slate-950/80 shrink-0 border-b border-white/5 p-3 sm:p-4 md:px-8 gap-2 sm:gap-3">
          <div className="p-2.5 sm:p-3.5 bg-slate-900/30 border border-white/5 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2.5 bg-brand-primary/10 rounded-lg sm:rounded-xl text-brand-secondary shrink-0">
              <Car size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">Asset</p>
              <p className="text-[11px] sm:text-xs font-black text-white mt-0.5 truncate max-w-[100px] sm:max-w-[150px]">{customer.year || 'N/A'} {customer.make} {customer.model}</p>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 bg-slate-900/30 border border-white/5 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2.5 bg-cyan-500/10 rounded-lg sm:rounded-xl text-cyan-400 shrink-0">
              <Gauge size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest font-sans truncate">Odometer</p>
              <p className="text-[11px] sm:text-xs font-black text-white mt-0.5 truncate">{customer.mileage ? `${parseInt(customer.mileage).toLocaleString()} mi` : 'Not Logged'}</p>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 bg-slate-900/30 border border-white/5 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2.5 bg-emerald-500/10 rounded-lg sm:rounded-xl text-emerald-400 shrink-0">
              <Calendar size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">Ownership</p>
              <p className="text-[11px] sm:text-xs font-black text-white mt-0.5 truncate">{customer.soldDate ? new Date(customer.soldDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</p>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 bg-slate-900/30 border border-white/5 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2.5 bg-amber-500/10 rounded-lg sm:rounded-xl text-amber-400 shrink-0">
              <Activity size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">Predictive</p>
              <p className="text-[11px] sm:text-xs font-black text-white mt-0.5 truncate">
                {oilAnalysis && oilAnalysis.hasData ? `${oilAnalysis.avgMonths} mo` : 'Needs Service'}
              </p>
            </div>
          </div>
        </div>

        {/* High-fidelity responsive navigation tabs */}
        <div className="bg-slate-950/20 shrink-0 border-b border-white/5 px-4 sm:px-6 md:px-8 flex items-center justify-between py-2 sm:py-0">
          {/* Mobile Tab Select Dropdown */}
          <div className="block sm:hidden w-full relative">
            <label htmlFor="mobile-tab-select" className="sr-only">Select Profile Tab</label>
            <select
              id="mobile-tab-select"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as TabType)}
              className="w-full bg-[#0d1324] border border-white/10 text-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider focus:outline-none focus:border-brand-primary/50 appearance-none cursor-pointer"
            >
              <option value="overview">General</option>
              <option value="demographics">Information</option>
              <option value="history">Service History ({customer.recentVisits?.length || 0})</option>
              <option value="campaigns">S2S Care Campaigns</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
              <span className="text-[10px]">▼</span>
            </div>
          </div>

          {/* Desktop Tabs Layout */}
          <div className="hidden sm:flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-2 sm:py-3 w-full">
            {[
              { id: 'overview', label: 'General', icon: Sparkles },
              { id: 'demographics', label: 'Information', icon: UserIcon },
              { id: 'history', label: `Service History (${customer.recentVisits?.length || 0})`, icon: Database },
              { id: 'campaigns', label: 'S2S Care Campaigns', icon: ShieldCheck }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-200 shrink-0 border",
                    activeTab === tab.id 
                      ? "bg-brand-primary text-white border-brand-primary/20 shadow-md shadow-brand-primary/15" 
                      : "bg-transparent text-slate-400 border-transparent hover:text-white hover:bg-slate-900"
                  )}
                >
                  <Icon size={13} className={activeTab === tab.id ? "text-white" : "text-slate-500"} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Panel Shell */}
        <div className="flex-1 overflow-y-visible sm:overflow-y-auto p-4 sm:p-6 md:p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (isEditing ? '-edit' : '-view')}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-auto min-h-full w-full"
            >
              
              {/* TABS 1: SNAPSHOT OVERVIEW */}
              {activeTab === 'overview' && !isEditing && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                  {/* Left bento segment: Vehicle Details */}
                  <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-5 text-white pointer-events-none group-hover:scale-110 duration-500 ease">
                        <Car size={96} />
                      </div>
                      
                      <p className="text-[10px] font-black text-brand-secondary uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Car size={13} /> Active Fleet Configuration
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-2">
                        <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Model Specification</p>
                          <p className="text-base sm:text-lg font-black text-white mt-1">
                            {formData.year || 'Not Specified'} {formData.make} {formData.model}
                          </p>
                        </div>

                        <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl col-span-1 sm:col-span-2 relative">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Chassis VIN Profile</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                            <div className="bg-slate-900/55 p-2.5 rounded-xl border border-white/5">
                              <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Full VIN (17 Characters)</p>
                              <div className="flex items-center justify-between mt-1 gap-2">
                                <span className="font-mono text-xs sm:text-sm font-black text-brand-secondary overflow-hidden text-ellipsis whitespace-nowrap uppercase">
                                  {formData.vin || 'Not Set'}
                                </span>
                                {formData.vin && (
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(formData.vin || '');
                                      setIsCopied(true);
                                      setTimeout(() => setIsCopied(false), 2000);
                                    }}
                                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors"
                                    title="Copy Full VIN"
                                  >
                                    {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="bg-slate-900/55 p-2.5 rounded-xl border border-white/5">
                              <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">VIN Last 8</p>
                              <div className="flex items-center justify-between mt-1 gap-2">
                                <span className="font-mono text-xs sm:text-sm font-black text-brand-secondary overflow-hidden text-ellipsis whitespace-nowrap uppercase">
                                  {formData.vinLast8}
                                </span>
                                <button 
                                  onClick={handleCopyVin}
                                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors"
                                  title="Copy VIN Last 8"
                                >
                                  {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Verified Odometer</p>
                          <p className="text-base sm:text-lg font-black text-white mt-1">
                            {formData.mileage ? `${parseInt(formData.mileage).toLocaleString()} miles` : 'N/A'}
                          </p>
                        </div>

                        <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Preferred Language</p>
                          <p className="text-base sm:text-lg font-black text-white mt-1 flex items-center gap-2">
                            <Languages size={15} className="text-brand-secondary" />
                            {formData.language || 'English'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Oil Analysis Bento Panel */}
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6">
                      <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Droplet size={13} className="text-indigo-400 animate-pulse" /> Precision Service Intelligence
                      </p>

                      {oilAnalysis ? (
                        oilAnalysis.hasData ? (
                          <div className="space-y-4 sm:space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl flex items-center justify-between">
                                <div>
                                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Average Service Calendar</p>
                                  <p className="text-sm sm:text-base font-black text-white">
                                    {oilAnalysis.avgMonths} Months
                                  </p>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded-md border border-white/5 shrink-0">
                                  {oilAnalysis.avgDays} Days
                                </span>
                              </div>

                              <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl flex items-center justify-between">
                                <div>
                                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Average Service Interval</p>
                                  <p className="text-sm sm:text-base font-black text-white">
                                    {oilAnalysis.avgMiles?.toLocaleString()} mi
                                  </p>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded-md border border-white/5 shrink-0">
                                  Avg Range
                                </span>
                              </div>
                            </div>

                            <div className="p-4 sm:p-5 bg-gradient-to-br from-indigo-950/40 to-slate-900/40 border border-brand-primary/20 rounded-xl sm:rounded-2xl relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-4 opacity-10 text-brand-primary">
                                <Sparkles size={48} />
                              </div>
                              
                              <p className="text-[9px] font-black text-brand-secondary uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
                                <Activity size={12} /> S2S Predictive Next Oil Change
                              </p>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <div className="space-y-1">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Estimated Due Date</span>
                                  <span className="font-black text-base sm:text-lg text-white">{oilAnalysis.nextDate}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Estimated Due Mileage</span>
                                  <span className="font-black text-base sm:text-lg text-white">{oilAnalysis.nextMileage?.toLocaleString()} mi</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-6 bg-slate-950/20 border border-dashed border-white/5 rounded-2xl text-center space-y-2">
                            <Info size={24} className="text-slate-500 mx-auto" />
                            <p className="text-sm font-black text-slate-300">Statistical Engine Pending</p>
                            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                              {oilAnalysis.message} Add more visits to enable predictive analytics.
                            </p>
                          </div>
                        )
                      ) : (
                        <div className="p-6 bg-slate-950/20 border border-dashed border-white/5 rounded-2xl text-center space-y-2">
                          <Database size={24} className="text-slate-500 mx-auto" />
                          <p className="text-sm font-black text-slate-300">History Database Empty</p>
                          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                            No service history logs available to compile predictive calendar.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Customer Notes Bento Block */}
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 mt-4 sm:mt-6">
                      <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <MessageSquare size={13} className="text-amber-400" /> Executive Service & Account Notes
                      </p>
                      
                      <div className="space-y-3">
                        <textarea
                          value={customerNotes}
                          onChange={(e) => setCustomerNotes(e.target.value)}
                          className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-primary h-28 resize-none placeholder:text-slate-600 focus:border-transparent transition-all"
                          placeholder="Record client preferences, custom alerts or special context here..."
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={handleSaveNotesInline}
                            disabled={isSavingNotes}
                            className="bg-brand-primary hover:bg-brand-primary/90 text-white font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            {isSavingNotes ? (
                              <>
                                <Loader2 className="animate-spin" size={12} /> Saving...
                              </>
                            ) : (
                              <>
                                <Save size={12} /> Save Notes
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right side contact pane */}
                  <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                        <UserIcon size={14} className="text-brand-secondary" /> Primary Contacts
                      </p>

                      <div className="space-y-3.5 sm:space-y-4">
                        {/* Mobile Phone Card */}
                        <div className="p-3.5 sm:p-4 bg-slate-950/30 border border-white/5 rounded-xl sm:rounded-2xl flex items-center justify-between group hover:border-brand-primary/20 transition-all">
                          <div className="space-y-0.5 truncate pr-2">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Mobile Phone</p>
                            <p className="text-sm font-extrabold text-white truncate font-mono">{formData.phone || 'Unknown'}</p>
                          </div>
                          {formData.phone && (
                            <a 
                              href={`tel:${formData.phone}`} 
                              className="w-8 h-8 rounded-lg bg-brand-primary/10 hover:bg-brand-primary text-brand-secondary hover:text-white flex items-center justify-center transition-all shrink-0 border border-white/5"
                            >
                              <Phone size={14} />
                            </a>
                          )}
                        </div>

                        {/* Email Card */}
                        <div className="p-3.5 sm:p-4 bg-slate-950/30 border border-white/5 rounded-xl sm:rounded-2xl flex items-center justify-between group hover:border-brand-primary/20 transition-all">
                          <div className="space-y-0.5 truncate pr-2">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Email Address</p>
                            <p className="text-sm font-extrabold text-white truncate font-mono">{formData.email || 'Not Provided'}</p>
                          </div>
                          {formData.email && (
                            <a 
                              href={`mailto:${formData.email}`} 
                              className="w-8 h-8 rounded-lg bg-brand-primary/10 hover:bg-brand-primary text-brand-secondary hover:text-white flex items-center justify-center transition-all shrink-0 border border-white/5"
                            >
                              <Mail size={14} />
                            </a>
                          )}
                        </div>

                        {/* Residential Card */}
                        <div className="p-3.5 sm:p-4 bg-slate-950/30 border border-white/5 rounded-xl sm:rounded-2xl flex items-center justify-between group hover:border-brand-primary/20 transition-all">
                          <div className="space-y-0.5 truncate pr-2">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Primary Address</p>
                            <p className="text-xs font-black text-slate-200 truncate mt-1">
                              {formData.address ? `${formData.address}, ${formData.city || ''} ${formData.state || ''}` : 'No Address Stored'}
                            </p>
                          </div>
                          {formData.address && (
                            <a 
                              href={`https://maps.google.com/?q=${encodeURIComponent(`${formData.address} ${formData.city || ''} ${formData.state || ''} ${formData.zip || ''}`)}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="w-8 h-8 rounded-lg bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white flex items-center justify-center transition-all shrink-0 border border-white/5"
                            >
                              <MapPin size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                        <Shield size={14} className="text-emerald-500" /> Executive Metadata
                      </p>
                      
                      <div className="space-y-3.5 text-xs">
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="font-bold">Original Advisor:</span>
                          <span className="font-black text-white">{customer.soldByUsername || 'Import Conduit'}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="font-bold">Dealership Source:</span>
                          <span className="font-black text-white font-mono">HY-{customer.dealershipId ? customer.dealershipId.slice(-6).toUpperCase() : 'MAIN'}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-400">
                          <span className="font-bold">Campaign Status:</span>
                          <span className="flex items-center gap-1.5 font-black text-white">
                            <CheckCircle2 size={12} className="text-emerald-400" /> Sync OK
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TABS 2: DETAILED DEMOGRAPHICS */}
              {activeTab === 'demographics' && !isEditing && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
                  {/* Personal Demographics */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                      <UserIcon size={14} className="text-brand-primary" /> Profile Identification
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">First Name</span>
                        <p className="text-sm font-extrabold mt-1">{formData.firstName || 'Not Recorded'}</p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Last Name</span>
                        <p className="text-sm font-extrabold mt-1">{formData.lastName || 'Not Recorded'}</p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Mobile Phone</span>
                        <p className="text-sm font-extrabold mt-1 font-mono">{formData.phone || 'Not Recorded'}</p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Preferred Language</span>
                        <p className="text-sm font-extrabold mt-1">{formData.language || 'English'}</p>
                      </div>

                      <div className="col-span-1 sm:col-span-2 p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Primary Email Address</span>
                        <p className="text-sm font-extrabold mt-1 break-all font-mono">{formData.email || 'Not Stored'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Address Coordinates */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                      <MapPin size={14} className="text-indigo-400" /> Residential Geography
                    </h4>

                    <div className="space-y-3 sm:space-y-4">
                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Street Address</span>
                        <p className="text-sm font-extrabold text-white mt-1">{formData.address || 'Not Logged'}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">City</span>
                          <p className="text-sm font-extrabold mt-1 truncate">{formData.city || 'N/A'}</p>
                        </div>

                        <div className="p-3 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">State</span>
                          <p className="text-sm font-extrabold mt-1 truncate">{formData.state || 'N/A'}</p>
                        </div>

                        <div className="p-3 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">ZIP</span>
                          <p className="text-sm font-extrabold mt-1 truncate font-mono">{formData.zip || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/30 border border-white/5 rounded-xl sm:rounded-2xl text-xs text-slate-400 flex items-start gap-3">
                        <Info size={16} className="text-brand-primary shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          These demographic values are utilized for mailing list compilation and language-specific customer touchpoints in automated workflows.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TABS 3: SERVICE HISTORY CHRONICLE */}
              {activeTab === 'history' && !isEditing && (
                <div className="space-y-4 sm:space-y-6">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4 gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2">
                        <History size={14} className="text-amber-500 font-sans" /> Complete Chronological Logs
                      </h4>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Historical synchronized service visit history</p>
                    </div>
                    <span className="text-[10px] sm:text-xs font-black text-brand-secondary bg-slate-900 border border-white/5 px-2.5 py-1 rounded-lg sm:rounded-xl shrink-0">
                      Total Logs: {customer.recentVisits?.length || 0}
                    </span>
                  </div>

                  {!customer.recentVisits || customer.recentVisits.length === 0 ? (
                    <div className="p-8 sm:p-16 text-center border-2 border-dashed border-white/5 rounded-2xl sm:rounded-3xl bg-slate-950/25">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-600 border border-white/5">
                        <Database size={22} />
                      </div>
                      <h5 className="text-sm sm:text-base font-black text-slate-400 uppercase tracking-tight">Chron Chronicle Empty</h5>
                      <p className="text-slate-500 mt-1 max-w-sm mx-auto text-xs leading-relaxed">
                        No service advisor logs are currently active or recorded for this client profile. Use standard PDF/CSV integration.
                      </p>
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-900 pl-5 sm:pl-6 ml-2.5 sm:ml-3 space-y-4 sm:space-y-6 mt-4">
                      {customer.recentVisits.map((visit, idx) => (
                        <div key={idx} className="relative group bg-slate-900/30 border border-white/5 p-4 sm:p-5 rounded-xl sm:rounded-2xl hover:border-brand-primary/20 transition-all flex flex-col md:flex-row justify-between gap-4">
                          
                          {/* Timeline bullet indicator */}
                          <div className="absolute top-6 -left-[29px] sm:-left-[31px] w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-950 border-2 border-brand-primary flex items-center justify-center group-hover:scale-125 transition-transform" />

                          <div className="space-y-3 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20 text-brand-secondary text-[8px] sm:text-[9px] font-black rounded uppercase tracking-wider">
                                SO #{visit.soNumber}
                              </span>
                              <span className="text-[11px] sm:text-xs font-extrabold text-white flex items-center gap-1">
                                <Calendar size={11} className="text-slate-400" /> {visit.date}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500">•</span>
                              <span className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 truncate">
                                Advisor: {visit.advisor}
                              </span>
                            </div>

                            <div className="p-3 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl">
                              <p className="text-[8px] font-black text-brand-secondary uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                <Wrench size={10} /> Requests and Completed Repair Tasks
                              </p>
                              <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-sans font-medium">
                                {visit.requests}
                              </p>
                            </div>
                          </div>

                          <div className="text-left md:text-right shrink-0 flex flex-col justify-center min-w-[120px] bg-slate-950/20 md:bg-transparent p-3 rounded-lg sm:rounded-xl md:p-0">
                            <p className="text-base sm:text-lg md:text-xl font-black text-white font-mono tracking-tight text-left md:text-right">
                              {visit.mileage ? visit.mileage.toLocaleString() : 'N/A'}
                            </p>
                            <p className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5 text-left md:text-right">Recorded Odometer</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TABS 4: SERVICE ALERTS & CAMPAIGNS */}
              {activeTab === 'campaigns' && !isEditing && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                  {/* Alert Control panel */}
                  <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                      <h4 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                        <BellAlertIcon size={14} className="text-brand-secondary" /> Automated Communications
                      </h4>
                      
                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1 pr-4">
                          <p className="text-xs font-extrabold text-white">Service Alert Triggers</p>
                          <p className="text-[10px] font-medium text-slate-500 leading-relaxed">
                            Control when automated service suggestions are computed or sent for this profile.
                          </p>
                        </div>
                        <div className="flex items-center shrink-0">
                          <span className={cn(
                            "badge py-1 px-2.5 rounded-lg text-[9px] font-black sm:mr-3",
                            formData.enableServiceAlert ? "badge-success" : "badge-error"
                          )}>
                            {formData.enableServiceAlert ? "ACTIVE" : "STOPPED"}
                          </span>
                        </div>
                      </div>

                      {/* Interactive Section for Alert Removal */}
                      {!formData.stopAlertInfo ? (
                        <div className="space-y-4">
                          {!isSuspendingAlerts ? (
                            <button
                              type="button"
                              onClick={() => setIsSuspendingAlerts(true)}
                              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-rose-300 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/40 transition-all duration-200"
                            >
                              <X size={14} /> Remove Customer From Service Alerts
                            </button>
                          ) : (
                            <div className="p-4 sm:p-5 bg-rose-500/5 border border-rose-500/10 rounded-xl sm:rounded-2xl space-y-4">
                              <div className="border-b border-rose-500/10 pb-2">
                                <h5 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                                  <AlertTriangle size={13} /> Deactivate Maintenance Reminders
                                </h5>
                                <p className="text-[9px] text-rose-300/60 font-medium uppercase tracking-wider mt-0.5">Please file a reason and matching notes for this authorization.</p>
                              </div>

                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <label htmlFor="suspend-reason" className="text-[9px] font-black text-rose-400 uppercase tracking-wider">Reason for Removal</label>
                                  <select
                                    id="suspend-reason"
                                    value={suspendReason}
                                    onChange={(e) => setSuspendReason(e.target.value)}
                                    className="w-full bg-[#0e1424] border border-rose-500/20 text-slate-200 px-3 py-2.5 rounded-lg text-xs font-bold focus:outline-none focus:border-rose-500/50"
                                  >
                                    <option value="Customer Opted-Out">Customer Opted-Out / Do Not Contact</option>
                                    <option value="Vehicle Sold">Vehicle Sold / Transferred Account</option>
                                    <option value="Bad Contact Data">Bad Contact Info (Phone/Email)</option>
                                    <option value="Service Completed Elsewhere">Service Completed Elsewhere</option>
                                    <option value="Moved Away">Moved Away / Out of Area</option>
                                    <option value="Incorrect Owner Profile">Incorrect Owner Profile</option>
                                    <option value="Other">Other (Document in Notes)</option>
                                  </select>
                                </div>

                                <div className="space-y-1.5">
                                  <label htmlFor="suspend-notes" className="text-[9px] font-black text-rose-400 uppercase tracking-wider">Internal Authorization Notes</label>
                                  <textarea
                                    id="suspend-notes"
                                    value={suspendNotes}
                                    onChange={(e) => setSuspendNotes(e.target.value)}
                                    placeholder="Add background context, conversation notes, or specific customer requests here..."
                                    rows={3}
                                    className="w-full bg-[#0e1424] border border-rose-500/20 text-slate-200 px-3 py-2.5 rounded-lg text-xs placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsSuspendingAlerts(false);
                                      setSuspendNotes('');
                                    }}
                                    disabled={isProcessingAction}
                                    className="py-2.5 text-xs font-black uppercase text-slate-400 bg-slate-800 hover:bg-slate-750 border border-white/5 rounded-lg transition-all"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSuspendAlerts}
                                    disabled={isProcessingAction}
                                    className="py-2.5 text-xs font-black uppercase text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-lg shadow-rose-950/20 transition-all flex items-center justify-center gap-2"
                                  >
                                    {isProcessingAction ? "Processing..." : "Confirm Suspension"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {/* Show Stopped Alerts info if exist */}
                    {formData.stopAlertInfo && (
                      <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-rose-500/10 pb-3 gap-2">
                          <h5 className="text-xs font-black text-rose-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <AlertTriangle size={14} /> Suspended Campaign Information
                          </h5>
                          
                          <button
                            type="button"
                            onClick={handleReinstateAlerts}
                            disabled={isProcessingAction}
                            className="self-start sm:self-auto py-1 px-3 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase text-emerald-300 tracking-wider transition-all"
                          >
                            {isProcessingAction ? "Processing..." : "Reinstate Reminders"}
                          </button>
                        </div>
                        <div className="space-y-3 text-xs text-rose-300/80">
                          <p className="leading-relaxed">
                            <span className="font-extrabold text-white block">Suspended Code / Reason</span>
                            {formData.stopAlertInfo.reason}
                          </p>
                          {formData.stopAlertInfo.notes && (
                            <p className="leading-relaxed">
                              <span className="font-extrabold text-white block">Notes / Observations</span>
                              {formData.stopAlertInfo.notes}
                            </p>
                          )}
                          <div className="pt-2 flex flex-col sm:flex-row justify-between text-[10px] font-black uppercase text-rose-400/60 font-mono gap-1">
                            <span>Authorizer: {formData.stopAlertInfo.stoppedBy}</span>
                            <span>Date: {formData.stopAlertInfo.stoppedAt ? new Date(formData.stopAlertInfo.stoppedAt.toMillis()).toLocaleDateString() : 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                        <Database size={14} className="text-brand-secondary" /> Service History Summary
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Average Interval</span>
                          <span className="text-xs font-black text-emerald-400 mt-1 block">
                            {getAverageServiceIntervalMonths(formData)} Months
                          </span>
                        </div>
                        
                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Total Visits</span>
                          <span className="text-xs font-black text-white mt-1 block">
                            {formData.recentVisits?.length || 0} Logs
                          </span>
                        </div>

                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Last Service</span>
                          <span className="text-xs font-black text-slate-300 mt-1 block">
                            {getLastServiceDate(formData) ? getLastServiceDate(formData)!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : 'N/A'}
                          </span>
                        </div>

                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Next Due Date</span>
                          <span className="text-xs font-black text-brand-secondary mt-1 block">
                            {getNextServiceMilestone(formData)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* EDIT MODE RENDER FIELD LISTS */}
              {isEditing && (
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-6 sm:space-y-8 max-w-4xl mx-auto">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Edit2 size={14} className="text-brand-secondary" /> Modify Customer Coordinates
                      </h4>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Please ensure all required CRM fields match official records.</p>
                    </div>
                  </div>

                  <div className="space-y-6 sm:space-y-8">
                    {/* Part 1: Personal Specifications */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.15em]">Part A: Name & Identity</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="input-label">First Name</label>
                          <input name="firstName" value={formData.firstName} onChange={handleChange} className="input-field" placeholder="First Name" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="input-label">Last Name</label>
                          <input name="lastName" value={formData.lastName} onChange={handleChange} className="input-field" placeholder="Last Name" />
                        </div>
                      </div>
                    </div>

                    {/* Part 2: Contact Options */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.15em]">Part B: Communication Contacts</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="input-label">Phone Connection</label>
                          <input name="phone" value={formData.phone} onChange={handleChange} className="input-field font-mono" placeholder="Mobile Phone" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="input-label">Email System Address</label>
                          <input name="email" value={formData.email} onChange={handleChange} className="input-field font-mono" placeholder="Email Communication Address" />
                        </div>
                      </div>
                    </div>

                    {/* Part 3: Vehicle Specs */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.15em]">Part C: Automotive Registry Details</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="input-label">Model Year</label>
                          <input name="year" value={formData.year || ''} onChange={handleChange} className="input-field font-mono" placeholder="e.g. 2024" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="input-label">Vehicle Make</label>
                          <input name="make" value={formData.make} onChange={handleChange} className="input-field" placeholder="e.g. Hyundai" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="input-label">Vehicle Model</label>
                          <input name="model" value={formData.model} onChange={handleChange} className="input-field" placeholder="e.g. Tucson" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="input-label">Full Chassis VIN (17 Characters)</label>
                          <input 
                            name="vin" 
                            value={formData.vin || ''} 
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setFormData(prev => ({ 
                                ...prev, 
                                vin: val, 
                                vinLast8: val.length >= 8 ? val.slice(-8) : prev.vinLast8 
                              }));
                            }} 
                            className="input-field font-mono text-brand-secondary uppercase tracking-widest" 
                            placeholder="Full 17-character VIN" 
                            maxLength={17} 
                          />
                        </div>
                        <div className="space-y-1.5 col-span-1">
                          <label className="input-label">Global VIN (Last 8)</label>
                          <input name="vinLast8" value={formData.vinLast8} onChange={handleChange} className="input-field font-mono text-brand-secondary" placeholder="Last 8 alphanumeric" maxLength={8} />
                        </div>
                        <div className="space-y-1.5 col-span-1">
                          <label className="input-label">Current Odometer (Miles)</label>
                          <input name="mileage" value={formData.mileage || ''} onChange={handleChange} className="input-field font-mono" placeholder="Mileage integer" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="input-label font-bold text-slate-300">Delivery Date</label>
                          <input name="soldDate" type="date" value={formData.soldDate} onChange={handleChange} className="input-field" />
                        </div>
                      </div>
                    </div>

                    {/* Part 4: Address Coordinates */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.15em]">Part D: Residence Logistics</p>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="input-label">Street Address Coordinates</label>
                          <input name="address" value={formData.address || ''} onChange={handleChange} className="input-field" placeholder="Primary Address Coordinates" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                          <div className="space-y-1.5">
                            <label className="input-label">City State Hub</label>
                            <input name="city" value={formData.city || ''} onChange={handleChange} className="input-field" placeholder="City" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="input-label">State Code</label>
                            <input name="state" value={formData.state || ''} onChange={handleChange} className="input-field" placeholder="State" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="input-label">Zip Blueprint Code</label>
                            <input name="zip" value={formData.zip || ''} onChange={handleChange} className="input-field font-mono" placeholder="ZIP" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Part 5: Campaign & Language preferences */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.15em]">Part E: Retention Configurations</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="input-label">Communication Dialect</label>
                          <input name="language" value={formData.language || ''} onChange={handleChange} className="input-field" placeholder="e.g. English, Spanish" />
                        </div>
                        
                        <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">S2S Campaign Subscriptions</span>
                            <span className="text-[9px] text-slate-500 font-medium">Allow automated retention alerts</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1 sm:mt-0">
                            <input 
                              type="checkbox" 
                              name="enableServiceAlert" 
                              checked={formData.enableServiceAlert} 
                              onChange={(e) => setFormData(prev => ({ ...prev, enableServiceAlert: e.target.checked }))}
                              className="sr-only peer" 
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary" />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Part 6: Profile Notes */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.15em]">Part F: Account Notes</p>
                      <div className="space-y-1.5">
                        <label className="input-label">Customer Profile Notes</label>
                        <textarea
                          name="notes"
                          value={formData.notes || ''}
                          onChange={handleChange}
                          className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 p-4 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all h-28 resize-none"
                          placeholder="Persistent notes about this customer (will be displayed on alerts and profile)..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>



      </div>
    </div>
  );
}

// Inline fallback for bell alert icon
function BellAlertIcon({ className, size }: { className?: string, size?: number }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 16} 
      height={size || 16} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
