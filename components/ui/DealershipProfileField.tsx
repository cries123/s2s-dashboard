import React from 'react';
import { Building2, Lock } from 'lucide-react';
import { DEALERSHIPS } from '../../constants';
import { getTenantProfile } from '../../lib/tenants';
import { resolveUserTenantId } from '../../lib/rbac';
import type { User } from '../../types';
import { cn } from '../../lib/utils';

interface DealershipProfileFieldProps {
  user: User | null | undefined;
  /** Active dashboard dealership (admin override). Falls back to user's enrolled dealership. */
  value?: string | null;
  onChange?: (dealershipId: string) => void;
  className?: string;
  label?: string;
}

export function DealershipProfileField({
  user,
  value,
  onChange,
  className,
  label = 'Dealership profile',
}: DealershipProfileFieldProps) {
  const isAdmin = user?.role === 'admin';
  const enrolledDealershipId = user?.dealershipId ?? null;
  const tenantId = resolveUserTenantId(user ?? undefined);
  const tenantProfile = getTenantProfile(tenantId);
  const displayValue = value ?? enrolledDealershipId ?? tenantProfile?.dealershipId ?? 'hyundai';
  const lockedDealership = DEALERSHIPS.find((d) => d.id === (enrolledDealershipId ?? displayValue));

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
        <Building2 size={12} className="text-brand-primary" />
        {label}
        {!isAdmin && <Lock size={10} className="text-amber-500/80" aria-hidden />}
      </label>

      {isAdmin ? (
        <select
          value={displayValue}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={user?.role !== 'admin'}
          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-brand-primary/40 outline-none"
        >
          {DEALERSHIPS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      ) : (
        <div
          className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2"
          aria-readonly
        >
          <span className="font-semibold truncate">{lockedDealership?.name ?? tenantProfile?.name ?? 'Assigned profile'}</span>
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-600 shrink-0">Locked</span>
        </div>
      )}

      <p className="text-[10px] text-slate-600 font-medium">
        {isAdmin
          ? 'System admins may switch dashboard context. Changes apply to the active session view.'
          : `Your tenant (${tenantProfile?.name ?? tenantId}) is fixed from enrollment and cannot be changed.`}
      </p>
    </div>
  );
}
