/**
 * DCM check. Injected into each frame of the signed-in tab after dcm-parse.js.
 *
 * Learned from the first real run (2026-09-23): the dealer portal is a
 * SharePoint site at www.hyundaidealer.com, and the "bell" is
 *
 *   <div class="tooltipBox">
 *     <a id="ctl00_DCMNotification1_lnkCaption" class="caption"
 *        href="/_layouts/15/SSOSharepointSolution/SSORedirect.aspx">
 *     <table class="notification"><tbody> 3 x <tr> (2 cells) </tbody></table>
 *   </div>
 *
 * The link is an SSO redirect into WebDCS — clicking it navigates away and
 * never opens anything. The notification rows are already in the DOM beside
 * it as a hover tooltip. So strategy A hovers, never clicks, and reads the
 * table with textContent (innerText is empty for hidden elements, which is
 * why the first snapshot showed textLen 0 everywhere).
 *
 * Strategy B is the generic click-the-bell path, kept for other layouts, with
 * SSO links excluded so it can never navigate the user away.
 *
 * Nothing here reads cookies, storage, or sends a network request. Frames
 * that have neither return { skipped: true }.
 */
(async () => {
  const P = globalThis.__webdcsDcmParse;
  const log = [];
  const t0 = Date.now();
  const say = (m) => log.push(`+${String(Date.now() - t0).padStart(5)}ms ${m}`);

  const isVisible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const q = (sel, root = document, { visibleOnly = true } = {}) => {
    try {
      const all = [...root.querySelectorAll(sel)];
      return visibleOnly ? all.filter(isVisible) : all;
    } catch {
      return [];
    }
  };
  // innerText respects visibility and comes back '' for anything hidden;
  // textContent does not. A tooltip that is not currently shown still has its text.
  const text = (el) => {
    if (!el) return '';
    const t = el.innerText;
    return P.normalize(t && t.trim() ? t : el.textContent ?? '');
  };
  const frameInfo = () => ({ top: window === window.top, location: `${location.host}${location.pathname}` });

  // ---- diagnostics: structure only, never text --------------------------
  function snapshot(el, depth = 4, budget = { n: 140 }) {
    if (!el || budget.n <= 0 || el.nodeType !== 1) return null;
    budget.n -= 1;
    const pick = (a) => (el.getAttribute(a) ? P.sanitizeAttr(el.getAttribute(a)) : undefined);
    const node = {
      tag: el.tagName.toLowerCase(),
      id: pick('id'),
      cls: typeof el.className === 'string' && el.className ? P.sanitizeAttr(el.className) : undefined,
      role: pick('role'),
      aria: pick('aria-label'),
      title: pick('title'),
      href: el.tagName === 'A' ? P.sanitizeAttr((el.getAttribute('href') || '').split('?')[0]) : undefined,
      textLen: text(el).length,
      kids: el.children.length,
    };
    if (depth > 0 && el.children.length) {
      node.children = [...el.children].slice(0, 12).map((c) => snapshot(c, depth - 1, budget)).filter(Boolean);
    }
    return node;
  }

  const isSsoLink = (el) => el?.tagName === 'A' && /ssoredirect/i.test(el.getAttribute('href') || '');

  // ==== Strategy A: the DCMNotification control ============================
  const dcmControls = q('[id*="DCMNotification" i]', document, { visibleOnly: false });
  const dcmLink = dcmControls.find((el) => el.tagName === 'A') || dcmControls[0] || null;

  if (dcmLink) {
    say(`DCM notification control located (#${P.sanitizeAttr(dcmLink.id)})`);
    const box = dcmLink.closest('.tooltipBox') || dcmLink.parentElement;
    const table = box ? box.querySelector('table.notification') || box.querySelector('table') : null;

    if (table) {
      // Some controls only fill the tooltip on hover. A hover cannot navigate.
      for (const target of [dcmLink, box]) {
        for (const type of ['pointerover', 'mouseover', 'mouseenter']) {
          try {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
          } catch {
            /* ignore */
          }
        }
      }
      say('Hovered the notification control');

      const readRows = () =>
        [...table.querySelectorAll('tr')]
          .map((tr) => [...tr.querySelectorAll('td,th')].map(text))
          .filter((cells) => cells.some((c) => c.length > 0));

      let rows = readRows();
      if (!rows.length) {
        rows = await new Promise((resolve) => {
          const done = (r) => {
            obs.disconnect();
            clearTimeout(timer);
            resolve(r);
          };
          const obs = new MutationObserver(() => {
            const r = readRows();
            if (r.length) done(r);
          });
          obs.observe(box, { childList: true, subtree: true, characterData: true });
          const timer = setTimeout(() => done(readRows()), 3000);
        });
      }
      say(`${rows.length} notification row${rows.length === 1 ? '' : 's'} read`);

      const parsed = P.parseNotificationRows(rows);
      if (parsed.count !== null) {
        say(`${parsed.count} DCM case${parsed.count === 1 ? '' : 's'} requiring response — ${parsed.reason}`);
        return {
          ok: true,
          frame: frameInfo(),
          count: parsed.count,
          strategy: 'dcm-notification-table',
          // Category labels and counts only; the raw rows stay in the tab.
          evidence: { control: P.sanitizeAttr(dcmLink.id), rows: rows.length, labelled: parsed.labelled, reason: parsed.reason },
          log,
        };
      }

      say(`Notification table read but no count decided — ${parsed.reason}`);
      return {
        ok: false,
        code: 'DCM_NOT_FOUND',
        frame: frameInfo(),
        log,
        evidence: { control: P.sanitizeAttr(dcmLink.id), rows: rows.length, reason: parsed.reason },
        // Redacted cell text is included here on purpose: without it the row
        // format cannot be pinned down. Emails, VINs and long numbers are masked.
        diagnostic: { rows: parsed.redactedRows, table: snapshot(table, 3) },
      };
    }
    say('DCM control found but no table beside it — trying the generic bell');
  }

  // ==== Strategy B: a generic notification bell ============================
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
      if (isSsoLink(el) || el === dcmLink || dcmLink?.contains(el)) return false;
      const r = el.getBoundingClientRect();
      const clickable =
        ['A', 'BUTTON'].includes(el.tagName) || el.getAttribute('role') === 'button' || el.onclick || el.getAttribute('tabindex') !== null;
      return clickable && r.width < 200 && r.height < 120;
    });
    if (hits.length) {
      bell = hits[0];
      bellSelector = sel;
      break;
    }
  }

  if (!bell) {
    return { skipped: true, reason: dcmLink ? 'dcm-control-without-table' : 'no-bell-in-frame', frame: frameInfo(), log };
  }
  say(`Notification control located via ${bellSelector}`);

  let bellBadge = null;
  const badgeText = text(bell).match(/\b(\d{1,4})\b/);
  if (badgeText) bellBadge = Number(badgeText[1]);
  if (bellBadge !== null) say(`Bell badge shows ${bellBadge}`);

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
            '[class*="notification" i], [class*="notif" i], [class*="popover" i], [class*="dropdown" i], [class*="panel" i], [class*="flyout" i], [class*="tooltip" i]'
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

  const headingCandidates = q('h1,h2,h3,h4,h5,h6,[role="tab"],[role="heading"],a,button,summary,legend,th', panel);
  let headingCount = null;
  for (const el of headingCandidates) {
    const n = P.extractCountFromText(text(el));
    if (n !== null) {
      headingCount = n;
      say('DCM heading with a count found');
      break;
    }
  }

  const rowEls = q('li, tr, [role="listitem"], [role="menuitem"], [role="row"], article, a', panel).filter((el) => {
    const len = text(el).length;
    return len > 3 && len < 400 && !q('li, tr, [role="listitem"], [role="menuitem"]', el).length;
  });
  const rowTexts = rowEls.map(text);
  const rowCounts = P.countDcmRows(rowTexts);
  if (rowCounts.dcmRowsTotal) say(`${rowCounts.dcmRowsTotal} DCM rows in panel, ${rowCounts.waiting} waiting`);

  const decision = P.decideCount({ headingCount, rowCounts });

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
