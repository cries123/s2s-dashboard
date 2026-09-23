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
import { findWebDcsTab, findWebDcsTabs, openOrFocusWebDcs, probeSession, reloadAndWait, safeTabLocation } from './lib/session.js';
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
  if (checkId === 'dpmCards') {
    return makeOk({ ...base, view: r.view, dataUpdated: r.dataUpdated, reportingMonth: r.reportingMonth, cards: r.cards, summary: r.summary });
  }
  return makeOk({ ...base, dcmCasesWaiting: r.count, evidence: r.evidence });
}

async function handleRun(checkId, log) {
  const check = CHECKS[checkId];
  if (!check) return makeError(ERROR.UNKNOWN_CHECK, `Unknown check "${checkId}".`, { log: log.entries });

  log.info(`${check.label}: check started`);
  const tabs = await findWebDcsTabs();
  if (!tabs.length) return errorForState(SESSION.NO_TAB, log.entries);
  log.info(`${tabs.length} readable tab${tabs.length === 1 ? '' : 's'}`);

  const failures = [];
  const skippedFrames = [];
  const skippedDiagnostics = [];
  let blockedByAuth = null;

  const isThisPage = (frames) => !check.marker || frames.some((f) => (f.markers || []).some((m) => check.marker.test(m)));

  for (const tab of tabs) {
    const where = safeTabLocation(tab.url);
    let { state, frames } = await withTimeout(probeSession(tab.id), 8000);
    const blocked = errorForState(state, log.entries);
    if (blocked) {
      // Remember the first auth problem, but keep looking — another tab may be signed in.
      log.warn(`${where}: session state is ${state}, skipping`);
      blockedByAuth = blockedByAuth || { ...blocked, check: checkId };
      continue;
    }
    if (!isThisPage(frames)) {
      // Say what was seen, so "not allowed" and "allowed but unrecognised" read differently.
      const seen = frames.flatMap((f) => f.markers || []).filter((m) => m.startsWith('ready:')).map((m) => m.slice(6));
      log.info(`${where}: not the page this check reads (markers: ${seen.join(', ') || 'none'}), skipping`);
      skippedFrames.push(...frames.map((f) => ({ top: f.top, location: f.location, markers: f.markers })));
      continue;
    }
    log.info(`${where}: authenticated session, this is the page`);

    if (check.reloadBeforeRead) {
      await withTimeout(reloadAndWait(tab.id), 20_000);
      ({ state, frames } = await withTimeout(probeSession(tab.id), 8000));
      const blockedAfter = errorForState(state, log.entries);
      if (blockedAfter) {
        log.warn(`${where}: after reload the session state is ${state}`);
        return { ...blockedAfter, check: checkId, log: log.entries };
      }
      log.info(`${where}: reloaded so the numbers are current`);
    }

    const injected = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: check.files }),
      check.timeoutMs
    );
    // `frames` above is the probe's view of the tab; these are the check's results.
    const results = injected.map((r) => r.result).filter(Boolean);

    const succeeded = results.find((f) => f.ok === true);
    if (succeeded) {
      for (const line of succeeded.log || []) log.info(`[${frameOf(succeeded)}] ${line}`);
      log.info('Check completed');
      return shapeSuccess(checkId, succeeded, log);
    }
    failures.push(...results.filter((f) => f.ok === false));
    for (const f of results.filter((f) => f.skipped)) {
      skippedFrames.push(f.frame);
      if (f.diagnostic) skippedDiagnostics.push({ frame: f.frame, ...f.diagnostic });
    }
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
    diagnostic: skippedDiagnostics.length ? skippedDiagnostics : undefined,
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

/**
 * Which other HMA applications the portal links to, so the popup can offer to
 * allow them by name instead of the user reading an address bar. Reads only
 * link targets on the portal page, which is always readable.
 */
async function discoverLinkedSites() {
  const tab = await findWebDcsTab();
  if (!tab) return { ok: true, sites: [] };
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const wanted = [
        { key: 'dpm', label: 'DPM', test: (t, h) => /^dpm$/i.test(t) || /\bdpm\b/i.test(h) },
        { key: 'dcm', label: 'DCM Dashboard', test: (t, h) => /dcm/i.test(t) || /dcm/i.test(h) },
      ];
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const text = (a.textContent || '').trim();
        const href = a.getAttribute('href') || '';
        let origin = null;
        try {
          const u = new URL(href, location.href);
          if (u.protocol === 'https:' && u.host !== location.host) origin = `${u.protocol}//${u.host}/*`;
        } catch {
          /* ignore */
        }
        for (const w of wanted) {
          if (w.test(text, href) && origin && !out.some((o) => o.origin === origin)) out.push({ key: w.key, label: w.label, origin });
        }
      }
      return out;
    },
  });
  return { ok: true, sites: results.flatMap((r) => r.result || []) };
}

// The popup talks to this worker over the internal channel. Only this
// extension's own pages may use it.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type !== 'webdcs.discover') return false;
  discoverLinkedSites()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

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
