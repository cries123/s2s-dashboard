import React, { useState } from 'react';
import { Customer, User } from '../../../types';
import { Phone, Mail, Car, Calendar, History, Trash2, Edit2, Loader2, FastForward, Database, CheckCircle2, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { Timestamp, addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { cn } from '../../../lib/utils';
import { calculateServiceCycle, getNextServiceMilestone } from '../../../lib/alerts';
import { handleFirestoreError, OperationType } from '../../../lib/firebaseUtils';
import { getRecommendedServices, getMonthsOwned } from '../../../lib/maintenance';
import { ContactLogQuickForm } from '../../forms/ContactLogQuickForm';
import { usePreferences } from '../../../context/PreferencesContext';

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
  const { preferences } = usePreferences();
  const [showMaintenance, setShowMaintenance] = useState(false);

  const lastVisit = customer.recentVisits?.[0];

  const handleLogCall = async ({ outcome, notes, appointmentSet }: { outcome: string; notes: string; appointmentSet: boolean }) => {
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

      if (onRefresh) onRefresh(`Logged ${outcome} and cleared alert for ${customer.firstName}.`);
    } catch (err) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.WRITE, path);
      } catch (formattedErr: any) {
        if (onRefresh) onRefresh(formattedErr.message, true);
      }
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
    <div className={cn("card-base card-interactive p-0 overflow-hidden border-slate-800/40 group bg-slate-100 dark:bg-slate-900/30 backdrop-blur-sm shadow-xl rounded-2xl transition-all duration-300 hover:shadow-2xl", preferences.crmDisplay.density === "compact" && "text-[95%]")}>
      <div className="p-5">
        <div className="flex justify-between items-start gap-3">
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
              className="text-xl font-black text-white hover:text-brand-primary transition-colors text-left leading-none tracking-tight uppercase italic"
            >
              {customer.firstName} {customer.lastName}
            </button>
            
            <div className="flex flex-col gap-1.5 mt-3">
              <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-brand-secondary transition-colors group/link">
                <div className="w-6 h-6 rounded-lg bg-slate-950 flex items-center justify-center group-hover/link:bg-brand-secondary/10 transition-colors border border-white/5 shadow-inner">
                  <Phone size={11} className="text-slate-600 group-hover/link:text-brand-secondary" />
                </div>
                {customer.phone || 'No Phone Entry'}
              </a>
              {lastVisit && (
                <div className="flex items-center gap-2 text-[10px] font-black text-brand-primary uppercase tracking-widest">
                   <div className="w-6 h-6 rounded-lg bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
                     <CheckCircle2 size={11} />
                   </div>
                   Last Visit: {lastVisit.date}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => onViewLog(customer)}
              className="w-9 h-9 flex items-center justify-center bg-slate-950 text-slate-500 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all border border-white/5 shadow-inner hover:scale-105 active:scale-95"
              title="View Interaction Log"
            >
              <History size={16} />
            </button>
            <button 
              onClick={() => onViewProfile(customer)}
              className="w-9 h-9 flex items-center justify-center bg-slate-950 text-slate-600 hover:text-white hover:bg-slate-800 rounded-xl transition-all border border-white/5 shadow-inner hover:scale-105 active:scale-95"
              title="Edit Profile"
            >
              <Edit2 size={14} />
            </button>
          </div>
        </div>
        
        {isAlert && (
          <div className="mt-4 space-y-2.5">
            <div className="px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 shadow-lg shadow-rose-950/20">
              <div className="relative shrink-0 w-2 h-2">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
              </div>
              <span className="text-[9px] font-black text-rose-400 uppercase tracking-[0.2em] leading-none">Maintenance Opportunity</span>
            </div>

            {customer.notes && (
              <div className="px-4 py-3 bg-slate-950/40 border border-slate-800/50 rounded-xl space-y-0.5">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.15em]">Internal Account Notes</p>
                <p className="text-[10px] font-medium text-slate-300 italic">"{customer.notes}"</p>
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center justify-between mt-4 py-3 bg-slate-950/30 px-5 -mx-5 border-y border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary border border-brand-primary/20">
              <Car size={14} />
            </div>
            <div>
              <p className="text-[11px] font-black text-white uppercase italic tracking-tight leading-tight">
                {customer.year} {customer.model}
              </p>
              <span className="inline-block text-[8px] font-mono text-brand-secondary font-black tracking-widest mt-0.5">{customer.vinLast8}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Odometer</p>
            <p className="text-sm font-black text-white tabular-nums tracking-tighter mt-0.5">
              {parseInt(customer.mileage || '0').toLocaleString()} <span className="text-[9px] font-normal text-slate-400 font-sans uppercase">M</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px]">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">Contact Records</span>
            <span className="text-[10px] font-bold text-slate-300">
              {formatLastContact(customer.lastServiceContact)}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">S2S Alert Range</span>
            <span className="text-[10px] font-black text-brand-secondary uppercase italic">
              {getNextServiceMilestone(customer)}
            </span>
          </div>
        </div>

        <div className="mt-3.5">
          <button 
            onClick={() => setShowMaintenance(!showMaintenance)}
            className="w-full flex items-center justify-between p-2.5 bg-slate-950/20 hover:bg-slate-950/40 rounded-xl border border-slate-800/30 transition-all text-[10px]"
          >
            <div className="flex items-center gap-2">
              <Wrench size={12} className="text-brand-secondary" />
              <span className="text-[9px] font-black text-white uppercase tracking-widest">View Maintenance Roadmap</span>
            </div>
            {showMaintenance ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
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
          <div className="pt-4">
            <ContactLogQuickForm
              defaultOutcome={preferences.contactWorkflow.defaultOutcome}
              autoCheckAppointmentSet={preferences.contactWorkflow.autoCheckAppointmentSet}
              onSubmit={handleLogCall}
              submitLabel="Update & Clear Alert"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerCard;
