import React, { useState } from 'react';
import { Customer, User, WorkQueueItem, ServiceDriveReason } from '../../../types';
import {
  Phone,
  User as UserIcon,
  Bell,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { cn } from '../../../lib/utils';
import { calculateServiceCycle } from '../../../lib/alerts';
import { handleFirestoreError, OperationType } from '../../../lib/firebaseUtils';
import { ContactLogQuickForm } from '../../forms/ContactLogQuickForm';
import { usePreferences } from '../../../context/PreferencesContext';

const REASON_META: Record<
  ServiceDriveReason,
  { label: string; className: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  service_due: {
    label: 'Service Due',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    icon: Bell,
  },
  stale_followup: {
    label: 'Follow Up',
    className: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
    icon: Clock,
  },
};

const PRIORITY_STYLES = {
  urgent: 'border-l-rose-500 bg-rose-500/5',
  high: 'border-l-orange-500 bg-orange-500/5',
  medium: 'border-l-amber-500 bg-amber-500/5',
  normal: 'border-l-slate-600 bg-slate-900/20',
};

interface ServiceDriveQueueItemProps {
  item: WorkQueueItem;
  rank: number;
  currentUser: User;
  onViewProfile: (customer: Customer) => void;
  onRefresh?: (msg: string, isError?: boolean) => void;
}

export function ServiceDriveQueueItem({
  item,
  rank,
  currentUser,
  onViewProfile,
  onRefresh,
}: ServiceDriveQueueItemProps) {
  const { customer, reasons, daysOverdue, daysSinceContact, priority } = item;
  const { preferences } = usePreferences();
  const [expanded, setExpanded] = useState(false);

  const handleLogCall = async ({ outcome, notes, appointmentSet }: { outcome: string; notes: string; appointmentSet: boolean }) => {
    const path = `customers/${customer.id}/contactLog`;
    try {
      await addDoc(
        collection(
          db,
          'artifacts',
          'hyundai-sales-to-service',
          'public',
          'data',
          'customers',
          customer.id,
          'contactLog'
        ),
        {
          timestamp: serverTimestamp(),
          userId: currentUser.uid,
          username: currentUser.username,
          outcome,
          notes,
          appointmentSet,
        }
      );

      const currentCycle = calculateServiceCycle(customer.soldDate);
      await updateDoc(
        doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id),
        {
          lastServiceContact: serverTimestamp(),
          lastContactOutcome: outcome,
          lastContactUserId: currentUser.uid,
          lastContactUsername: currentUser.username,
          lastAcknowledgedCycle: currentCycle,
          serviceAlertTriggered: false,
        }
      );

      setExpanded(false);
      onRefresh?.(`Logged ${outcome} for ${customer.firstName}.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, path);
      } catch (formattedErr: unknown) {
        const message = formattedErr instanceof Error ? formattedErr.message : 'Failed to log contact';
        onRefresh?.(message, true);
      }
    }
  };

  return (
    <article
      className={cn(
        'card-base border border-slate-800/60 rounded-2xl overflow-hidden border-l-4 transition-all hover:border-white/10',
        PRIORITY_STYLES[priority]
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-center">
              <span className="text-xs font-black text-slate-400">#{rank}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {reasons.map((reason) => {
                  const meta = REASON_META[reason];
                  const Icon = meta.icon;
                  return (
                    <span
                      key={reason}
                      className={cn(
                        'inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border',
                        meta.className
                      )}
                    >
                      <Icon size={10} />
                      {meta.label}
                    </span>
                  );
                })}
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">
                  Score {item.score}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onViewProfile(customer)}
                className="text-lg sm:text-xl font-black text-white hover:text-brand-primary transition-colors text-left uppercase italic tracking-tight"
              >
                {customer.firstName} {customer.lastName}
              </button>

              <p className="text-[11px] font-bold text-slate-400 mt-1">
                {customer.year} {customer.make} {customer.model}
                {customer.vinLast8 ? ` · VIN …${customer.vinLast8}` : ''}
              </p>

              <div className="flex flex-wrap gap-3 mt-2 text-[10px] font-bold text-slate-500">
                {daysOverdue > 0 && (
                  <span className="text-amber-500/90">{daysOverdue}d overdue</span>
                )}
                <span>
                  Last contact:{' '}
                  {daysSinceContact === null ? 'Never' : `${daysSinceContact}d ago`}
                </span>
                {customer.lastContactOutcome && (
                  <span className="text-slate-600">· {customer.lastContactOutcome}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-row sm:flex-col gap-2 shrink-0 sm:items-stretch">
            <a
              href={`tel:${customer.phone}`}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/30"
            >
              <Phone size={14} />
              Call
            </a>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary/20 hover:bg-brand-primary/30 text-brand-primary border border-brand-primary/30 text-[10px] font-black uppercase tracking-wider transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Log
            </button>
            <button
              type="button"
              onClick={() => onViewProfile(customer)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider transition-colors border border-white/5"
            >
              <UserIcon size={14} />
              Profile
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
            <ContactLogQuickForm
              defaultOutcome={preferences.contactWorkflow.defaultOutcome}
              autoCheckAppointmentSet={preferences.contactWorkflow.autoCheckAppointmentSet}
              onSubmit={handleLogCall}
              className="space-y-3"
            />
          </div>
        )}
      </div>
    </article>
  );
}
