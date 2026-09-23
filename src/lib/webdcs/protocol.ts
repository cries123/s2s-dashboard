/**
 * App-side mirror of webdcs-extension/lib/protocol.js.
 *
 * scripts/webdcs.test.mjs asserts the error codes here match the extension's,
 * so the two cannot drift apart without a failing test.
 */

export const WEBDCS_EXTENSION_ID = 'bfmmmlookgfoldppkocabfhoiflnfibm';
/** The dealer portal (SharePoint) — it holds the DCM notification control and SSO-redirects into WebDCS. */
export const WEBDCS_HOME_URL = 'https://www.hyundaidealer.com/';
export const PROTOCOL_VERSION = 1;

export const MSG = {
  PING: 'webdcs.ping',
  STATUS: 'webdcs.status',
  OPEN: 'webdcs.open',
  RUN: 'webdcs.run',
} as const;

export const SESSION_STATES = ['no_tab', 'login', '2fa', 'expired', 'ready', 'unknown'] as const;
export type WebDcsSessionState = (typeof SESSION_STATES)[number];

export const ERROR_CODES = [
  'ORIGIN_NOT_ALLOWED',
  'UNKNOWN_MESSAGE',
  'UNKNOWN_CHECK',
  'NO_WEBDCS_TAB',
  'AUTH_REQUIRED',
  'TWO_FACTOR_REQUIRED',
  'SESSION_EXPIRED',
  'WEBDCS_UNAVAILABLE',
  'BELL_NOT_FOUND',
  'PAGE_NOT_OPEN',
  'PANEL_NOT_LOADED',
  'DCM_NOT_FOUND',
  'UI_CHANGED',
  'TIMEOUT',
  'PERMISSION_DENIED',
  'EXTENSION_ERROR',
  // App-side only: the extension cannot report its own absence.
  'EXTENSION_NOT_INSTALLED',
  'UNSUPPORTED_BROWSER',
] as const;
export type WebDcsErrorCode = (typeof ERROR_CODES)[number];

export type WebDcsCheckId = 'dcm' | 'dcmCases' | 'dpmCards';

/** One DPM metric card as read from the page. Colour is HMA's own pass/fail marking. */
export type DpmColor = 'red' | 'blue' | 'green' | 'neutral';

export interface DpmCardRow {
  label: string;
  value: string;
  note: string;
  color: DpmColor;
}

export interface DpmCard {
  title: string;
  headline: { label: string; value: string; color: DpmColor } | null;
  rows: DpmCardRow[];
}

export interface DpmMetricVerdict {
  label: string;
  value: number | null;
  objective: number;
  pass: boolean;
  color: DpmColor;
}

export interface DpmSummary {
  total: number;
  red: Array<{ title: string; label: string; value: string; target: string | null }>;
  blue: string[];
  serviceLane: {
    status: string | null;
    empi: DpmMetricVerdict | null;
    appointment: DpmMetricVerdict | null;
    laneCheckIn: DpmMetricVerdict | null;
  } | null;
}

export interface DpmView {
  top: string | null;
  sub: string | null;
  mode: string | null;
}

/** One row of the DCM Dashboard's case table. Shown, never stored. */
export interface DcmCase {
  caseNumber: string;
  dueDate: string;
  /** YYYY-MM-DD when the due date was readable, for sorting and overdue checks. */
  dueDateIso: string | null;
  vin: string;
  model: string;
  customerName: string;
  status: string;
}

export interface WebDcsError {
  code: WebDcsErrorCode;
  message: string;
}

export interface WebDcsOkBase {
  ok: true;
  protocol: number;
  checkedAt: string;
  log?: string[];
}

export interface WebDcsFailure {
  ok: false;
  protocol?: number;
  checkedAt: string;
  error: WebDcsError;
  check?: WebDcsCheckId;
  log?: string[];
  /** Structural snapshot from the page — tags/ids/classes, never text. */
  diagnostic?: unknown;
  evidence?: Record<string, unknown>;
  detail?: string;
}

export interface WebDcsPing extends WebDcsOkBase {
  version: string;
  checks: string[];
}

export interface WebDcsStatus extends WebDcsOkBase {
  state: WebDcsSessionState;
  tabLocation?: string;
}

export interface WebDcsDcmResult extends WebDcsOkBase {
  check: 'dcm';
  dcmCasesWaiting: number;
  strategy: string;
  evidence?: Record<string, unknown>;
}

export interface WebDcsDcmCasesResult extends WebDcsOkBase {
  check: 'dcmCases';
  dcmCasesWaiting: number;
  cases: DcmCase[];
  sections: Array<{ label: string; declaredCount: number | null; rows: number }>;
  strategy: string;
}

export interface WebDcsDpmResult extends WebDcsOkBase {
  check: 'dpmCards';
  strategy: string;
  view: DpmView;
  dataUpdated: string;
  reportingMonth: string | null;
  cards: DpmCard[];
  summary: DpmSummary;
}

export type WebDcsRunResult = WebDcsDcmResult | WebDcsFailure;
export type WebDcsCasesRunResult = WebDcsDcmCasesResult | WebDcsFailure;
export type WebDcsDpmRunResult = WebDcsDpmResult | WebDcsFailure;

/** A readable name for a DPM view, for filing results under. */
export function dpmViewKey(view: DpmView): string {
  return [view.top, view.sub, view.mode].filter(Boolean).join(' › ') || 'Unknown view';
}
