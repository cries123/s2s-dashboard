function isDevPreviewUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search).get('preview');
  return value === 'true' || value === 'dispatch' || value === '1';
}

/** Local UI preview — never enabled in production builds. */
export const isPreviewMode =
  import.meta.env.DEV &&
  (import.meta.env.VITE_PREVIEW_MODE === 'true' || isDevPreviewUrl());
