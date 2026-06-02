import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { User, UserDepartment, AuditLogEntry } from '../../../types';
import { cn } from '../../../lib/utils';
import {
  Users,
  Settings,
  ScrollText,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  Search,
} from 'lucide-react';
import {
  TENANT_PROFILES,
  TENANTS_COLLECTION_PATH,
  LOGS_COLLECTION_PATH,
  getTenantProfile,
} from '../../../lib/tenants';
import {
  buildUserApprovalPatch,
  canModifyUser,
  isPlatformAdmin,
  isPendingStaffEnrollment,
  isProtectedUser,
  normalizeUserProfile,
  resolveUserTenantId,
  userBelongsToTenant,
} from '../../../lib/rbac';
import { logAuditAction } from '../../../services/loggingService';
import { DMS_PROVIDERS, DEFAULT_DMS_PROVIDER, normalizeDmsProvider, type DmsProviderId } from '../../../constants/dmsProviders';

type ManagerTab = 'users' | 'settings' | 'logs';

interface ManagerDashboardProps {
  activeSubTab?: ManagerTab;
  onChangeSubTab?: (tab: ManagerTab) => void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export default function ManagerDashboard({
  activeSubTab = 'users',
  onChangeSubTab,
  onSuccess,
  onError,
}: ManagerDashboardProps) {
  const [internalSubTab, setInternalSubTab] = useState<ManagerTab>(activeSubTab);

  useEffect(() => {
    setInternalSubTab(activeSubTab);
  }, [activeSubTab]);

  const subTab = onChangeSubTab ? activeSubTab : internalSubTab;
  const handleSubTabChange = (tab: ManagerTab) => {
    if (onChangeSubTab) onChangeSubTab(tab);
    else setInternalSubTab(tab);
  };
  const { user: currentUser } = useAuth();
  const tenantId = resolveUserTenantId(currentUser);
  const tenantProfile = getTenantProfile(tenantId);

  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [dmsProvider, setDmsProvider] = useState<DmsProviderId>(normalizeDmsProvider(tenantProfile?.dmsProvider));
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingDms, setSavingDms] = useState(false);

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

  useEffect(() => {
    if (!currentUser) return;

    const usersRef = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users');
    const usersQuery = isPlatformAdmin(currentUser)
      ? query(usersRef)
      : query(usersRef, where('tenantId', '==', tenantId));

    const unsubUsers = onSnapshot(usersQuery, (snap) => {
      const rows = snap.docs.map((d) => normalizeUserProfile({ uid: d.id, ...d.data() }));
      setUsers(rows.filter((u) => userBelongsToTenant(u, tenantId)));
      setLoadingUsers(false);
    }, () => setLoadingUsers(false));

    return () => unsubUsers();
  }, [currentUser, tenantId, tenantProfile?.dealershipId]);

