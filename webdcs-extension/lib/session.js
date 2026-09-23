/**
 * Finding the WebDCS tab and working out whether it is signed in.
 *
 * This is the piece every future WebDCS check shares. It never authenticates:
 * the user signs in and completes 2FA themselves in their own tab, and this
 * only asks the page "are you past that yet?" via a read-only probe.
 */

import { SESSION } from './protocol.js';

export const WEBDCS_ORIGIN = 'https://wdcs.hyundaidealer.com';
export const WEBDCS_HOME_URL = `${WEBDCS_ORIGIN}/irj/portal/webdcs`;
export const WEBDCS_TAB_PATTERNS = ['https://wdcs.hyundaidealer.com/*', 'https://*.hyundaidealer.com/*'];

/** Prefer the tab the user is looking at; otherwise the most recently used one. */
export async function findWebDcsTab() {
  const tabs = await chrome.tabs.query({ url: WEBDCS_TAB_PATTERNS });
  if (!tabs.length) return null;
  const active = tabs.find((t) => t.active);
  if (active) return active;
  return [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
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
