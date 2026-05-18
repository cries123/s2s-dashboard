import React from 'react';
import { Customer, User } from '../../../types';
import CustomerCard from './CustomerCard';
import { Trash2, History, Loader2 } from 'lucide-react';
import { writeBatch, doc, collection, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { isServiceAlertActive, calculateServiceCycle } from '../../../lib/alerts';
import { handleFirestoreError, OperationType } from '../../../lib/firebaseUtils';

interface ServiceAlertsProps {
  customers: Customer[];
  currentUser: User;
  onViewProfile: (c: Customer) => void;
  onViewLog: (c: Customer) => void;
  onRefresh: (msg?: string, isError?: boolean) => void;
}

export default function ServiceAlerts({ customers, currentUser, onViewProfile, onViewLog, onRefresh }: ServiceAlertsProps) {
  const activeAlerts = customers.filter(isServiceAlertActive);

  const [isResetting, setIsResetting] = React.useState(false);

  const handleResetAll = async () => {
    const alertsToProcess = [...activeAlerts];
    if (alertsToProcess.length === 0) return;
    
    if (!confirm(`Confirm complete reset of all ${alertsToProcess.length} service cycle reminders? This will log a 'Bulk Cycle Reset' for each customer.`)) return;
    
    setIsResetting(true);
    let totalProcessed = 0;
    
    try {
      // Firestore batches have a limit of 500 operations.
      // We perform 2 operations per customer (1 set for log, 1 update for customer doc).
      // So use a chunk size of 200 to stay well within limits.
      const chunkSize = 200;
      
      for (let i = 0; i < alertsToProcess.length; i += chunkSize) {
        const batch = writeBatch(db);
        const currentChunk = alertsToProcess.slice(i, i + chunkSize);

        currentChunk.forEach(c => {
          const currentCycle = calculateServiceCycle(c.soldDate);
          const customerRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', c.id);
          
          // Log to subcollection
          const logRef = doc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', c.id, 'contactLog'));
          batch.set(logRef, {
            timestamp: serverTimestamp(),
            userId: currentUser.uid,
            username: currentUser.username,
            outcome: 'Bulk Cycle Reset',
            notes: `Maintenance reminders were reset to cycle ${currentCycle} (approx. ${currentCycle * 6} months from sale).`,
            appointmentSet: false
          });

          // Update customer document
          batch.update(customerRef, {
            lastServiceContact: serverTimestamp(),
            lastAcknowledgedCycle: currentCycle,
            serviceAlertTriggered: false,
            lastContactOutcome: 'Bulk Cycle Reset',
            lastContactUsername: currentUser.username,
            lastContactUserId: currentUser.uid
          });
        });

        await batch.commit();
        totalProcessed += currentChunk.length;
      }

      onRefresh(`Successfully reset service cycles for ${totalProcessed} customers.`, false);
    } catch (err) {
      console.error('Batch commit failed:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, 'customers/bulk-reset');
      } catch (formattedErr: any) {
        onRefresh(formattedErr.message, true);
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            Service Command Center
            {activeAlerts.length > 0 && (
              <span className="badge badge-error border-rose-500/30 px-3 py-1 text-xs">
                {activeAlerts.length} Attention Required
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-400 mt-1">Customers crossing the 6-month ownership milestone without recent service contact.</p>
        </div>
        
        {activeAlerts.length > 0 && (
          <button 
            onClick={handleResetAll}
            disabled={isResetting}
            className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm py-2 px-4 shadow-lg shadow-emerald-900/20 disabled:opacity-50"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {activeAlerts.length === 0 ? (
          <div className="lg:col-span-2 card-base p-12 text-center border-dashed border-slate-700 bg-transparent">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
              <History size={32} />
            </div>
            <h3 className="text-lg font-bold text-white">All Clear!</h3>
            <p className="text-slate-400 mt-1 max-w-md mx-auto">No pending service alerts. Every customer is accounted for and your pipeline is healthy.</p>
          </div>
        ) : (
          activeAlerts.map(customer => (
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
    </div>
  );
}
