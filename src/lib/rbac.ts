import type { User, UserDepartment, UserRole } from '../types';
import {
  dealershipIdFromTenantId,
  getTenantProfile,
  tenantIdFromDealershipId,
  type TenantId,
} from './tenants';

/** Platform super-admin (legacy admin role). */
export function isPlatformAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

export function isManager(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  return user.role === 'manager' || user.role === 'Manager' || user.isManager === true;
}

export function isAdvisor(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'advisor' || user.role === 'Staff' || user.role === 'Salesperson' || user.role === 'Service Advisor';
}

/** Resolve canonical tenant id from a user record (handles legacy dealershipId-only docs). */
export function resolveUserTenantId(user: Pick<User, 'tenantId' | 'dealershipId'> | null | undefined): TenantId {
  if (!user) return 'hyundai';
  if (user.tenantId && getTenantProfile(user.tenantId)) {
    return user.tenantId as TenantId;
  }
  return tenantIdFromDealershipId(user.dealershipId);
}

export function userBelongsToTenant(
  user: Pick<User, 'tenantId' | 'dealershipId'> | null | undefined,
  tenantId: string
): boolean {
  return resolveUserTenantId(user) === tenantId;
}

export function resolveUserDealershipId(user: User | null | undefined): string {
  if (!user) return 'hyundai';
  if (user.dealershipId) return user.dealershipId;
  return dealershipIdFromTenantId(resolveUserTenantId(user));
}

export function isPendingUser(user: User | null | undefined): boolean {
  if (!user) return true;
  if (isPlatformAdmin(user) || isPrimaryAdmin(user)) return false;
  if (user.status === 'rejected') return true;
  if (user.approved === true || user.status === 'approved') return false;
  if (user.role === 'pending') return true;
  if (user.approved === false) return true;
  if (user.status === 'pending') return true;
  return false;
}

export function isUserApproved(user: User | null | undefined): boolean {
  return !isPendingUser(user);
}

export function resolveUserDepartment(user: User | null | undefined): UserDepartment {
  if (!user) return 'service';
  if (user.department === 'sales' || user.department === 'service') {
    return user.department;
  }
  const title = (user.jobTitle || '').toLowerCase();
  if (title.includes('sales')) return 'sales';
  if (title.includes('service') || title.includes('advisor')) return 'service';
  return 'service';
}

/** Sales staff: Sales nav + Sales Performance report only. */
export function canSeeServiceNav(user: User | null | undefined): boolean {
  if (isPlatformAdmin(user)) return true;
  return resolveUserDepartment(user) === 'service';
}

export function canSeeSalesNav(user: User | null | undefined): boolean {
  return isUserApproved(user);
}

export function canSeeReportsNav(user: User | null | undefined): boolean {
  return isUserApproved(user);
}

export function canSeeOperationsReport(user: User | null | undefined): boolean {
  return canSeeServiceNav(user);
}

export function canSeeForecastReport(user: User | null | undefined): boolean {
  return canSeeServiceNav(user);
}

export function canSeeSalesPerformanceReport(user: User | null | undefined): boolean {
  return isUserApproved(user);
}

export function canSeeManagerPanel(user: User | null | undefined): boolean {
  return isManager(user) && isUserApproved(user);
}

export function canSeeAdminPanel(user: User | null | undefined): boolean {
  return canAccessPrimaryAdminSettings(user);
}

export function canSeeCompetitions(user: User | null | undefined, tenantId: string): boolean {
  if (tenantId !== 'hyundai') return false;
  return canSeeServiceNav(user);
}

/** Patch applied when a manager or admin approves / rejects enrollment. */
export function buildUserApprovalPatch(
  target: Pick<User, 'role' | 'isManager' | 'status'>,
  decision: User['status']
): Partial<User> {
  if (decision === 'approved') {
    const promoteToManager =
      target.role === 'manager' || target.role === 'Manager' || target.isManager === true;
    const nextRole: UserRole = promoteToManager ? 'manager' : 'advisor';
    return {
      status: 'approved',
      approved: true,
      role: target.role === 'pending' || target.role === 'Staff' ? nextRole : nextRole,
      isManager: promoteToManager,
    };
  }
  if (decision === 'rejected') {
    return { status: 'rejected', approved: false };
  }
  return { status: 'pending', approved: false, role: 'pending' };
}

/** Normalize legacy Firestore user docs into RBAC fields. */
export function normalizeUserProfile(raw: Record<string, unknown> & { uid: string }): User {
  const legacyRole = raw.role as string | undefined;
  const legacyStatus = raw.status as string | undefined;
  const dealershipId =
    (raw.dealershipId as string) ||
    dealershipIdFromTenantId(raw.tenantId as string);

  let approved = raw.approved as boolean | undefined;
  if (approved === undefined) {
    approved = legacyStatus === 'approved' || legacyRole === 'admin';
  }

  let role: UserRole = 'advisor';
  if (legacyRole === 'admin') role = 'admin';
  else if (legacyRole === 'manager' || legacyRole === 'Manager' || raw.isManager) role = 'manager';
  else if (!approved && (legacyRole === 'pending' || legacyStatus === 'pending')) role = 'pending';
  else role = 'advisor';

  let department = raw.department as UserDepartment | undefined;
  if (!department) {
    const title = ((raw.jobTitle as string) || '').toLowerCase();
    department = title.includes('sales') ? 'sales' : 'service';
  }

  const tenantId =
    (raw.tenantId as string) ||
    (dealershipId === 'nissan'
      ? 'nissan-mazda'
      : dealershipId === 'ford'
        ? 'ford-lincoln'
        : 'hyundai');

  return {
    uid: raw.uid,
    email: (raw.email as string) || '',
    username: (raw.username as string) || (raw.email as string) || 'User',
    role,
    department,
    approved,
    tenantId,
    dealershipId,
    jobTitle: (raw.jobTitle as string) || '',
    status: approved ? 'approved' : legacyStatus === 'rejected' ? 'rejected' : 'pending',
    isManager: role === 'manager' || role === 'admin' || raw.isManager === true,
    createdAt: raw.createdAt as User['createdAt'],
  };
}

