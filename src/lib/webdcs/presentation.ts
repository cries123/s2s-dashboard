/**
 * Turning extension results into words a service manager reads.
 * Pure — no React, no browser — so it is tested directly.
 */

import type { WebDcsErrorCode, WebDcsSessionState } from './protocol';

export interface ErrorPresentation {
  /** Short headline. */
  title: string;
  /** What to do about it, in one sentence. */
  hint: string;
  /** Whether the fix is in WebDCS (sign in) rather than in this app. */
  needsWebDcsAction: boolean;
  /** Whether a diagnostic snapshot would help fix it. */
  wantsDiagnostic: boolean;
}

export function describeError(code: WebDcsErrorCode): ErrorPresentation {
  switch (code) {
    case 'EXTENSION_NOT_INSTALLED':
      return {
        title: 'WebDCS assistant not installed',
        hint: 'Install the S2S WebDCS Assistant extension in this browser, then reload this page.',
        needsWebDcsAction: false,
        wantsDiagnostic: false,
      };
    case 'UNSUPPORTED_BROWSER':
      return {
        title: 'This browser cannot run the WebDCS check',
        hint: 'Use Chrome or Edge on a computer. Phone browsers cannot load the extension.',
        needsWebDcsAction: false,
        wantsDiagnostic: false,
      };
    case 'NO_WEBDCS_TAB':
      return {
        title: 'WebDCS is not open',
        hint: 'Open WebDCS in another tab and sign in, then try again.',
        needsWebDcsAction: true,
        wantsDiagnostic: false,
      };
    case 'AUTH_REQUIRED':
      return {
        title: 'WebDCS needs you to sign in',
        hint: 'Switch to the WebDCS tab, sign in, and come back.',
        needsWebDcsAction: true,
        wantsDiagnostic: false,
      };
    case 'TWO_FACTOR_REQUIRED':
      return {
        title: 'WebDCS is waiting for your verification code',
        hint: 'Finish the 2FA step in the WebDCS tab, then run the check.',
        needsWebDcsAction: true,
        wantsDiagnostic: false,
      };
    case 'SESSION_EXPIRED':
      return {
        title: 'WebDCS session expired. Please log in again.',
        hint: 'Sign in to WebDCS in its tab, then run the check again.',
        needsWebDcsAction: true,
        wantsDiagnostic: false,
      };
    case 'WEBDCS_UNAVAILABLE':
      return {
        title: 'WebDCS is unavailable',
        hint: 'The WebDCS tab closed or stopped responding. Reopen it and try again.',
        needsWebDcsAction: true,
        wantsDiagnostic: false,
      };
    case 'PAGE_NOT_OPEN':
      return {
        title: 'The DCM Dashboard is not open',
        hint: 'In WebDCS, click the red DCM notification to open the DCM Dashboard in its own tab, leave it open, then load the details again.',
        needsWebDcsAction: true,
        wantsDiagnostic: false,
      };
    case 'BELL_NOT_FOUND':
      return {
        title: 'Could not find the notification bell',
        hint: 'Make sure the WebDCS home page is showing, not a sub-page. If it is, WebDCS may have changed.',
        needsWebDcsAction: false,
        wantsDiagnostic: true,
      };
    case 'PANEL_NOT_LOADED':
      return {
        title: 'The notification panel did not open',
        hint: 'Try again once WebDCS has finished loading. If it keeps happening, WebDCS may have changed.',
        needsWebDcsAction: false,
        wantsDiagnostic: true,
      };
    case 'DCM_NOT_FOUND':
      return {
        title: 'Unable to determine DCM case count',
        hint: 'The panel opened but no DCM case information was recognised. The diagnostic below shows what was there.',
        needsWebDcsAction: false,
        wantsDiagnostic: true,
      };
    case 'UI_CHANGED':
      return {
        title: 'WebDCS does not look the way this check expects',
        hint: 'The page loaded but was not recognised as a signed-in home page.',
        needsWebDcsAction: false,
        wantsDiagnostic: true,
      };
    case 'TIMEOUT':
      return {
        title: 'WebDCS took too long',
        hint: 'Check the WebDCS tab is responsive, then try again.',
        needsWebDcsAction: false,
        wantsDiagnostic: false,
      };
    case 'PERMISSION_DENIED':
      return {
        title: 'The extension is not allowed to read that tab',
        hint: 'Make sure the WebDCS tab is a normal tab (not an extensions or settings page).',
        needsWebDcsAction: false,
        wantsDiagnostic: false,
      };
    case 'ORIGIN_NOT_ALLOWED':
      return {
        title: 'This site is not allowed to use the extension',
        hint: 'The extension only accepts requests from the S2S Dashboard.',
        needsWebDcsAction: false,
        wantsDiagnostic: false,
      };
    case 'UNKNOWN_CHECK':
    case 'UNKNOWN_MESSAGE':
      return {
        title: 'The extension is out of date',
        hint: 'Reload the extension from chrome://extensions and try again.',
        needsWebDcsAction: false,
        wantsDiagnostic: false,
      };
    case 'EXTENSION_ERROR':
    default:
      return {
        title: 'Unable to determine DCM case count',
        hint: 'Something went wrong inside the extension. The log below has the details.',
        needsWebDcsAction: false,
        wantsDiagnostic: true,
      };
  }
}

export interface StatePresentation {
  label: string;
  tone: 'ready' | 'waiting' | 'off';
  canRun: boolean;
}

export function describeState(state: WebDcsSessionState | 'checking' | 'extension_missing'): StatePresentation {
  switch (state) {
    case 'ready':
      return { label: 'WebDCS ready', tone: 'ready', canRun: true };
    case 'login':
      return { label: 'Sign in to WebDCS', tone: 'waiting', canRun: false };
    case '2fa':
      return { label: 'Waiting for your 2FA code', tone: 'waiting', canRun: false };
    case 'expired':
      return { label: 'WebDCS session expired', tone: 'waiting', canRun: false };
    case 'no_tab':
      return { label: 'Not connected', tone: 'off', canRun: false };
    case 'checking':
      return { label: 'Checking…', tone: 'off', canRun: false };
    case 'extension_missing':
      return { label: 'Extension not installed', tone: 'off', canRun: false };
    case 'unknown':
    default:
      return { label: 'WebDCS open, not recognised', tone: 'waiting', canRun: false };
  }
}

export function formatCaseCount(n: number): string {
  if (n === 0) return '0 DCM cases currently waiting for response';
  return `${n} DCM case${n === 1 ? '' : 's'} waiting for response`;
}

/** "overdue" / "today" / "tomorrow" / "in 5 days" / "" for a due date against a given day. */
export function dueRelative(dueDateIso: string | null, todayIso: string): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' | 'none' } {
  if (!dueDateIso) return { label: '', tone: 'none' };
  const a = new Date(`${dueDateIso}T00:00:00`).getTime();
  const b = new Date(`${todayIso}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return { label: '', tone: 'none' };
  const days = Math.round((a - b) / 86_400_000);
  if (days < 0) return { label: days === -1 ? '1 day overdue' : `${-days} days overdue`, tone: 'overdue' };
  if (days === 0) return { label: 'due today', tone: 'today' };
  if (days === 1) return { label: 'due tomorrow', tone: 'soon' };
  if (days <= 3) return { label: `due in ${days} days`, tone: 'soon' };
  return { label: `due in ${days} days`, tone: 'later' };
}

export function formatCheckedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
