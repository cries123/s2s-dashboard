/**
 * Service worker. Receives messages from the S2S Dashboard (and nothing else),
 * finds the dealer-portal tabs the user signed into, and runs checks inside
 * them.
 *
 * Trust boundary: the dashboard origin is verified on every message, and the
 * only thing that ever leaves this worker is the structured result — counts,
 * a state, an error code, a redacted log, and for the case-details check the
 * case fields themselves. No cookies, tokens or page text otherwise.
 */

import { MSG, SESSION, ERROR, makeOk, makeError, PROTOCOL_VERSION } from './lib/protocol.js';
import { createLogger } from './lib/logger.js';
import { findWebDcsTab, findWebDcsTabs, openOrFocusWebDcs, probeSession, safeTabLocation } from './lib/session.js';
import { CHECKS } from './checks/registry.js';

const ALLOWED_ORIGINS = new Set(['https://salestoservice.net', 'http://localhost:3000']);
const VERSION = chrome.runtime.getManifest().version;

function originOf(sender) {
  if (sender.origin) return sender.origin;
  try {
    return new URL(sender.url || '').origin;
  } catch {
    return '';
  }
}

function withTimeout(promise, ms, code = ERROR.TIMEOUT) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`Timed out after ${ms}ms`), { code })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Session-state -> the error a check should return without trying. */
function errorForState(state, log) {
  switch (state) {
    case SESSION.NO_TAB:
      return makeError(ERROR.NO_WEBDCS_TAB, 'No WebDCS tab is open. Open WebDCS and sign in first.', { log });
    case SESSION.LOGIN:
      return makeError(ERROR.AUTH_REQUIRED, 'WebDCS is asking you to sign in.', { log });
    case SESSION.TWO_FACTOR:
      return makeError(ERROR.TWO_FACTOR_REQUIRED, 'WebDCS is waiting for your verification code.', { log });
    case SESSION.EXPIRED:
      return makeError(ERROR.SESSION_EXPIRED, 'WebDCS session expired. Please log in again.', { log });
    case SESSION.UNKNOWN:
      return makeError(ERROR.UI_CHANGED, 'The WebDCS tab loaded, but it does not look like a signed-in page.', { log });
    default:
      return null;
  }
}

async function handleStatus(log) {
  const tab = await findWebDcsTab();
  if (!tab) {
    log.info('No WebDCS tab open');
    return makeOk({ state: SESSION.NO_TAB, log: log.entries });
  }
  log.info(`WebDCS tab found at ${safeTabLocation(tab.url)}`);
  const { state, frames } = await withTimeout(probeSession(tab.id), 8000);
  log.info(`Session state: ${state} (${frames.length} frame${frames.length === 1 ? '' : 's'} probed)`);
  return makeOk({ state, tabLocation: safeTabLocation(tab.url), log: log.entries });
}

const frameOf = (f) => `${f.frame?.top ? 'top' : 'frame'} ${f.frame?.location ?? ''}`;

/** Shape a successful in-page result into the response for its check. */
function shapeSuccess(checkId, r, log) {
  const base = { check: checkId, strategy: r.strategy, frame: r.frame, log: log.entries };
  if (checkId === 'dcmCases') {
    return makeOk({ ...base, dcmCasesWaiting: r.count, cases: r.cases, sections: r.sections });
  }
  return makeOk({ ...base, dcmCasesWaiting: r.count, evidence: r.evidence });
}

