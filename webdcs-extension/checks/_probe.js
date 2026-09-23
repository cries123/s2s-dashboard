/**
 * Injected into every frame of the WebDCS tab. Read-only. Answers one thing:
 * what does this frame look like — a sign-in form, a 2FA prompt, an expired
 * session notice, or a signed-in portal page?
 *
 * Returns a plain object; the background script folds frames together.
 */
(() => {
  const isVisible = (el) =>
    !!el && (el.offsetParent !== null || el.getClientRects().length > 0);

  const visible = (selector) => {
    try {
      return [...document.querySelectorAll(selector)].filter(isVisible);
    } catch {
      return [];
    }
  };

  const path = location.pathname.toLowerCase();
  const markers = [];

  // ---- sign-in / 2FA -------------------------------------------------------
  const password = visible('input[type="password"]');
  if (password.length) markers.push('password-input');

  const otp = visible(
    'input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i], ' +
      'input[name*="passcode" i], input[id*="passcode" i], input[name*="verif" i], input[id*="verif" i], ' +
      'input[name*="mfa" i], input[id*="mfa" i], input[inputmode="numeric"][maxlength="6"]'
  );
  if (otp.length) markers.push('otp-input');

  // ---- expired ---------------------------------------------------------------
  // Look at a bounded slice of text so a large page does not cost anything.
  const bodyText = (document.body?.innerText || '').slice(0, 4000);
  const expiredText = /session (has )?(expired|timed out)|your session is no longer valid|please (log|sign) (on|in) again/i.test(bodyText);
  if (expiredText) markers.push('expired-text');

  // ---- signed-in portal ------------------------------------------------------
  const readySelectors = [
    'a[href*="logoff" i]',
    'a[href*="logout" i]',
    '[id*="logoff" i]',
    '[id*="logout" i]',
    '[id*="masthead" i]',
    '[class*="masthead" i]',
    '[aria-label*="notification" i]',
    '[title*="notification" i]',
    '[class*="notif" i]',
    '[id*="notif" i]',
  ];
  const readyHits = readySelectors.filter((s) => visible(s).length > 0);
  markers.push(...readyHits.map((s) => `ready:${s}`));

  const onLoginPath = path.includes('/irj/portal/iam') || path.includes('/login') || path.includes('/logon');
  if (onLoginPath) markers.push('login-path');

  let state = 'unknown';
  if (password.length) state = 'login';
  else if (otp.length) state = '2fa';
  else if (expiredText) state = 'expired';
  else if (readyHits.length && !onLoginPath) state = 'ready';

  return {
    top: window === window.top,
    location: `${location.host}${location.pathname}`,
    state,
    markers,
  };
})();