  useEffect(() => {
    if (!currentUser || !tenantId) return;

    const logsQuery = query(
      collection(db, ...LOGS_COLLECTION_PATH),
      where('tenantId', '==', tenantId),
      orderBy('timestamp', 'desc'),
      limit(150)
    );

    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry)));
      setLoadingLogs(false);
    }, () => setLoadingLogs(false));

    return () => unsubLogs();
  }, [currentUser, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const tenantRef = doc(db, ...TENANTS_COLLECTION_PATH, tenantId);
    const unsub = onSnapshot(tenantRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.dmsProvider) setDmsProvider(normalizeDmsProvider(data.dmsProvider as string));
      }
    });
    return () => unsub();
  }, [tenantId]);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const revokePendingEnrollment = async (target: User) => {
    if (!currentUser) return;
    if (isProtectedUser(target) || !canModifyUser(currentUser, target)) {
      onError?.('This enrollment cannot be revoked.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid));
      await logAuditAction('Revoke Enrollment', `Removed pending enrollment for ${target.username}`, tenantId, currentUser);
      onSuccess?.(`${target.username} removed from pending enrollments.`);
    } catch (err: any) {
      onError?.(err.message || 'Failed to revoke enrollment');
    }
  };

  const removeUser = async (target: User) => {
    if (!currentUser) return;
    if (isProtectedUser(target) || !canModifyUser(currentUser, target)) {
      onError?.('This user cannot be removed.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid));
      await logAuditAction('Remove User', `Removed user ${target.username}`, tenantId, currentUser);
      onSuccess?.(`${target.username} removed.`);
    } catch (err: any) {
      onError?.(err.message || 'Failed to remove user');
    }
  };

  const setApproval = async (target: User, approved: boolean) => {
    if (!currentUser) return;
    if (target.uid === currentUser.uid || isProtectedUser(target)) {
      onError?.('This account cannot be modified.');
      return;
    }
    if (!canModifyUser(currentUser, target)) {
      onError?.('You can only manage sales and service enrollments for your dealership.');
      return;
    }
    if (approved && !isPendingStaffEnrollment(target)) {
      onError?.('Only pending sales and service enrollments can be approved here.');
      return;
    }
    if (!approved) {
      await revokePendingEnrollment(target);
      return;
    }
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid);
      await updateDoc(
        userRef,
        buildUserApprovalPatch(target, approved ? 'approved' : 'pending')
      );
      await logAuditAction(
        approved ? 'Approve User' : 'Revoke User Access',
        `${target.username} (${target.email}) approval set to ${approved}`,
        tenantId,
        currentUser
      );
      onSuccess?.(approved ? `Approved ${target.username}` : `Revoked access for ${target.username}`);
    } catch (err: any) {
      onError?.(err.message || 'Failed to update user');
    }
  };

  const setUserRole = async (target: User, role: 'advisor' | 'manager' | 'pending') => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid);
      await updateDoc(userRef, {
        role,
        isManager: role === 'manager',
        approved: role !== 'pending',
        status: role === 'pending' ? 'pending' : 'approved',
      });
      await logAuditAction('Change User Role', `${target.username} role → ${role}`, tenantId, currentUser);
      onSuccess?.(`Updated role for ${target.username}`);
    } catch (err: any) {
      onError?.(err.message || 'Failed to update role');
    }
  };

  const setUserDepartment = async (target: User, department: UserDepartment) => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid);
      await updateDoc(userRef, { department });
      await logAuditAction('Change Department', `${target.username} department → ${department}`, tenantId, currentUser);
      onSuccess?.(`Updated department for ${target.username}`);
    } catch (err: any) {
      onError?.(err.message || 'Failed to update department');
    }
  };

  const saveDmsProvider = async () => {
    if (!currentUser || !tenantId) return;
    setSavingDms(true);
    try {
      await setDoc(
        doc(db, ...TENANTS_COLLECTION_PATH, tenantId),
        { tenantId, name: tenantProfile?.name || tenantId, dmsProvider, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await logAuditAction('Update Tenant DMS', `DMS provider set to ${dmsProvider}`, tenantId, currentUser);
      onSuccess?.('Tenant DMS settings saved');
    } catch (err: any) {
      onError?.(err.message || 'Failed to save DMS settings');
    } finally {
      setSavingDms(false);
    }
  };

  const pendingUsers = filteredUsers.filter((u) => isPendingStaffEnrollment(u));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest block mb-1">Manager Control Panel</span>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">{tenantProfile?.name || tenantId}</h1>
          <p className="text-slate-500 text-sm mt-1">Tenant-scoped user management, DMS config, and audit trail</p>
        </div>
        <div className="flex gap-2 p-1 bg-slate-900/80 border border-white/5 rounded-xl">
          {([
            { id: 'users' as const, label: 'Users', icon: Users },
            { id: 'settings' as const, label: 'Tenant Settings', icon: Settings },
            { id: 'logs' as const, label: 'Audit Logs', icon: ScrollText },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSubTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                subTab === tab.id ? 'bg-brand-primary text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'users' && (
        <div className="space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="input-field pl-11 w-full"
            />
          </div>

          {pendingUsers.length > 0 && (
            <div className="card-base p-6 border-amber-500/20 bg-amber-500/5">
              <h3 className="text-sm font-black text-amber-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Shield size={16} /> Pending Approval ({pendingUsers.length})
              </h3>
              <div className="space-y-3">
                {pendingUsers.map((u) => (
                  <div key={u.uid} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900/60 rounded-xl border border-white/5">
                    <div>
                      <p className="font-bold text-white">{u.username}</p>
                      <p className="text-xs text-slate-500">{u.email} · {u.department || '—'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setApproval(u, true)} className="btn-primary py-2 px-4 text-[10px] flex items-center gap-1">
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button type="button" onClick={() => revokePendingEnrollment(u)} className="py-2 px-4 text-[10px] font-black uppercase rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 flex items-center gap-1">
                        <XCircle size={14} /> Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-base overflow-hidden">
            {loadingUsers ? (
              <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-brand-primary" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <th className="p-4">User</th>
                      <th className="p-4">Department</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.uid} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="p-4">
                          <p className="font-bold text-white text-sm">{u.username}</p>
                          <p className="text-[10px] text-slate-500">{u.email}</p>
                        </td>
                        <td className="p-4">
                          <select
                            value={u.department || 'service'}
                            onChange={(e) => setUserDepartment(u, e.target.value as UserDepartment)}
                            className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                          >
                            <option value="sales">Sales</option>
                            <option value="service">Service</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <select
                            value={u.role === 'Manager' ? 'manager' : u.role}
                            onChange={(e) => setUserRole(u, e.target.value as 'advisor' | 'manager' | 'pending')}
                            className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                          >
                            <option value="pending">Pending</option>
                            <option value="advisor">Advisor</option>
                            <option value="manager">Manager</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            'text-[10px] font-black uppercase px-2 py-1 rounded-full',
                            u.approved !== false && u.status !== 'pending' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          )}>
                            {u.approved !== false && u.status !== 'pending' ? 'Approved' : 'Pending'}
                          </span>
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => setApproval(u, !(u.approved !== false && u.status !== 'pending'))}
                            className="text-[10px] font-black uppercase text-brand-primary hover:underline"
                          >
                            Toggle Approval
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'settings' && (
        <div className="card-base p-8 max-w-lg">
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6">Tenant DMS Configuration</h3>
          <p className="text-xs text-slate-500 mb-4">Applies only to <span className="text-white font-bold">{tenantProfile?.name}</span></p>
          <label className="input-label">DMS Provider</label>
          <select
            value={dmsProvider}
            onChange={(e) => setDmsProvider(e.target.value as DmsProviderId)}
            className="input-field w-full mb-6"
          >
            {DMS_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
            {DMS_PROVIDERS.find((p) => p.id === dmsProvider)?.description}
          </p>
          <button type="button" onClick={saveDmsProvider} disabled={savingDms} className="btn-primary w-full py-3">
            {savingDms ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Save Tenant Settings'}
          </button>
        </div>
      )}

      {subTab === 'logs' && (
        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Audit Logs — {tenantId}</h3>
            <p className="text-[10px] text-slate-500 mt-1">Isolated to your tenant only</p>
          </div>
          {loadingLogs ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-brand-primary" /></div>
          ) : logs.length === 0 ? (
            <p className="p-8 text-center text-slate-500 text-sm">No audit entries yet for this tenant.</p>
          ) : (
            <div className="max-h-[520px] overflow-y-auto divide-y divide-white/5">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-white/[0.02]">
                  <div className="flex justify-between gap-4 mb-1">
                    <span className="text-xs font-black text-brand-primary uppercase">{log.action}</span>
                    <span className="text-[10px] text-slate-600 font-mono">
                      {log.timestamp?.toDate?.()?.toLocaleString?.() || '—'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{log.details}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{log.username || log.userEmail} · {log.userId?.slice(0, 8)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
