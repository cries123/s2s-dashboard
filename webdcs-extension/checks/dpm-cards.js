/**
 * DPM metric cards. Injected after dpm-parse.js into each frame of the DPM
 * tab. Reads every metric card on whichever DPM view is open and reports
 * which are red, plus the Service Lane Technology verdict.
 *
 * Written from screenshots of four DPM views, not from the DOM, so the card
 * boundary is found by shape rather than by class names: a title is any
 * short text ending in ► (the cards' link arrow); its card is the nearest
 * ancestor tall enough to hold a headline and a few rows that does not also
 * contain another title. Inside a card, leaf texts are clustered by vertical
 * position into rows — leftmost is the label, rightmost the value — and the
 * headline is the row whose value has the largest font. Colour is read from
 * computed style, which is how HMA marks pass and fail.
 *
 * Read-only: no clicks, no cookies, storage or network. Values are dealer
 * KPIs, not customer data. Frames without cards return { skipped: true }
 * with a structural snapshot so the shape can be pinned after one real look.
 */
(async () => {
  const P = globalThis.__webdcsDpmParse;
  const log = [];
  const t0 = Date.now();
  const say = (m) => log.push(`+${String(Date.now() - t0).padStart(5)}ms ${m}`);

  const isVisible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const text = (el) => {
    if (!el) return '';
    const t = el.innerText;
    return P.normalize(t && t.trim() ? t : el.textContent ?? '');
  };
  const frameInfo = () => ({ top: window === window.top, location: `${location.host}${location.pathname}` });

  // ---- titles ---------------------------------------------------------
  const TITLE_ARROW = /[►▸▶➤]\s*$/u;
  const all = [...document.querySelectorAll('body *')].filter(isVisible);
  const titleEls = all.filter((el) => {
    if (el.children.length > 3) return false;
    const t = text(el);
    return t.length > 2 && t.length < 60 && TITLE_ARROW.test(t) && !all.some((child) => child !== el && el.contains(child) && TITLE_ARROW.test(text(child)) && text(child).length < t.length);
  });

  if (!titleEls.length) {
    const sample = all.filter((el) => /►/u.test(text(el))).slice(0, 5).map((el) => ({ tag: el.tagName.toLowerCase(), textLen: text(el).length }));
    return { skipped: true, reason: 'no-dpm-cards-in-frame', frame: frameInfo(), log, diagnostic: { arrowElements: sample, title: document.title.slice(0, 80) } };
  }
  say(`${titleEls.length} card title${titleEls.length === 1 ? '' : 's'} found`);

  // ---- card container for a title ---------------------------------------
  function cardFor(titleEl) {
    let node = titleEl;
    for (let hops = 0; hops < 8 && node && node !== document.body; hops += 1) {
      node = node.parentElement;
      if (!node) break;
      const r = node.getBoundingClientRect();
      const otherTitle = titleEls.some((t) => t !== titleEl && node.contains(t));
      if (otherTitle) return node === titleEl.parentElement ? null : node.previousCard || null;
      if (r.height >= 110 && r.width >= 160) {
        // Must hold more than the title: at least three distinct text rows.
        const leaves = leafTexts(node);
        if (leaves.length >= 4) return node;
      }
    }
    return null;
  }

  function leafTexts(root) {
    const out = [];
    for (const el of root.querySelectorAll('*')) {
      if (!isVisible(el)) continue;
      const hasElementChild = [...el.children].some((c) => isVisible(c) && text(c).length > 0);
      if (hasElementChild) continue;
      const t = text(el);
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      out.push({ el, t, top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), font: parseFloat(cs.fontSize) || 0, color: cs.color });
    }
    return out;
  }

  // ---- rows and headline -------------------------------------------------
  function readCard(titleEl, container) {
    const title = P.cleanTitle(text(titleEl));
    const leaves = leafTexts(container).filter((l) => !titleEl.contains(l.el) && l.el !== titleEl);

    // cluster by vertical position (same visual row within 6px)
    const rows = [];
    for (const l of leaves.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const row = rows.find((r) => Math.abs(r.top - l.top) <= 6);
      if (row) row.items.push(l);
      else rows.push({ top: l.top, items: [l] });
    }

    const shaped = rows.map((r) => {
      const items = r.items.sort((a, b) => a.left - b.left);
      const label = items[0];
      const value = items.length > 1 ? items[items.length - 1] : null;
      const note = items.length > 2 ? items.slice(1, -1).map((i) => i.t).join(' ') : '';
      return {
        label: label.t,
        value: value ? value.t : '',
        note,
        color: value ? P.classifyColor(value.color) : 'neutral',
        font: value ? value.font : label.font,
        items: items.length,
      };
    });

    // headline: the row whose value has the largest font and reads as a number
    const numeric = shaped.filter((r) => r.value && /\d/.test(r.value));
    const headline = numeric.length ? numeric.reduce((a, b) => (b.font > a.font ? b : a)) : null;
    const detail = shaped.filter((r) => r !== headline && r.items >= 2 && r.label.length < 60).map(({ label, value, note, color }) => ({ label, value, note, color }));

    return {
      title,
      headline: headline ? { label: headline.label, value: headline.value, color: headline.color } : null,
      rows: detail,
    };
  }

  const cards = [];
  for (const t of titleEls) {
    const c = cardFor(t);
    if (!c) continue;
    const card = readCard(t, c);
    if (card.headline || card.rows.length) cards.push(card);
  }
  say(`${cards.length} card${cards.length === 1 ? '' : 's'} read`);

  // ---- which DPM view is this ------------------------------------------
  const TOP = ['HOME', 'SALES', 'AFTERSALES', 'CX', 'BRAND AMBASSADOR', 'RANKING', 'FINANCIAL', 'WEEKEND BUSINESS'];
  const SUB = ['Service', 'Warranty', 'Parts'];
  const MODE = ['WOPR', 'Diagnostic'];
  function activeAmong(labels) {
    const els = all.filter((el) => labels.includes(text(el)) && el.children.length <= 2);
    if (!els.length) return { present: false, active: null };
    const marked = els.find((el) => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') || /\b(active|selected|current)\b/i.test(el.className || ''));
    if (marked) return { present: true, active: text(marked) };
    // Otherwise the one whose background or weight differs from its siblings.
    const styled = els.map((el) => ({ el, bg: getComputedStyle(el).backgroundColor, w: getComputedStyle(el).fontWeight, u: getComputedStyle(el).textDecorationLine }));
    const counts = new Map();
    for (const s of styled) counts.set(`${s.bg}|${s.w}|${s.u}`, (counts.get(`${s.bg}|${s.w}|${s.u}`) || 0) + 1);
    const odd = styled.find((s) => counts.get(`${s.bg}|${s.w}|${s.u}`) === 1);
    return { present: true, active: odd ? text(odd.el) : null };
  }
  const view = { top: activeAmong(TOP).active, sub: activeAmong(SUB).active, mode: activeAmong(MODE).active };
  const dataUpdated = (all.map(text).find((t) => /^data updated/i.test(t)) || '').slice(0, 60);
  const reportingMonth = (() => {
    const sel = [...document.querySelectorAll('select')].find((s) => /^\d{4}-\d{2}$/.test(P.normalize(s.value)));
    return sel ? P.normalize(sel.value) : null;
  })();
  say(`View: ${[view.top, view.sub, view.mode].filter(Boolean).join(' › ') || 'not detected'}${dataUpdated ? ` · ${dataUpdated}` : ''}`);

  const summary = P.summarize(cards);
  say(`${summary.red.length} card${summary.red.length === 1 ? '' : 's'} in the red: ${summary.red.map((r) => r.title).join(', ') || 'none'}`);
  if (summary.serviceLane && summary.serviceLane.empi) {
    const e = summary.serviceLane.empi;
    say(`eMPI ${e.value}% vs ${e.objective}% objective — ${e.pass ? 'PASS' : 'FAIL'}`);
  }

  return {
    ok: true,
    frame: frameInfo(),
    strategy: 'dpm-cards',
    view,
    dataUpdated,
    reportingMonth,
    cards,
    summary,
    log,
  };
})();
