import { auth } from '../firebase';

async function bearerHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  throw new Error(text || `Request failed (${res.status})`);
}

export async function masterUserSetPassword(uid: string, password: string): Promise<string> {
  const headers = await bearerHeaders();
  const res = await fetch(`/api/admin/master-users/${uid}/set-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ password }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to set password'));
  return String(data.message || 'Password updated.');
}

export async function masterUserUpdateEmail(uid: string, email: string): Promise<string> {
  const headers = await bearerHeaders();
  const res = await fetch(`/api/admin/master-users/${uid}/email`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to update email'));
  return String(data.email || email);
}

export async function masterUserDeleteAuth(uid: string): Promise<void> {
  const headers = await bearerHeaders();
  const res = await fetch(`/api/admin/master-users/${uid}/auth`, {
    method: 'DELETE',
    headers,
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to delete auth account'));
}

/** Server authorizes the action; returns target email for client-side Firebase reset email. */
export async function masterUserAuthorizePasswordReset(uid: string): Promise<string> {
  const headers = await bearerHeaders();
  const res = await fetch(`/api/admin/master-users/${uid}/send-password-reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to authorize password reset'));
  const email = String(data.email || '');
  if (!email) throw new Error('User has no email on file.');
  return email;
}
