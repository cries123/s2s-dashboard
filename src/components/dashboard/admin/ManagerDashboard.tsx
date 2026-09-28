import React from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { getTenantProfile } from '../../../lib/tenants';
import { resolveScopeTenantId } from '../../../lib/rbac';
import { PageHeader } from '../../layout/PageHeader';
import { MasterUserSettings } from './MasterUserSettings';
import { AdminEnrollmentQueue } from './AdminEnrollmentQueue';

interface ManagerDashboardProps {
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Manager → Team. This page used to carry its own "Users / Tenant Settings /
 * Audit Logs" tab bar, which wrapped onto two lines on a phone and duplicated
 * two other pages: the DMS picker already lives on Operation settings, and the
 * store's log on Manager → Logs. It is now just the team.
 */
export default function ManagerDashboard({ currentDealershipId, onSuccess, onError }: ManagerDashboardProps) {
  const { user: currentUser } = useAuth();
  const tenantId = resolveScopeTenantId(currentUser, currentDealershipId);
  const tenantProfile = getTenantProfile(tenantId);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Team"
        description={`Approve new staff and manage what each person can see${tenantProfile?.name ? ` at ${tenantProfile.name}` : ''}.`}
        breadcrumbs={[{ label: 'Manager' }, { label: 'Team' }]}
      />
      <AdminEnrollmentQueue scopeTenantId={tenantId} onSuccess={onSuccess} onError={onError} />
      <MasterUserSettings managerMode scopeTenantId={tenantId} onSuccess={onSuccess} onError={onError} />
    </div>
  );
}
