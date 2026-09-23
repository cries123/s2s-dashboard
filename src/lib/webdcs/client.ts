/**
 * Talks to the WebDCS Assistant extension from the dashboard page.
 *
 * Uses Chrome's externally_connectable channel: the page calls
 * chrome.runtime.sendMessage(extensionId, message) and the extension's service
 * worker answers. No server involved. Nothing sensitive crosses — the
 * extension returns counts, states, error codes and a redacted log.
 */

import {
  MSG,
  WEBDCS_EXTENSION_ID,
  type WebDcsCasesRunResult,
  type WebDcsCheckId,
  type WebDcsDpmRunResult,
  type WebDcsFailure,
  type WebDcsPing,
  type WebDcsRunResult,
  type WebDcsStatus,
} from './protocol';

interface ChromeRuntimeLike {
  sendMessage: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
}

function chromeRuntime(): ChromeRuntimeLike | null {
  const c = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === 'function' ? c.runtime : null;
}

function failure(code: WebDcsFailure['error']['code'], message: string): WebDcsFailure {
  return { ok: false, checkedAt: new Date().toISOString(), error: { code, message } };
}

/** True in Chrome/Edge on a desktop. The extension cannot exist anywhere else. */
export function browserSupportsExtension(): boolean {
  return chromeRuntime() !== null;
}

function send<T>(message: Record<string, unknown>, timeoutMs: number): Promise<T | WebDcsFailure> {
  const runtime = chromeRuntime();
  if (!runtime) {
    return Promise.resolve(failure('UNSUPPORTED_BROWSER', 'This browser cannot talk to the extension.'));
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (v: T | WebDcsFailure) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(
      () => done(failure('TIMEOUT', `The extension did not answer within ${Math.round(timeoutMs / 1000)}s.`)),
      timeoutMs
    );

    try {
      runtime.sendMessage(WEBDCS_EXTENSION_ID, message, (response: unknown) => {
        const err = runtime.lastError?.message;
        if (err || response === undefined) {
          // "Could not establish connection. Receiving end does not exist." is
          // what Chrome says when the extension is not installed or disabled.
          done(failure('EXTENSION_NOT_INSTALLED', err || 'No response from the extension.'));
          return;
        }
        done(response as T);
      });
    } catch (e) {
      done(failure('EXTENSION_NOT_INSTALLED', e instanceof Error ? e.message : 'Could not reach the extension.'));
    }
  });
}

export function pingExtension(): Promise<WebDcsPing | WebDcsFailure> {
  return send<WebDcsPing>({ type: MSG.PING }, 3000);
}

export function getWebDcsStatus(): Promise<WebDcsStatus | WebDcsFailure> {
  return send<WebDcsStatus>({ type: MSG.STATUS }, 12_000);
}

export function openWebDcs(): Promise<{ ok: true } | WebDcsFailure> {
  return send<{ ok: true }>({ type: MSG.OPEN }, 5000);
}

export function runWebDcsCheck(check: WebDcsCheckId): Promise<WebDcsRunResult> {
  return send<WebDcsRunResult>({ type: MSG.RUN, check }, 40_000);
}

/** The case table from the DCM Dashboard tab — number, due date, VIN, customer, status. */
export function runWebDcsCases(): Promise<WebDcsCasesRunResult> {
  return send<WebDcsCasesRunResult>({ type: MSG.RUN, check: 'dcmCases' }, 40_000);
}

/** Every metric card on whichever DPM view is open, with HMA's red/blue marking. */
export function runWebDcsDpm(): Promise<WebDcsDpmRunResult> {
  return send<WebDcsDpmRunResult>({ type: MSG.RUN, check: 'dpmCards' }, 40_000);
}