export const PRIMARY_ADMIN_EMAIL = 'admin@hyundai.com';

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isPrimaryAdmin(user: Pick<User, 'email'> | null | undefined): boolean {
  return normalizeEmail(user?.email) === PRIMARY_ADMIN_EMAIL;
}

export function isProtectedUser(user: Pick<User, 'email'> | null | undefined): boolean {
  return isPrimaryAdmin(user);
}

export function canAccessPrimaryAdminSettings(user: User | null | undefined): boolean {
  return isPrimaryAdmin(user) || isPlatformAdmin(user);
}

export function canSwitchDealership(user: User | null | undefined): boolean {
  if (!user) return false;
  return isPrimaryAdmin(user) || isPlatformAdmin(user) || user.role === 'admin';
}

export function isPendingManagerEnrollment(user: User): boolean {
  return (
    isPendingUser(user) &&
    (user.isManager === true || user.role === 'manager' || user.role === 'Manager')
  );
}

export function isPendingStaffEnrollment(user: User): boolean {
  return isPendingUser(user) && !isPendingManagerEnrollment(user);
}

export function resolveScopeTenantId(
  actor: User | null | undefined,
  currentDealershipId?: string | null
): TenantId {
  if (canSwitchDealership(actor) && currentDealershipId) {
    return tenantIdFromDealershipId(currentDealershipId);
  }
  return resolveUserTenantId(actor);
}

export function canModifyUser(actor: User | null | undefined, target: User): boolean {
  if (!actor || isProtectedUser(target)) return false;
  if (isPrimaryAdmin(actor) || isPlatformAdmin(actor)) return true;
  if (!isManager(actor)) return false;
  if (resolveUserDealershipId(actor) !== resolveUserDealershipId(target)) return false;
  if (target.role === 'admin') return false;
  if (isPendingManagerEnrollment(target) || isPendingStaffEnrollment(target)) return true;
  return (
    target.role !== 'manager' &&
    target.role !== 'Manager' &&
    target.isManager !== true
  );
}

/** Managers can see same-store users in the admin list (including other managers). */
export function canManagerViewDealershipUser(actor: User | null | undefined, target: User): boolean {
  if (!actor) return false;
  if (isPrimaryAdmin(actor) || isPlatformAdmin(actor)) return true;
  if (!isManager(actor)) return false;
  if (resolveUserDealershipId(actor) !== resolveUserDealershipId(target)) return false;
  if (target.role === 'admin' && !isPendingUser(target)) return false;
  return true;
}


export type ManagerAdminPermission = 'admin' | 'manager';

/** Admin → User Settings: managers can only be Manager or elevated to System Admin. */
export function managerAdminPermissionFromUser(user: User): ManagerAdminPermission {
  return user.role === 'admin' ? 'admin' : 'manager';
}

export function buildManagerAdminRolePatch(permission: ManagerAdminPermission): Partial<User> {
  if (permission === 'admin') {
    return { role: 'admin', isManager: true, approved: true, status: 'approved' };
  }
  return { role: 'manager', isManager: true, approved: true, status: 'approved' };
}

export type MasterPermissionRole =
  | 'admin'
  | 'manager'
  | 'advisor-service'
  | 'advisor-sales'
  | 'pending';

export function masterPermissionFromUser(user: User): MasterPermissionRole {
  if (user.role === 'admin') return 'admin';
  if (user.role === 'manager' || user.role === 'Manager' || user.isManager === true) return 'manager';
  if (isPendingUser(user)) return 'pending';
  if (user.department === 'sales') return 'advisor-sales';
  return 'advisor-service';
}

export function buildMasterPermissionPatch(permission: MasterPermissionRole): Partial<User> {
  switch (permission) {
    case 'admin':
      return { role: 'admin', isManager: true, approved: true, status: 'approved' };
    case 'manager':
      return { role: 'manager', isManager: true, approved: true, status: 'approved' };
    case 'advisor-service':
      return {
        role: 'advisor',
        department: 'service',
        isManager: false,
        approved: true,
        status: 'approved',
      };
    case 'advisor-sales':
      return {
        role: 'advisor',
        department: 'sales',
        isManager: false,
        approved: true,
        status: 'approved',
      };
    case 'pending':
      return { role: 'pending', approved: false, status: 'pending', isManager: false };
  }
}

export function canAccessMasterUserSettings(user: User | null | undefined): boolean {
  return canAccessPrimaryAdminSettings(user);
}
