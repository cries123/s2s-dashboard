/**
 * DCM check. Injected into each frame of the signed-in WebDCS tab after
 * dcm-parse.js. Finds the notification bell, opens it, reads the DCM cases
 * waiting for a response, and puts the panel back the way it was.
 *
 * The WebDCS DOM has not been inspected from inside an authenticated session
 * yet, so every step tries an ordered list of stable candidates (aria labels,
 * titles, ids, class fragments) rather than one selector, and any step that
 * finds nothing returns a sanitized structural snapshot so the selectors can be
 * pinned down after one real look. Nothing here reads cookies, storage, or
 * sends a network request.
 *
 * Returns { skipped: true } from frames that have no bell; the background
 * script picks the frame that did.
 */
(async () => {
  const P = globalThis.__webdcsDcmParse;
  const log = [];
  const t0 = Date.now();
  const say = (m) => log.push(`+${String(Date.now() - t0).padStart(5)}ms ${m}`);

  const isVisible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const q = (sel, root = document) => {
    try {
      return [...root.querySelectorAll(sel)].filter(isVisible);
    } catch {
      return [];
    }
  };
  const text = (el) => P.normalize(el?.innerText ?? el?.textContent ?? '');

  // ---- diagnostics: structure only, never text ----------------------------
  function snapshot(el, depth = 4, budget = { n: 140 }) {
    if (!el || budget.n <= 0 || el.nodeType !== 1) return null;
    budget.n -= 1;
    const pick = (a) => (el.getAttribute(a) ? P.sanitizeAttr(el.getAttribute(a)) : undefined);
    const node = {
      tag: el.tagName.toLowerCase(),
      id: pick('id'),
      cls: el.className && typeof el.className === 'string' ? P.sanitizeAttr(el.className) : undefined,
      role: pick('role'),
      aria: pick('aria-label'),
      title: pick('title'),
      name: pick('name'),
      href: el.tagName === 'A' ? P.sanitizeAttr((el.getAttribute('href') || '').split('?')[0]) : undefined,
      textLen: text(el).length,
      kids: el.children.length,
    };
    if (depth > 0 && el.children.length) {
      node.children = [...el.children].slice(0, 12).map((c) => snapshot(c, depth - 1, budget)).filter(Boolean);
    }
    return node;
  }

  function frameInfo() {
    return { top: window === window.top, location: `${location.host}${location.pathname}` };
  }

  // ---- 1. find the bell ----------------------------------------------------
  const BELL_SELECTORS = [
    '[aria-label*="notification" i]',
    '[title*="notification" i]',
    '[aria-label*="alert" i]',
    '[title*="alert" i]',
    '[id*="notification" i]',
    '[id*="notif" i]',
    '[class*="notification" i]',
    '[class*="notif" i]',
    '[class*="bell" i]',
    '[id*="bell" i]',
    'a[href*="notification" i]',
    'button[aria-haspopup]',
  ];

  let bell = null;
  let bellSelector = null;
  for (const sel of BELL_SELECTORS) {
    const hits = q(sel).filter((el) => {
      // Prefer something clickable and small — a control, not a whole panel.
      const r = el.getBoundingClientRect();
      const clickable = ['A', 'BUTTON'].includes(el.tagName) || el.getAttribute('role') === 'button' || el.onclick || el.getAttribute('tabindex') !== null;
      return clickable && r.width < 200 && r.height < 120;
    });
    if (hits.length) {
      bell = hits[0];
      bellSelector = sel;
      break;
    }
  }

  if (!bell) {
    return { skipped: true, reason: 'no-bell-in-frame', frame: frameInfo(), log };
  }
  say(`Notification control located via ${bellSelector}`);

  // Badge on or beside the bell. Recorded as evidence only: it is usually the
  // total of all notifications, not DCM specifically.
  let bellBadge = null;
  const badgeText = text(bell).match(/\b(\d{1,4})\b/);
  if (badgeText) bellBadge = Number(badgeText[1]);
  else {
    const sib = bell.parentElement ? q('[class*="badge" i], [class*="count" i], [class*="number" i]', bell.parentElement) : [];
    const m = sib.map(text).join(' ').match(/\b(\d{1,4})\b/);
    if (m) bellBadge = Number(m[1]);
  }
  if (bellBadge !== null) say(`Bell badge shows ${bellBadge}`);

  // ---- 2. open it and wait for something to appear -------------------------
  const before = new Set(q('*'));
  const wasExpanded = bell.getAttribute('aria-expanded');

  function waitForPanel(timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        obs.disconnect();
        clearTimeout(timer);
        resolve(v);
      };
      const find = () => {
        if (bell.getAttribute('aria-expanded') === 'true' && wasExpanded !== 'true') {
          const c = bell.getAttribute('aria-controls');
          const target = c && document.getElementById(c);
          if (target && isVisible(target)) return target;
        }
        const candidates = q(
          '[role="menu"], [role="dialog"], [role="listbox"], [role="region"], ' +
            '[class*="notification" i], [class*="notif" i], [class*="popover" i], [class*="dropdown" i], [class*="panel" i], [class*="flyout" i]'
        ).filter((el) => !before.has(el) && text(el).length > 0);
        if (candidates.length) return candidates.sort((a, b) => text(b).length - text(a).length)[0];
        return null;
      };
      const obs = new MutationObserver(() => {
        const p = find();
        if (p) finish(p);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const timer = setTimeout(() => finish(find()), timeoutMs);
      const p = find();
      if (p) finish(p);
    });
  }

  bell.click();
  say('Notification control opened');
  const panel = await waitForPanel(6000);

  if (!panel) {
    return {
      ok: false,
      code: 'PANEL_NOT_LOADED',
      frame: frameInfo(),
      log,
      evidence: { bellSelector, bellBadge },
      diagnostic: { bell: snapshot(bell, 2), bellParent: snapshot(bell.parentElement, 3) },
    };
  }
  say(`Notification panel appeared (${text(panel).length} chars)`);

  // ---- 3. read the DCM information --------------------------------------
  // An explicit count in a heading, tab or link wins.
  const headingCandidates = q('h1,h2,h3,h4,h5,h6,[role="tab"],[role="heading"],a,button,summary,legend,th', panel);
  let headingCount = null;
  for (const el of headingCandidates) {
    const n = P.extractCountFromText(text(el));
    if (n !== null) {
      headingCount = n;
      say(`DCM heading found: "${text(el).slice(0, 60)}"`);
      break;
    }
  }

  // Otherwise count rows.
  const rowEls = q('li, tr, [role="listitem"], [role="menuitem"], [role="row"], article, a', panel).filter((el) => {
    const len = text(el).length;
    return len > 3 && len < 400 && !q('li, tr, [role="listitem"], [role="menuitem"]', el).length;
  });
  const rowTexts = rowEls.map(text);
  const rowCounts = P.countDcmRows(rowTexts);
  if (rowCounts.dcmRowsTotal) say(`${rowCounts.dcmRowsTotal} DCM rows in panel, ${rowCounts.waiting} waiting`);

  const decision = P.decideCount({ headingCount, rowCounts });

  // ---- 4. put the page back --------------------------------------------
  try {
    if (bell.getAttribute('aria-expanded') === 'true') bell.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    say('Notification panel closed');
  } catch {
    /* best effort */
  }

  if (!decision) {
    return {
      ok: false,
      code: 'DCM_NOT_FOUND',
      frame: frameInfo(),
      log,
      evidence: { bellSelector, bellBadge, panelRows: rowTexts.length, panelTextLen: text(panel).length },
      diagnostic: { panel: snapshot(panel, 4) },
    };
  }

  say(`${decision.count} DCM case${decision.count === 1 ? '' : 's'} requiring response`);
  return {
    ok: true,
    frame: frameInfo(),
    count: decision.count,
    strategy: decision.strategy,
    evidence: { bellSelector, bellBadge, dcmRowsTotal: rowCounts.dcmRowsTotal, panelRows: rowTexts.length },
    log,
  };
})();