async function handleRun(checkId, log) {
  const check = CHECKS[checkId];
  if (!check) return makeError(ERROR.UNKNOWN_CHECK, `Unknown check "${checkId}".`, { log: log.entries });

  log.info(`${check.label}: check started`);
  const tabs = await findWebDcsTabs();
  if (!tabs.length) return errorForState(SESSION.NO_TAB, log.entries);

  const failures = [];
  const skippedFrames = [];
  let blockedByAuth = null;

  for (const tab of tabs) {
    log.info(`WebDCS tab found at ${safeTabLocation(tab.url)}`);
    const { state } = await withTimeout(probeSession(tab.id), 8000);
    const blocked = errorForState(state, log.entries);
    if (blocked) {
      // Remember the first auth problem, but keep looking — another tab may be signed in.
      log.warn(`Skipping: session state is ${state}`);
      blockedByAuth = blockedByAuth || { ...blocked, check: checkId };
      continue;
    }
    log.info('Authenticated session detected');

    const injected = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: check.files }),
      check.timeoutMs
    );
    const frames = injected.map((r) => r.result).filter(Boolean);

    const succeeded = frames.find((f) => f.ok === true);
    if (succeeded) {
      for (const line of succeeded.log || []) log.info(`[${frameOf(succeeded)}] ${line}`);
      log.info('Check completed');
      return shapeSuccess(checkId, succeeded, log);
    }
    failures.push(...frames.filter((f) => f.ok === false));
    skippedFrames.push(...frames.filter((f) => f.skipped).map((f) => f.frame));
  }

  if (failures.length) {
    // Prefer the failure that got furthest: a panel that opened beats a bell
    // that was never found.
    const rank = { DCM_NOT_FOUND: 3, PANEL_NOT_LOADED: 2, BELL_NOT_FOUND: 1 };
    const worst = [...failures].sort((a, b) => (rank[b.code] || 0) - (rank[a.code] || 0))[0];
    for (const line of worst.log || []) log.info(`[${frameOf(worst)}] ${line}`);
    const messages = {
      PANEL_NOT_LOADED: 'The notification control was found, but no notification panel appeared after opening it.',
      DCM_NOT_FOUND: 'The notification panel opened, but no DCM case information could be read from it.',
    };
    log.error(`Check failed: ${worst.code}`);
    return makeError(ERROR[worst.code] || ERROR.UI_CHANGED, messages[worst.code] || 'WebDCS did not look the way this check expects.', {
      check: checkId,
      frame: worst.frame,
      evidence: worst.evidence,
      diagnostic: worst.diagnostic,
      log: log.entries,
    });
  }

  if (blockedByAuth && !skippedFrames.length) {
    return { ...blockedByAuth, log: log.entries };
  }

  log.error(`${check.notFound.code}: nothing suitable in ${skippedFrames.length} frame${skippedFrames.length === 1 ? '' : 's'} across ${tabs.length} tab${tabs.length === 1 ? '' : 's'}`);
  return makeError(ERROR[check.notFound.code] || ERROR.UI_CHANGED, check.notFound.message, {
    check: checkId,
    frames: skippedFrames,
    log: log.entries,
  });
}

function mapThrown(e, log) {
  const msg = String(e?.message || e);
  log.error(msg);
  if (e?.code === ERROR.TIMEOUT) return makeError(ERROR.TIMEOUT, 'WebDCS took too long to respond.', { log: log.entries });
  if (/cannot access|permission|extensions gallery|chrome:\/\//i.test(msg)) {
    return makeError(ERROR.PERMISSION_DENIED, 'The extension is not allowed to read this tab.', { log: log.entries });
  }
  if (/no tab with id|tab was closed|frame was removed|receiving end does not exist/i.test(msg)) {
    return makeError(ERROR.WEBDCS_UNAVAILABLE, 'The WebDCS tab went away while the check was running.', { log: log.entries });
  }
  return makeError(ERROR.EXTENSION_ERROR, 'The extension hit an unexpected error.', { detail: msg.slice(0, 200), log: log.entries });
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = originOf(sender);
  if (!ALLOWED_ORIGINS.has(origin)) {
    sendResponse(makeError(ERROR.ORIGIN_NOT_ALLOWED, 'This origin may not use the WebDCS extension.'));
    return false;
  }

  const log = createLogger('webdcs');
  const type = message?.type;

  (async () => {
    try {
      switch (type) {
        case MSG.PING:
          return makeOk({ version: VERSION, protocol: PROTOCOL_VERSION, checks: Object.keys(CHECKS) });
        case MSG.STATUS:
          return await handleStatus(log);
        case MSG.OPEN: {
          const tab = await openOrFocusWebDcs();
          return makeOk({ opened: true, tabLocation: safeTabLocation(tab.url || '') });
        }
        case MSG.RUN:
          return await handleRun(String(message.check || ''), log);
        default:
          return makeError(ERROR.UNKNOWN_MESSAGE, `Unknown message "${type}".`);
      }
    } catch (e) {
      return mapThrown(e, log);
    }
  })().then(sendResponse);

  return true; // keep the channel open for the async response
});
