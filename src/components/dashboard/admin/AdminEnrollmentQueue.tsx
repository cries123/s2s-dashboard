import React, { useEffect, useMemo, useState } from 'react';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { User } from '../../../types';
import { cn } from '../../../lib/utils';
import { DEALERSHIPS } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import {
  buildUserApprovalPatch,
  isPendingManagerEnrollment,
  isPendingStaffEnrollment,
  isPendingUser,
  isProtectedUser,
  normalizeUserProfile,
} from '../../../lib/rbac';
import { subscribeTenantUsers } from '../../../lib/userDirectory';
import { logSystemAction } from '../../../services/loggingService';
import { Loader2, Shield, UserCheck, UserX, Users } from 'lucide-react';

interface AdminEnrollmentQueueProps {
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export function AdminEnrollmentQueue({ onSuccess, onError }: AdminEnrollmentQueueProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingUid, setActingUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeTenantUsers(
      undefined,
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const pendingManagers = useMemo(
    () => users.filter((u) => isPendingManagerEnrollment(u)),
    [users]
  );

  const pendingStaff = useMemo(
    () => users.filter((u) => isPendingStaffEnrollment(u)),
    [users]
  );

  const dealershipName = (id?: string) =>
    DEALERSHIPS.find((d) => d.id === id)?.name || id || 'Unknown store';

  const approveUser = async (target: User) => {
    if (!currentUser || isProtectedUser(target)) return;
    setActingUid(target.uid);
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid);
      await updateDoc(userRef, buildUserApprovalPatch(target, 'approved'));
      await logSystemAction(
        'Enrollment Approved',
        `Approved ${target.username} (${target.email})`,
        'settings',
        currentUser.email,
        currentUser.username,
        target.dealershipId
      );
      onSuccess?.(`Approved ${target.username}.`);
    } catch {
      onError?.('Failed to approve enrollment.');
    } finally {
      setActingUid(null);
    }
  };

  const revokeUser = async (target: User) => {
    if (!currentUser || isProtectedUser(target)) return;
    setActingUid(target.uid);
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', target.uid);
      await deleteDoc(userRef);
      await logSystemAction(
        'Enrollment Revoked',
        `Removed pending enrollment for ${target.username} (${target.email})`,
        'settings',
        currentUser.email,
        currentUser.username,
        target.dealershipId
      );
      onSuccess?.(`Removed ${target.username} from pending enrollments.`);
    } catch {
      onError?.('Failed to revoke enrollment.');
    } finally {
      setActingUid(null);
    }
  };

  const renderQueue = (
    title: string,
    description: string,
    queue: User[],
    accent: 'violet' | 'sky'
  ) => (
    <section className="card-base rounded-3xl border border-white/5 overflow-hidden">
      <div className="p-5 border-b border-white/5 bg-slate-950/40">
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} className={accent === 'violet' ? 'text-violet-400' : 'text-sky-400'} />
          <h2 className="text-sm font-black text-white uppercase tracking-wider">{title}</h2>
          <span
            className={cn(
              'ml-auto text-[10px] font-black uppercase px-2 py-0.5 rounded-full',
              accent === 'violet' ? 'bg-violet-500/15 text-violet-300' : 'bg-sky-500/15 text-sky-300'
            )}
          >
            {queue.length} pending
          </span>
        </div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {queue.length === 0 ? (
        <p className="p-6 text-sm text-slate-500 text-center">No pending enrollments in this queue.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {queue.map((u) => (
            <li key={u.uid} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white truncate">{u.username || u.email}</p>
                <p className="text-xs text-slate-500 truncate">{u.email}</p>
                <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wider">
                  {dealershipName(u.dealershipId)} · {u.jobTitle || '—'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={actingUid === u.uid}
                  onClick={() => approveUser(u)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase"
                >
                  {actingUid === u.uid ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actingUid === u.uid}
                  onClick={() => revokeUser(u)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase"
                >
                  <UserX size={12} />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-brand-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-500/20 bg-violet-950/20 p-4 flex gap-3">
        <Shield size={18} className="text-violet-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Manager enrollments require system admin approval. Staff enrollments (sales and service) are
          approved by store managers under Manager → Team approvals.
        </p>
      </div>
      {renderQueue(
        'Manager enrollment queue',
        'Pending accounts that enrolled with manager permissions.',
        pendingManagers,
        'violet'
      )}
      {renderQueue(
        'Staff enrollment reference',
        'Pending sales and service enrollments — managers approve these from their team panel. Shown here for visibility only.',
        pendingStaff,
        'sky'
      )}
    </div>
  );
}

export default AdminEnrollmentQueue;
