import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  Users,
  Search,
  Loader2,
  Mail,
  KeyRound,
  Shield,
  Trash2,
  Save,
  X,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { auth, db } from '../../../firebase';
import { User } from '../../../types';
import { cn } from '../../../lib/utils';
import { DEALERSHIPS } from '../../../constants';
import { TENANT_PROFILES, dealershipIdFromTenantId, getTenantProfile } from '../../../lib/tenants';
import {
  buildMasterPermissionPatch,
  buildUserApprovalPatch,
  canModifyUser,
  isPendingStaffEnrollment,
  isPendingUser,
  isProtectedUser,
  isPlatformAdmin,
  masterPermissionFromUser,
  type MasterPermissionRole,
} from '../../../lib/rbac';
import { preferencesFromTemplate, getStaffRoleTemplate } from '../../../lib/roleTemplates';
import { StaffRoleTemplatePicker } from './StaffRoleTemplatePicker';
import type { StaffRoleTemplateId, StoreWorkspaceDefaults } from '../../../types';
import { subscribeTenantUsers } from '../../../lib/userDirectory';
import { logSystemAction } from '../../../services/loggingService';
import { useAuth } from '../../../hooks/useAuth';
import {
  masterUserAuthorizePasswordReset,
  masterUserDeleteAuth,
  masterUserSetPassword,
  masterUserUpdateEmail,
} from '../../../lib/masterUserApi';

interface MasterUserSettingsProps {
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  /** When set, only users for this tenant are listed. */
  scopeTenantId?: string;
  /** Manager view: staff-only permissions, no auth email/password overrides. */
  managerMode?: boolean;
}

