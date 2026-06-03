import type { Role } from '../types';
import type { AppTab } from './appRoutes';

/** Default landing tab after login or when visiting `/`. */
export function defaultTabForRole(role: Role): AppTab {
  switch (role) {
    case 'Salesperson':
      return 'add';
    case 'Service Advisor':
      return 'alerts';
    case 'Manager':
      return 'appointments';
    case 'admin':
      return 'appointments';
    case 'Staff':
      return 'search';
    default:
      return 'search';
  }
}
