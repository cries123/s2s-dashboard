import React, { useState } from 'react';
import { Customer, User } from '../../types';
import { Phone, Mail, Car, Calendar, History, Trash2, Edit2, Loader2, FastForward } from 'lucide-react';
import { Timestamp, addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { cn } from '../../lib/utils';
import { calculateServiceCycle, getNextServiceMilestone } from '../../lib/alerts';
import { handleFirestoreError, OperationType } from '../../lib/firebaseUtils';

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
  const [outcome, setOutcome] = useState('Answered');
  const [notes, setNotes] = useState('');
  const [appointmentSet, setAppointmentSet] = useState(false);

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

  return (
    <div className="card-base card-interactive p-0 overflow-hidden border-slate-800/50 group">
      <div className="p-6">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
               <span className={cn(
                 "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                 customer.language === 'Spanish' ? "bg-amber-500/10 text-amber-500" : "bg-slate-800 text-slate-500"
               )}>
                 {customer.language || 'English'}
               </span>
               {customer.addedByUsername && (
                 <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
                    Rep: {customer.addedByUsername}
                 </span>
               )}
            </div>
            <button 
              onClick={() => onViewProfile(customer)}
              className="text-xl font-black text-white hover:text-brand-primary transition-colors text-left leading-tight"
            >
              {customer.firstName} {customer.lastName}
            </button>
            
            <div className="flex flex-col gap-1.5 mt-3">
              <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-brand-secondary transition-colors group/link">
                <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center group-hover/link:bg-brand-secondary/10 transition-colors">
                  <Phone size={12} className="text-slate-500 group-hover/link:text-brand-secondary" />
                </div>
                {customer.phone || 'No phone'}
              </a>
              <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-brand-secondary transition-colors group/link">
                <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center group-hover/link:bg-brand-secondary/10 transition-colors">
                  <Mail size={12} className="text-slate-500 group-hover/link:text-brand-secondary" />
                </div>
                {customer.email || 'No email'}
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button 
              onClick={() => onViewLog(customer)}
              className="w-10 h-10 flex items-center justify-center bg-slate-900 text-slate-500 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all border border-slate-800"
              title="View Interaction Log"
            >
              <History size={18} />
            </button>
            <button 
              onClick={() => onViewProfile(customer)}
              className="w-10 h-10 flex items-center justify-center bg-slate-900 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all border border-slate-800"
              title="Edit Profile"
            >
              <Edit2 size={16} />
            </button>
          </div>
        </div>
        
        {isAlert && (
          <div className="mt-5 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-rose-500"></div>
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
            </div>
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">6-Month Service Overdue</span>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4 mt-6 py-5 border-y border-slate-800/50 bg-slate-950/30 -mx-6 px-6">
          <div className="space-y-1">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Vehicle</p>
            <p className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Car size={14} className="text-brand-primary" /> 
              {customer.year} {customer.model}
            </p>
            <p className="text-[10px] font-mono text-brand-secondary/70 uppercase">{customer.vinLast8}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Sold Date</p>
            <p className="text-xs font-bold text-slate-300 flex items-center justify-end gap-2">
              <Calendar size={14} className="text-slate-500" /> 
              {customer.soldDate || 'N/A'}
            </p>
            {customer.mileage && <p className="text-[10px] font-bold text-slate-500">{customer.mileage} miles</p>}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-b border-slate-800/30 pb-4">
           <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Last Contact</span>
              <span className="text-[10px] font-bold text-slate-400">
                {formatLastContact(customer.lastServiceContact)}
              </span>
           </div>
           <div className="flex flex-col text-right">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Next Alert</span>
              <span className="text-[10px] font-bold text-brand-secondary/70">
                {getNextServiceMilestone(customer.soldDate)}
              </span>
           </div>
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