const PERMISSION_OPTIONS: { value: MasterPermissionRole; label: string }[] = [
  { value: 'admin', label: 'System Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'advisor-service', label: 'Service Advisor' },
  { value: 'advisor-sales', label: 'Sales Professional' },
  { value: 'pending', label: 'Pending / Revoked' },
];

const MANAGER_PERMISSION_OPTIONS = PERMISSION_OPTIONS.filter((opt) =>
  ['advisor-service', 'advisor-sales', 'pending'].includes(opt.value)
);

export function MasterUserSettings({
  onSuccess,
  onError,
  scopeTenantId,
  managerMode = false,
}: MasterUserSettingsProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>(scopeTenantId || 'all');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [jobTitleDraft, setJobTitleDraft] = useState('');
  const [tenantDraft, setTenantDraft] = useState('');
  const [permissionDraft, setPermissionDraft] = useState<MasterPermissionRole>('advisor-service');
  const [approvalTemplate, setApprovalTemplate] = useState<StaffRoleTemplateId>('service-advisor');
  const [storeDefaultsByDealership, setStoreDefaultsByDealership] = useState<
    Record<string, StoreWorkspaceDefaults>
  >({});
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  useEffect(() => {
    const settingsRef = collection(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'dealershipSettings'
    );
    const unsub = onSnapshot(settingsRef, (snap) => {
      const next: Record<string, StoreWorkspaceDefaults> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.storeWorkspaceDefaults) {
          next[d.id] = data.storeWorkspaceDefaults as StoreWorkspaceDefaults;
        }
      });
      setStoreDefaultsByDealership(next);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setTenantFilter(scopeTenantId || 'all');
  }, [scopeTenantId]);

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    const unsubscribe = subscribeTenantUsers(
      scopeTenantId,
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (error) => {
        console.error('MasterUserSettings list error:', error);
        onError?.('Could not load users. Confirm your account has list permissions.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, scopeTenantId, onError]);

  const selectedUser = useMemo(
    () => users.find((u) => u.uid === selectedUid) || null,
    [users, selectedUid]
  );

  useEffect(() => {
    if (!selectedUser) return;
    setEmailDraft(selectedUser.email || '');
    setUsernameDraft(selectedUser.username || '');
    setJobTitleDraft(selectedUser.jobTitle || '');
    setTenantDraft(selectedUser.tenantId || 'hyundai');
    setPermissionDraft(masterPermissionFromUser(selectedUser));
    setPasswordDraft('');
  }, [selectedUser]);

  const permissionOptions = managerMode ? MANAGER_PERMISSION_OPTIONS : PERMISSION_OPTIONS;
  const scopedTenantName = scopeTenantId
    ? getTenantProfile(scopeTenantId)?.name || scopeTenantId
    : null;

  const canEditTarget = (target: User) => {
    if (!currentUser || isProtectedUser(target)) return false;
    if (managerMode) return canModifyUser(currentUser, target);
    return true;
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.jobTitle?.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q);
    const effectiveTenant = scopeTenantId || tenantFilter;
    const matchesTenant = effectiveTenant === 'all' || u.tenantId === effectiveTenant;
    if (managerMode && !canModifyUser(currentUser, u) && !isPendingStaffEnrollment(u)) {
      return false;
    }
    return matchesSearch && matchesTenant;
  });

  const notify = (msg: string, isError = false) => {
    if (isError) onError?.(msg);
    else onSuccess?.(msg);
  };

  const saveProfile = async () => {
    if (!selectedUser || !currentUser) return;
    if (!canEditTarget(selectedUser)) {
      notify('You do not have permission to edit this account.', true);
      return;
    }

    setSaving(true);
    try {
      const dealershipId = dealershipIdFromTenantId(
        managerMode ? scopeTenantId || selectedUser.tenantId : tenantDraft
      );
      const permissionPatch = buildMasterPermissionPatch(permissionDraft);
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', selectedUser.uid);

      const firestorePatch: Record<string, unknown> = {
        username: usernameDraft.trim() || selectedUser.username,
        jobTitle: jobTitleDraft.trim(),
        tenantId: managerMode ? scopeTenantId || selectedUser.tenantId : tenantDraft,
        dealershipId,
        ...permissionPatch,
      };

      const emailChanged =
        !managerMode &&
        emailDraft.trim().toLowerCase() !== (selectedUser.email || '').trim().toLowerCase();

      if (emailChanged) {
        const newEmail = await masterUserUpdateEmail(selectedUser.uid, emailDraft.trim());
        firestorePatch.email = newEmail;
      }

      await updateDoc(userRef, firestorePatch);

      await logSystemAction(
        'Master User Updated',
        `Updated profile for ${usernameDraft || selectedUser.username} (${selectedUser.uid})`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );

      notify('User profile saved.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save user';
      notify(message, true);
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async (target: User) => {
    if (!currentUser || managerMode) return;
    if (isProtectedUser(target)) {
      notify('This account is protected.', true);
      return;
    }
    if (!target.email) {
      notify('User has no email on file.', true);
      return;
    }

    setSaving(true);
    try {
      const email = await masterUserAuthorizePasswordReset(target.uid);
      await sendPasswordResetEmail(auth, email);
      await logSystemAction(
        'Password Reset Sent',
        `Password reset email sent to ${email}`,
        'auth',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );
      notify(`Password reset email sent to ${email}.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to send password reset';
      notify(message, true);
    } finally {
      setSaving(false);
    }
  };

  const applyNewPassword = async () => {
    if (!selectedUser || !currentUser || managerMode) return;
    if (isProtectedUser(selectedUser)) {
      notify('This account is protected.', true);
      return;
    }
    if (passwordDraft.length < 8) {
      notify('Password must be at least 8 characters.', true);
      return;
    }

    setSaving(true);
    try {
      await masterUserSetPassword(selectedUser.uid, passwordDraft);
      await logSystemAction(
        'Password Reset (Admin)',
        `Administrator set a new password for ${selectedUser.email || selectedUser.uid}`,
        'auth',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );
      setPasswordDraft('');
      notify('Password updated successfully.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to set password';
      notify(message, true);
    } finally {
      setSaving(false);
    }
  };

  const approveUser = async (target: User) => {
    if (!currentUser) return;
    if (!canEditTarget(target)) {
      notify('You do not have permission to approve this account.', true);
      return;
    }
    setSaving(true);
    try {
      const template = getStaffRoleTemplate(approvalTemplate);
      const dealershipId =
        target.dealershipId ||
        dealershipIdFromTenantId(scopeTenantId || target.tenantId) ||
        'hyundai';
      const prefs = preferencesFromTemplate(
        approvalTemplate,
        storeDefaultsByDealership[dealershipId]
      );
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid);
      await updateDoc(userRef, {
        ...buildUserApprovalPatch(target, 'approved'),
        ...buildMasterPermissionPatch(template.permission),
        jobTitle: template.jobTitle,
        department: template.permission === 'advisor-sales' ? 'sales' : 'service',
        preferences: prefs,
      });
      await logSystemAction(
        'Enrollment Approved',
        `Approved ${target.username} as ${template.label} with workspace template`,
        'settings',
        currentUser.email,
        currentUser.username,
        dealershipId
      );
      notify(`${target.username} approved as ${template.label}.`);
    } catch {
      notify('Failed to approve user.', true);
    } finally {
      setSaving(false);
    }
  };

  const deleteUserCompletely = async (target: User) => {
    if (!currentUser || managerMode) return;
    if (isProtectedUser(target)) {
      notify('This account is protected.', true);
      return;
    }

    setSaving(true);
    try {
      try {
        await masterUserDeleteAuth(target.uid);
      } catch (authErr) {
        console.warn('Auth delete skipped or failed:', authErr);
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid);
      await deleteDoc(userRef);

      await logSystemAction(
        'Master User Deleted',
        `Deleted user ${target.username} (${target.email || target.uid})`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );

      if (selectedUid === target.uid) setSelectedUid(null);
      setConfirmDeleteUid(null);
      notify('User removed from Firestore and authentication.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete user';
      notify(message, true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-brand-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 text-brand-primary text-[9px] font-black uppercase tracking-[0.25em] mb-1.5">
          <Shield size={12} />
          {managerMode ? 'Dealership team' : scopeTenantId ? 'User administration' : 'Platform administration'}
        </div>
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">
          {managerMode
            ? 'Team approvals & staff'
            : scopeTenantId
              ? `${scopedTenantName} users`
              : 'Master User Settings'}
        </h2>
        <p className="text-xs text-slate-500 mt-2 max-w-2xl">
          {managerMode
            ? 'Approve enrollments and update permissions for sales and service staff at this store.'
            : scopeTenantId
              ? 'All program users for this dealership — reset passwords, change email, and set permissions.'
              : 'View and edit every account across all dealerships. Email changes and password resets require the server admin SDK (FIREBASE_SERVICE_ACCOUNT_JSON).'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-primary" size={14} />
          <input
            type="text"
            placeholder="Search name, email, UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>
        {!scopeTenantId ? (
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white min-w-[200px]"
          >
            <option value="all">All tenants</option>
            {TENANT_PROFILES.map((t) => (
              <option key={t.tenantId} value={t.tenantId}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center px-2">
          {filteredUsers.length} users
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2 card-base border border-white/5 overflow-hidden max-h-[640px] flex flex-col">
          <div className="overflow-y-auto divide-y divide-slate-800">
            {filteredUsers.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => setSelectedUid(u.uid)}
                className={cn(
                  'w-full text-left p-4 hover:bg-slate-900/50 transition-colors',
                  selectedUid === u.uid && 'bg-brand-primary/10 border-l-2 border-brand-primary'
                )}
              >
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{u.username}</p>
                    <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                  </div>
                  <span
                    className={cn(
                      'text-[8px] font-black uppercase px-2 py-0.5 rounded shrink-0 h-fit',
                      isPendingUser(u) ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    )}
                  >
                    {isPendingUser(u) ? 'Pending' : 'Active'}
                  </span>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="text-[8px] font-black uppercase text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">
                    {masterPermissionFromUser(u).replace('-', ' ')}
                  </span>
                  <span className="text-[8px] font-black uppercase text-slate-500">
                    {DEALERSHIPS.find((d) => d.id === u.dealershipId)?.name.split(' ')[0] || u.tenantId}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="xl:col-span-3 card-base border border-white/5 p-6 space-y-5">
          {!selectedUser ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              <Users className="mx-auto mb-3 opacity-40" size={32} />
              Select a user to edit permissions, email, or password.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white uppercase">{selectedUser.username}</h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">{selectedUser.uid}</p>
                </div>
                {isProtectedUser(selectedUser) && (
                  <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                    Protected
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Display name</label>
                  <input
                    className="input-field w-full"
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    disabled={!canEditTarget(selectedUser)}
                  />
                </div>
                <div>
                  <label className="input-label">Job title</label>
                  <input
                    className="input-field w-full"
                    value={jobTitleDraft}
                    onChange={(e) => setJobTitleDraft(e.target.value)}
                    disabled={!canEditTarget(selectedUser)}
                  />
                </div>
                {!managerMode ? (
                  <div className="sm:col-span-2">
                    <label className="input-label flex items-center gap-1">
                      <Mail size={12} /> Email (login)
                    </label>
                    <input
                      type="email"
                      className="input-field w-full"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      disabled={!canEditTarget(selectedUser)}
                    />
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <label className="input-label flex items-center gap-1">
                      <Mail size={12} /> Email
                    </label>
                    <p className="text-sm text-slate-400 font-mono">{selectedUser.email || '—'}</p>
                  </div>
                )}
                {!managerMode ? (
                  <div className="sm:col-span-2">
                    <label className="input-label flex items-center gap-1">
                      <Building2 size={12} /> Tenant / dealership
                    </label>
                    <select
                      className="input-field w-full"
                      value={tenantDraft}
                      onChange={(e) => setTenantDraft(e.target.value)}
                      disabled={!canEditTarget(selectedUser) || !!scopeTenantId}
                    >
                      {TENANT_PROFILES.map((t) => (
                        <option key={t.tenantId} value={t.tenantId}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <label className="input-label flex items-center gap-1">
                    <Shield size={12} /> Permissions
                  </label>
                  <select
                    className="input-field w-full"
                    value={permissionDraft}
                    onChange={(e) => setPermissionDraft(e.target.value as MasterPermissionRole)}
                    disabled={!canEditTarget(selectedUser)}
                  >
                    {permissionOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isPendingUser(selectedUser) && canEditTarget(selectedUser) && (
                <StaffRoleTemplatePicker
                  value={approvalTemplate}
                  onChange={setApprovalTemplate}
                  disabled={saving}
                />
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving || !canEditTarget(selectedUser)}
                  onClick={saveProfile}
                  className="btn-primary px-4 py-2 text-[10px] font-black uppercase flex items-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save profile
                </button>
                {isPendingUser(selectedUser) && canEditTarget(selectedUser) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => approveUser(selectedUser)}
                    className="px-4 py-2 text-[10px] font-black uppercase rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  >
                    Approve enrollment
                  </button>
                )}
                {!managerMode ? (
                  <button
                    type="button"
                    disabled={saving || !canEditTarget(selectedUser)}
                    onClick={() => sendPasswordReset(selectedUser)}
                    className="px-4 py-2 text-[10px] font-black uppercase rounded-xl bg-slate-800 text-white border border-slate-700 flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Send reset email
                  </button>
                ) : null}
              </div>

              {!managerMode ? (
                <div className="pt-4 border-t border-white/5 space-y-3">
                  <label className="input-label flex items-center gap-1">
                    <KeyRound size={12} /> Set new password (admin override)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className="input-field flex-1"
                      placeholder="Minimum 8 characters"
                      value={passwordDraft}
                      onChange={(e) => setPasswordDraft(e.target.value)}
                      disabled={!canEditTarget(selectedUser)}
                    />
                    <button
                      type="button"
                      disabled={saving || !canEditTarget(selectedUser) || passwordDraft.length < 8}
                      onClick={applyNewPassword}
                      className="px-4 py-2 text-[10px] font-black uppercase rounded-xl bg-brand-primary/20 text-brand-primary border border-brand-primary/30"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}

              {!managerMode ? (
                <div className="pt-4 border-t border-white/5">
                  {confirmDeleteUid === selectedUser.uid ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-rose-400 font-bold">Permanently delete this user?</span>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteUid(null)}
                        className="text-[10px] font-black uppercase text-slate-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => deleteUserCompletely(selectedUser)}
                        className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-black uppercase rounded-lg"
                      >
                        Confirm delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isProtectedUser(selectedUser)}
                      onClick={() => setConfirmDeleteUid(selectedUser.uid)}
                      className="text-[10px] font-black uppercase text-rose-400 hover:text-rose-300 flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      Delete user (auth + profile)
                    </button>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MasterUserSettings;
