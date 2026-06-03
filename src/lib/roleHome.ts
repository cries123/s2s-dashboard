import type { User } from '../types';
import type { AppTab } from './appRoutes';
import { canSeeManagerPanel, canSeeSalesNav, canSeeServiceNav, isPlatformAdmin, resolveUserDepartment } from './rbac';

/** Default landing tab after login or when visiting `/`. */
export function defaultTabForRole(user: User | null | undefined): AppTab {
  if (!user) return 'search';
  if (isPlatformAdmin(user)) return 'appointments';
  if (canSeeManagerPanel(user)) return 'manager';
  if (resolveUserDepartment(user) === 'sales' && canSeeSalesNav(user)) return 'add';
  if (canSeeServiceNav(user)) return 'alerts';
  return 'add';
}
