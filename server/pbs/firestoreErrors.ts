export function formatFirestoreError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('resource_exhausted') || lower.includes('quota exceeded')) {
    return 'Firestore quota exceeded. Check Firebase Console → Usage and billing, or wait for daily limits to reset.';
  }
  if (lower.includes('permission_denied') || lower.includes('missing or insufficient permissions')) {
    return 'Firestore permission denied. Confirm the service account has access to this Firebase project/database.';
  }
  if (lower.includes('not_found')) {
    return 'Firestore database or document path was not found. Verify VITE_FIREBASE_DATABASE_ID matches your project.';
  }

  return message.slice(0, 300);
}

export function isFirestoreQuotaError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes('resource_exhausted') || message.includes('quota exceeded');
}
