import React, { useState } from 'react';
import { Customer, User } from '../../../types';
import { Phone, Mail, Car, Calendar, History, Trash2, Edit2, Loader2, FastForward, Database, CheckCircle2, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { Timestamp, addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { cn } from '../../../lib/utils';
import { calculateServiceCycle, getNextServiceMilestone } from '../../../lib/alerts';
import { handleFirestoreError, OperationType } from '../../../lib/firebaseUtils';
import { getRecommendedServices, getMonthsOwned } from '../../../lib/maintenance';

interface CustomerCardProps {
  customer: Customer;
  currentUser: User;
  onViewProfile: (c: Customer) => void;
  onViewLog: (c: Customer) => void;
  onRefresh?: (msg: string, isError?: boolean) => void;
  isAlert?: boolean;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ 
  customer, 
  currentUser, 
  onViewProfile, 
  onViewLog, 
  onRefresh,
  isAlert 
}) => {
  const [isLogging, setIsLogging] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [outcome, setOutcome] = useState('Answered');
  const [notes, setNotes] = useState('');
  const [appointmentSet, setAppointmentSet] = useState(false);

  const lastVisit = customer.recentVisits?.[0];

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLogging(true);
    const path = `customers/${customer.id}/contactLog`;
    try {
      // Log to subcollection
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id, 'contactLog'), {
        timestamp: serverTimestamp(),
        userId: currentUser.uid,
        username: currentUser.username,
        outcome,
        notes,
        appointmentSet
      });

      // Update customer - reset specifically to the current milestone cycle
      const currentCycle = calculateServiceCycle(customer.soldDate);

      await updateDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id), {
        lastServiceContact: serverTimestamp(),
        lastContactOutcome: outcome,
        lastContactUserId: currentUser.uid,
        lastContactUsername: currentUser.username,
        lastAcknowledgedCycle: currentCycle,
        serviceAlertTriggered: false
      });

      setNotes('');
      setAppointmentSet(false);
      if (onRefresh) onRefresh(`Logged ${outcome} and cleared alert for ${customer.firstName}.`);
    } catch (err) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.WRITE, path);
      } catch (formattedErr: any) {
        if (onRefresh) onRefresh(formattedErr.message, true);
      }
    } finally {
      setIsLogging(false);
    }
  };

  const formatLastContact = (date: any) => {
    if (!date) return 'Never contacted';
    try {
      if (date.toDate) return date.toDate().toLocaleDateString();
      if (date instanceof Date) return date.toLocaleDateString();
      const d = new Date(date);
      return isNaN(d.getTime()) ? 'Invalid Date' : d.toLocaleDateString();
    } catch (e) {
      return 'Date Error';
    }
  };

  const monthsOwned = getMonthsOwned(customer.soldDate);
  const maintenanceTasks = getRecommendedServices(monthsOwned);

  return (
    <div className="card-base card-interactive p-0 overflow-hidden border-slate-800/50 group bg-slate-900/40 backdrop-blur-sm shadow-2xl">
      <div className="p-6">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
               <span className={cn(
                 "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                 customer.language === 'Spanish' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-slate-800/50 text-slate-500 border-slate-700/50"
               )}>
                 {customer.language || 'English'}
               </span>
               {customer.recentVisits && customer.recentVisits.length > 0 && (
                 <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                    <Database size={8} /> Synced
                 </span>
               )}
            </div>
            <button 
              onClick={() => onViewProfile(customer)}
              className="text-2xl font-black text-white hover:text-brand-primary transition-colors text-left leading-none tracking-tight uppercase italic"
            >
              {customer.firstName} {customer.lastName}
            </button>
            
            <div className="flex flex-col gap-2 mt-4">
              <a href={`tel:${customer.phone}`} className="flex items-center gap-2.5 text-[11px] font-bold text-slate-400 hover:text-brand-secondary transition-colors group/link">
                <div className="w-7 h-7 rounded-xl bg-slate-950 flex items-center justify-center group-hover/link:bg-brand-secondary/10 transition-colors border border-white/5 shadow-inner">
                  <Phone size={13} className="text-slate-600 group-hover/link:text-brand-secondary" />
                </div>
                {customer.phone || 'No Phone Entry'}
              </a>
              {lastVisit && (
                <div className="flex items-center gap-2.5 text-[10px] font-black text-brand-primary uppercase tracking-widest mt-1">
                   <div className="w-7 h-7 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
                     <CheckCircle2 size={13} />
                   </div>
                   Last Visit: {lastVisit.date}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button 
              onClick={() => onViewLog(customer)}
              className="w-11 h-11 flex items-center justify-center bg-slate-950 text-slate-500 hover:text-brand-primary hover:bg-brand-primary/10 rounded-2xl transition-all border border-white/5 shadow-inner hover:scale-105 active:scale-95"
              title="View Interaction Log"
            >
              <History size={20} />
            </button>
            <button 
              onClick={() => onViewProfile(customer)}
              className="w-11 h-11 flex items-center justify-center bg-slate-950 text-slate-600 hover:text-white hover:bg-slate-800 rounded-2xl transition-all border border-white/5 shadow-inner hover:scale-105 active:scale-95"
              title="Edit Profile"
            >
              <Edit2 size={18} />
            </button>
          </div>
        </div>
        
        {isAlert && (
          <div className="mt-6 space-y-3">
            <div className="px-5 py-4 bg-rose-500/10 border border-rose-500/20 rounded-[1.25rem] flex items-center gap-3 shadow-lg shadow-rose-950/20">
              <div className="relative shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></div>
              </div>
              <span className="text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] leading-none">Maintenance Opportunity</span>
            </div>

            {customer.notes && (
              <div className="px-5 py-4 bg-slate-950/40 border border-slate-800/50 rounded-[1.25rem] space-y-1">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.15em]">Internal Account Notes</p>
                <p className="text-[11px] font-medium text-slate-300 italic">"{customer.notes}"</p>
              </div>
            )}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4 mt-6 py-6 border-y border-white/5 bg-slate-950/50 -mx-6 px-6">
          <div className="space-y-1.5 opacity-90">
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em]">Vehicle Fleet</p>
            <p className="text-xs font-black text-white flex items-center gap-2 uppercase italic tracking-tight">
              <Car size={14} className="text-brand-primary" /> 
              {customer.year} {customer.model}
            </p>
            <div className="inline-flex px-2 py-0.5 bg-slate-900 rounded border border-white/5">
              <p className="text-[9px] font-mono text-brand-secondary font-bold uppercase tracking-widest">{customer.vinLast8}</p>
            </div>
          </div>
          <div className="space-y-1.5 text-right">
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em]">Odometer (M)</p>
            <div className="flex flex-col items-end">
              <p className="text-xl font-black text-white leading-none tabular-nums tracking-tighter">
                {parseInt(customer.mileage || '0').toLocaleString()}
              </p>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Certified Miles</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-b border-white/5 pb-4">
           <div className="flex flex-col">
              <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">Contact Records</span>
              <span className="text-[10px] font-bold text-slate-400">
                {formatLastContact(customer.lastServiceContact)}
              </span>
           </div>
           <div className="flex flex-col text-right">
              <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">S2S Alert Range</span>
              <span className="text-[10px] font-black text-brand-secondary uppercase italic">
                {getNextServiceMilestone(customer)}
              </span>
           </div>
        </div>

        <div className="mt-4">
          <button 
            onClick={() => setShowMaintenance(!showMaintenance)}
            className="w-full flex items-center justify-between p-3 bg-slate-900/50 hover:bg-slate-900 rounded-xl border border-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Wrench size={14} className="text-brand-secondary" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">View Maintenance Roadmap</span>
            </div>
            {showMaintenance ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
          </button>

          {showMaintenance && (
            <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/30">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Recommended Services ({monthsOwned}mo of ownership)</p>
                <div className="space-y-1.5">
                  {maintenanceTasks.map((task, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-slate-900/40 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-1 h-1 rounded-full",
                          task.importance === 'high' ? "bg-rose-500" : task.importance === 'medium' ? "bg-amber-500" : "bg-slate-600"
                        )}></div>
                        <span className="text-[10px] font-bold text-slate-300">{task.task}</span>
                      </div>
                      <span className="text-[8px] font-black text-slate-500 uppercase">{task.interval}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isAlert && (
        <div className="p-6 pt-0 bg-slate-900/30 border-t border-slate-800/50">
          <form onSubmit={handleLogCall} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Outcome</label>
                <select 
                  value={outcome}
                  onChange={e => setOutcome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-bold text-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  <option>Answered</option>
                  <option>Left Voicemail</option>
                  <option>No Answer</option>
                  <option>Wrong Number</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Next Step</label>
                <select 
                  value={appointmentSet ? 'true' : 'false'}
                  onChange={e => setAppointmentSet(e.target.value === 'true')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-bold text-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="false">Follow Up</option>
                  <option value="true">Set Appt</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <textarea 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-medium text-slate-300 h-20 resize-none focus:outline-none focus:ring-1 focus:ring-brand-primary" 
                placeholder="Brief summary of interaction..."
              ></textarea>
            </div>
            <button 
              type="submit" 
              disabled={isLogging}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50"
            >
              {isLogging ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={14} /> Synchronizing...
                </span>
              ) : (
                'Update & Clear Alert'
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default CustomerCard;
