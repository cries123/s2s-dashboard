/**
 * The contract between the S2S Dashboard and this extension.
 *
 * Mirrored in the app at src/lib/webdcs/protocol.ts. A test asserts the two
 * agree on error codes so they cannot drift apart silently.
 */

export const PROTOCOL_VERSION = 1;

/** Messages the dashboard can send. */
export const MSG = Object.freeze({
  PING: 'webdcs.ping',
  STATUS: 'webdcs.status',
  OPEN: 'webdcs.open',
  RUN: 'webdcs.run',
});

/** Session states the probe can report for the WebDCS tab. */
export const SESSION = Object.freeze({
  NO_TAB: 'no_tab',
  LOGIN: 'login',
  TWO_FACTOR: '2fa',
  EXPIRED: 'expired',
  READY: 'ready',
  UNKNOWN: 'unknown',
});

/**
 * Every way a check can fail. A check never returns a count of 0 for any of
 * these — a real 0 and a failure are different answers.
 */
export const ERROR = Object.freeze({
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  UNKNOWN_MESSAGE: 'UNKNOWN_MESSAGE',
  UNKNOWN_CHECK: 'UNKNOWN_CHECK',
  NO_WEBDCS_TAB: 'NO_WEBDCS_TAB',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  WEBDCS_UNAVAILABLE: 'WEBDCS_UNAVAILABLE',
  BELL_NOT_FOUND: 'BELL_NOT_FOUND',
  PAGE_NOT_OPEN: 'PAGE_NOT_OPEN',
  PANEL_NOT_LOADED: 'PANEL_NOT_LOADED',
  DCM_NOT_FOUND: 'DCM_NOT_FOUND',
  UI_CHANGED: 'UI_CHANGED',
  TIMEOUT: 'TIMEOUT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  EXTENSION_ERROR: 'EXTENSION_ERROR',
});

export function makeOk(fields) {
  return { ok: true, protocol: PROTOCOL_VERSION, checkedAt: new Date().toISOString(), ...fields };
}

export function makeError(code, message, extra = {}) {
  return {
    ok: false,
    protocol: PROTOCOL_VERSION,
    checkedAt: new Date().toISOString(),
    error: { code, message },
    ...extra,
  };
}
