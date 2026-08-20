import React, { useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import {
  TENANT_PROFILES,
  TENANTS_COLLECTION_PATH,
  getTenantProfile,
} from '../../../lib/tenants';
import {
  resolveScopeTenantId,
} from '../../../lib/rbac';
import { MasterUserSettings } from './MasterUserSettings';
import { AdminEnrollmentQueue } from './AdminEnrollmentQueue';

interface ManagerDashboardProps {
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export default function ManagerDashboard({
  currentDealershipId,
  onSuccess,
  onError,
}: ManagerDashboardProps) {
  const { user: currentUser } = useAuth();
  const tenantId = resolveScopeTenantId(currentUser, currentDealershipId);
  const tenantProfile = getTenantProfile(tenantId);

  useEffect(() => {
    if (!currentUser || !tenantId) return;

    TENANT_PROFILES.forEach((t) => {
      setDoc(
        doc(db, ...TENANTS_COLLECTION_PATH, t.tenantId),
        {
          tenantId: t.tenantId,
          name: t.name,
          dmsProvider: t.dmsProvider,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});
    });
  }, [currentUser, tenantId]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest block mb-1">Manager Control Panel</span>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-wider">{tenantProfile?.name || tenantId}</h1>
        <p className="text-slate-500 text-sm mt-1">Dealership user administration and enrollments. DMS provider now lives under Operations → Store &amp; DMS, and the audit trail is under Logs.</p>
      </div>

      <AdminEnrollmentQueue
        scopeTenantId={tenantId}
        onSuccess={onSuccess}
        onError={onError}
      />
      <MasterUserSettings
        managerMode
        scopeTenantId={tenantId}
        onSuccess={onSuccess}
        onError={onError}
      />
    </div>
  );
}
