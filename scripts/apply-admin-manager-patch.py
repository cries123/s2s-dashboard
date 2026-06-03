#!/usr/bin/env python3
"""Apply admin/manager RBAC UX patches to on-disk sources."""
from pathlib import Path

ROOT = Path('/workspace')

RBAC_APPEND = '''

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
  return isPrimaryAdmin(user);
}

export function canSwitchDealership(user: User | null | undefined): boolean {
  return isPrimaryAdmin(user);
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

export function canModifyUser(actor: User | null | undefined, target: User): boolean {
  if (!actor || isProtectedUser(target)) return false;
  if (isPrimaryAdmin(actor)) return true;
  if (!isManager(actor)) return false;
  if (resolveUserDealershipId(actor) !== resolveUserDealershipId(target)) return false;
  return (
    target.role !== 'manager' &&
    target.role !== 'Manager' &&
    target.role !== 'admin' &&
    target.isManager !== true
  );
}
'''

def patch_rbac():
    path = ROOT / 'src/lib/rbac.ts'
    text = path.read_text()
    if 'PRIMARY_ADMIN_EMAIL' not in text:
        path.write_text(text.rstrip() + RBAC_APPEND)

    text = path.read_text()
    text = text.replace(
        "export function canSeeAdminPanel(user: User | null | undefined): boolean {\n  return isPlatformAdmin(user);\n}",
        "export function canSeeAdminPanel(user: User | null | undefined): boolean {\n  return canAccessPrimaryAdminSettings(user);\n}",
    )
    text = text.replace(
        "  if (isPlatformAdmin(user)) return false;",
        "  if (isPlatformAdmin(user) || isPrimaryAdmin(user)) return false;",
        1,
    )
    path.write_text(text)

def patch_main():
    path = ROOT / 'src/main.tsx'
    text = path.read_text()
    if 'AuthenticatedApp' not in text:
        text = text.replace("import App from './App.tsx';", "import App from './AuthenticatedApp.tsx';")
        path.write_text(text)

def patch_login():
    path = ROOT / 'src/components/auth/LoginView.tsx'
    text = path.read_text()
    if "value=\"manager\"" in text:
        return
    text = text.replace(
        '  const [department, setDepartment] = useState<UserDepartment | \'\'>(\'\');',
        "  const [department, setDepartment] = useState<UserDepartment | 'manager' | ''>('');",
    )
    text = text.replace(
        '<option value="service">Service</option>\n                    </select>',
        '<option value="service">Service</option>\n                      <option value="manager">Manager</option>\n                    </select>',
    )
    old_signup = """      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        username,
        role: 'pending',
        department,
        tenantId,
        dealershipId: profile.dealershipId,
        approved: false,
        status: 'pending',
        jobTitle: department === 'sales' ? 'Sales Professional' : 'Service Advisor',
        isManager: false,
        createdAt: new Date(),
      });"""
    new_signup = """      const isManagerEnrollment = department === 'manager';

      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        username,
        role: isManagerEnrollment ? 'manager' : 'pending',
        department: isManagerEnrollment ? 'service' : department,
        tenantId,
        dealershipId: profile.dealershipId,
        approved: false,
        status: 'pending',
        jobTitle: isManagerEnrollment
          ? 'Manager'
          : department === 'sales'
            ? 'Sales Professional'
            : 'Service Advisor',
        isManager: isManagerEnrollment,
        createdAt: new Date(),
      });"""
    if old_signup in text:
        text = text.replace(old_signup, new_signup)
    text = text.replace(
        'showMessage(\'Enrollment submitted. A manager must approve your account before you can access the dashboard.\', false);',
        "showMessage(\n        isManagerEnrollment\n          ? 'Manager enrollment submitted. The primary system administrator must approve your account.'\n          : 'Enrollment submitted. A manager must approve your account before you can access the dashboard.',\n        false\n      );",
    )
    text = text.replace(
        'New accounts start as <span className="text-amber-400 font-black">pending</span>. A manager for your dealership profile must approve you before dashboard access is granted.',
        'Choose Sales or Service for manager approval at your dealership, or Manager for primary administrator review.',
    )
    path.write_text(text)

if __name__ == '__main__':
    patch_rbac()
    patch_main()
    patch_login()
    print('base patches applied')
