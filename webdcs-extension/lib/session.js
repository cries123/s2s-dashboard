/**
 * Finding the WebDCS tab and working out whether it is signed in.
 *
 * This is the piece every future WebDCS check shares. It never authenticates:
 * the user signs in and completes 2FA themselves in their own tab, and this
 * only asks the page "are you past that yet?" via a read-only probe.
 */

import { SESSION } from './protocol.js';

// The dealer portal is a SharePoint site at www.hyundaidealer.com; it carries
// the DCM notification control and SSO-redirects into the SAP WebDCS behind it.
export const WEBDCS_ORIGIN = 'https://www.hyundaidealer.com';
export const WEBDCS_HOME_URL = `${WEBDCS_ORIGIN}/`;
export const WEBDCS_TAB_PATTERNS = ['https://wdcs.hyundaidealer.com/*', 'https://*.hyundaidealer.com/*'];

/**
 * Every dealer-portal tab, the one the user is looking at first, then most
 * recently used. A check is tried in each until one has what it needs — the
 * count lives on the portal page, the case table on the DCM Dashboard, and
 * both are usually open at once.
 */
export async function findWebDcsTabs() {
  const tabs = await chrome.tabs.query({ url: WEBDCS_TAB_PATTERNS });
  return [...tabs].sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
}

export async function findWebDcsTab() {
  const tabs = await findWebDcsTabs();
  return tabs[0] ?? null;
}

export async function openOrFocusWebDcs() {
  const existing = await findWebDcsTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return existing;
  }
  return chrome.tabs.create({ url: WEBDCS_HOME_URL, active: true });
}

/** Strip the URL down to what a log can safely carry. */
export function safeTabLocation(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return '';
  }
}

/**
 * Run the in-page probe in every same-origin frame and fold the answers into
 * one state. SAP Portal pages nest content in iframes, so the sign-in form and
 * the masthead are often in different frames.
 */
export async function probeSession(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['checks/_probe.js'],
  });

  const frames = results.map((r) => r.result).filter(Boolean);
  const states = new Set(frames.map((f) => f.state));

  // Order matters: an auth prompt anywhere wins over a masthead somewhere else.
  let state = SESSION.UNKNOWN;
  if (states.has(SESSION.LOGIN)) state = SESSION.LOGIN;
  else if (states.has(SESSION.TWO_FACTOR)) state = SESSION.TWO_FACTOR;
  else if (states.has(SESSION.EXPIRED)) state = SESSION.EXPIRED;
  else if (states.has(SESSION.READY)) state = SESSION.READY;

  return { state, frames };
}
