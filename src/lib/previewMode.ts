/** Local UI preview — never enabled in production builds. */
export const isPreviewMode =
  import.meta.env.DEV && import.meta.env.VITE_PREVIEW_MODE === 'true';
