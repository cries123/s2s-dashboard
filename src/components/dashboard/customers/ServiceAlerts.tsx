import React from 'react';
import { Customer, User } from '../../../types';
import CustomerCard from './CustomerCard';
import { History, Loader2, Phone } from 'lucide-react';
import { writeBatch, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { handleFirestoreError, OperationType } from '../../../lib/firebaseUtils';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { ConfirmModal } from '../../ui/ConfirmModal';

interface ServiceAlertsProps {
  customers: Customer[];
  currentUser: User;
  onViewProfile: (c: Customer) => void;
  onViewLog: (c: Customer) => void;
  onRefresh: (msg?: string, isError?: boolean) => void;
}

export default function ServiceAlerts({
  customers,
  currentUser,
  onViewProfile,
  onViewLog,
  onRefresh,
}: ServiceAlertsProps) {
  const serviceAlerts = useServiceAlertHelpers();
  const activeAlerts = customers.filter(serviceAlerts.isServiceAlertActive);

  const [isResetting, setIsResetting] = React.useState(false);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  const handleResetAllClick = () => {
    if (activeAlerts.length === 0) return;
    setShowResetConfirm(true);
  };

  const handleResetAll = async () => {
    const alertsToProcess = [...activeAlerts];
    if (alertsToProcess.length === 0) {
      setShowResetConfirm(false);
      return;
    }

    setIsResetting(true);
    let totalProcessed = 0;

    try {
      const chunkSize = 200;

      for (let i = 0; i < alertsToProcess.length; i += chunkSize) {
        const batch = writeBatch(db);
        const currentChunk = alertsToProcess.slice(i, i + chunkSize);

        currentChunk.forEach((c) => {
          const nextDue = serviceAlerts.computeContactClearDueDate(c);
          const customerRef = doc(
            db,
            'artifacts',
            'hyundai-sales-to-service',
            'public',
            'data',
            'customers',
            c.id
          );

          const logRef = doc(
            collection(
              db,
              'artifacts',
              'hyundai-sales-to-service',
              'public',
              'data',
              'customers',
              c.id,
              'contactLog'
            )
          );
          batch.set(logRef, {
            timestamp: serverTimestamp(),
            userId: currentUser.uid,
            username: currentUser.username,
            outcome: 'Bulk Cycle Reset',
            notes: `Service reminder reset. Next due ${nextDue}.`,
            appointmentSet: false,
          });

          batch.update(customerRef, {
            lastServiceContact: serverTimestamp(),
            serviceReminderDueDate: nextDue,
            serviceAlertTriggered: false,
            lastContactOutcome: 'Bulk Cycle Reset',
            lastContactUsername: currentUser.username,
            lastContactUserId: currentUser.uid,
          });
        });

        await batch.commit();
        totalProcessed += currentChunk.length;
      }

      onRefresh(`Successfully reset service reminders for ${totalProcessed} customers.`, false);
    } catch (err) {
      console.error('Batch commit failed:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, 'customers/bulk-reset');
      } catch (formattedErr: any) {
        onRefresh(formattedErr.message, true);
      }
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const resetConfirmDescription = serviceAlerts.isStandardMode
    ? `Confirm complete reset of all ${activeAlerts.length} service reminders? Each customer will get a new 6-month reminder from today.`
    : `Confirm complete reset of all ${activeAlerts.length} service reminders? Each customer will get a new reminder based on their service interval from today.`;

  return (
    <div className="space-y-6 sm:space-y-8 pb-24 md:pb-8">
      <div className="sticky top-[4.25rem] z-30 -mx-4 px-4 py-3 sm:static sm:mx-0 sm:px-0 sm:py-0 bg-surface-base/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-b border-white/5 sm:border-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex flex-wrap items-center gap-2 sm:gap-3">
              Service Command Center
              {activeAlerts.length > 0 && (
                <span className="badge badge-error border-rose-500/30 px-3 py-1 text-xs">
                  {activeAlerts.length} Attention Required
                </span>
              )}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
              {serviceAlerts.isStandardMode
                ? 'Tap a customer to log contact or open their profile. Reminders are set for 6 months after delivery or last outreach.'
                : 'Tap a customer to log contact or open their profile. Reminders follow each customer\'s oil-change interval when service history is available.'}
            </p>
          </div>

          {activeAlerts.length > 0 && (
            <button
              onClick={handleResetAllClick}
              disabled={isResetting}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm py-2.5 px-4 shadow-lg shadow-emerald-900/20 disabled:opacity-50 w-full sm:w-auto min-h-[44px]"
            >
              {isResetting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <History size={16} />
              )}
              {isResetting ? 'Processing...' : 'Reset Service Reminders'}
            </button>
          )}
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sky-400/90 bg-sky-500/10 border border-sky-500/20 rounded-xl px-3 py-2 md:hidden">
          <Phone size={14} />
          {activeAlerts.length} customers ready for outreach
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4 sm:gap-6">
        {activeAlerts.length === 0 ? (
          <div className="md:col-span-2 card-base p-10 sm:p-12 text-center border-dashed border-slate-700 bg-transparent">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
              <History size={32} />
            </div>
            <h3 className="text-lg font-bold text-white">All Clear!</h3>
            <p className="text-slate-400 mt-1 max-w-md mx-auto text-sm">
              No pending service alerts. Every customer is accounted for and your pipeline is
              healthy.
            </p>
          </div>
        ) : (
          activeAlerts.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              currentUser={currentUser}
              onViewProfile={(c: Customer) => onViewProfile(c)}
              onViewLog={(c: Customer) => onViewLog(c)}
              onRefresh={onRefresh}
              isAlert
            />
          ))
        )}
      </div>

      <ConfirmModal
        open={showResetConfirm}
        title="Reset Service Reminders"
        description={resetConfirmDescription}
        confirmLabel="Reset Reminders"
        tone="danger"
        loading={isResetting}
        onConfirm={handleResetAll}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
