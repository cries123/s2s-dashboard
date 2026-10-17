import { auth } from '../firebase';

/** JSON from one of the server's signed-in /api routes; throws the server's message on failure. */
export async function authedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again to use this.');
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const type = res.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await res.json() : { error: (await res.text()).slice(0, 200) };
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status}).`);
  return body as T;
}
