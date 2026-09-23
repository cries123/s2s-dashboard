/**
 * Pure helpers for reading DCM case information out of page text.
 *
 * No DOM here. Loaded into the page before checks/dcm.js as a global so the
 * injected check can use it, and required directly by the test suite so the
 * exact code that runs in WebDCS is the code under test.
 */
(function (root, factory) {
  const api = factory();
  root.__webdcsDcmParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DCM = /\bDCM\b/i;

  /**
   * Statuses that mean the ball is in the dealer's court. Prefixes take \w* so
   * "response", "responding" and "awaiting" all land; "reply" is spelled out so
   * "replied" — which means the opposite — does not.
   */
  const AWAITING = /\b(respon\w*|repl(y|ies)|await\w*|pending|action (needed|required)|needs? (your )?(attention|response)|open|due|overdue|new)\b/i;

  /** Statuses that mean it is not waiting on us. */
  const RESOLVED = /\b(closed|resolved|complete[d]?|answered|replied|cancel+ed|archived)\b/i;

  /**
   * Which summary row answers "waiting for a response from us", best first.
   *
   * The DCM dashboard's own headline is "DEALER ACTION REQUIRED: PENDING
   * ACKNOWLEDGEMENT (n)" — cases the dealer has not yet picked up. "Past Due"
   * is a subset of those (a case is both), so it must never win while an
   * acknowledgement row is present, whatever order the rows arrive in. The
   * first real read picked "Past Due" purely because it came first.
   */
  const ROW_PRIORITY = [
    { re: /acknowledg/i, why: 'pending acknowledgement' },
    { re: /dealer action|action (needed|required)/i, why: 'dealer action required' },
    { re: /respon/i, why: 'row about a response' },
    { re: /pending/i, why: 'pending row' },
    { re: /await/i, why: 'awaiting row' },
    { re: /overdue|past due/i, why: 'past-due row' },
    { re: /\bdue\b/i, why: 'due row' },
    { re: /\b(new|open)\b/i, why: 'new/open row' },
  ];

  function normalize(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
  }

  function isDcmText(text) {
    return DCM.test(normalize(text));
  }

  /**
   * "DCM Cases (7)", "7 DCM cases waiting", "DCM: 7", "DCM Cases 7" -> 7.
   * Returns null when there is no number attached to a DCM phrase.
   */
  function extractCountFromText(text) {
    const t = normalize(text);
    if (!DCM.test(t)) return null;
    const patterns = [
      /\bDCM\b[^0-9()]{0,40}\((\d{1,4})\)/i, // DCM Cases (7)
      /\b(\d{1,4})\s+DCM\b/i, // 7 DCM cases
      /\bDCM\b[^0-9]{0,40}?:\s*(\d{1,4})\b/i, // DCM: 7
      /\bDCM\b[^0-9]{0,40}?\b(\d{1,4})\b/i, // DCM cases 7
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function looksAwaitingResponse(text) {
    const t = normalize(text);
    if (RESOLVED.test(t) && !AWAITING.test(t)) return false;
    return AWAITING.test(t);
  }

  /**
   * Count notification rows that are DCM cases still waiting on the dealer.
   * A DCM row with no status text at all is counted — a notification that
   * exists is, by default, something to look at.
   *
   * Inside the DCM control itself the rows never say "DCM", so callers there
   * pass requireDcm: false.
   */
  function countDcmRows(rowTexts, { requireDcm = true } = {}) {
    let dcmRowsTotal = 0;
    let waiting = 0;
    for (const raw of rowTexts || []) {
      const t = normalize(raw);
      if (!t) continue;
      if (requireDcm && !isDcmText(t)) continue;
      dcmRowsTotal += 1;
      const hasStatusWords = AWAITING.test(t) || RESOLVED.test(t);
      if (!hasStatusWords || looksAwaitingResponse(t)) waiting += 1;
    }
    return { dcmRowsTotal, waiting };
  }

  /**
   * Decide the answer from whatever the page offered. An explicit "DCM (n)"
   * heading beats counting rows, because rows can be paginated or truncated.
   * Returns null when nothing was found — never a guessed 0.
   */
  function decideCount({ headingCount, rowCounts }) {
    if (typeof headingCount === 'number' && Number.isFinite(headingCount)) {
      return { count: headingCount, strategy: 'panel-heading' };
    }
    if (rowCounts && rowCounts.dcmRowsTotal > 0) {
      return { count: rowCounts.waiting, strategy: 'panel-rows' };
    }
    return null;
  }

  /**
   * Read the DCMNotification tooltip table: rows of cells, learned from the
   * first real run to be 3 rows x 2 cells. Two shapes are handled:
   *
   *   [label, count]   e.g. ["Awaiting Dealer Response", "3"] — the count in
   *                    its own cell. The row whose label mentions a response
   *                    wins; then any awaiting-style label; then, if there is
   *                    exactly one numeric row, that one.
   *   [case text]      no numeric cell — each row is a case; count the ones
   *                    that read as awaiting. A standalone 1–3 digit number in
   *                    an awaiting-style row ("You have 3 new cases") is taken
   *                    as a count instead; case ids are longer and never match.
   *
   * Returns count: null when it cannot decide — never a guessed 0 — with a
   * reason and the redacted rows so the format can be pinned down.
   */
  function parseNotificationRows(rows) {
    const redactedRows = (rows || []).map((cells) => (cells || []).map((c) => sanitizeAttr(normalize(c))));
    const labelled = [];

    for (const cells of rows || []) {
      const norm = (cells || []).map(normalize).filter(Boolean);
      if (!norm.length) continue;
      const numIdx = norm.findIndex((c) => /^\d{1,4}$/.test(c));
      if (numIdx >= 0) {
        labelled.push({ label: norm.filter((_, i) => i !== numIdx).join(' '), count: Number(norm[numIdx]) });
        continue;
      }
      const joined = norm.join(' ');
      const embedded = AWAITING.test(joined) && !RESOLVED.test(joined) ? joined.match(/(?<![#\d])\b(\d{1,3})\b(?!\d)/) : null;
      if (embedded) labelled.push({ label: joined.replace(embedded[0], '').replace(/\s+/g, ' ').trim(), count: Number(embedded[1]) });
    }

    const pick = (row, why) => ({
      count: row.count,
      reason: `${why}: "${sanitizeAttr(row.label)}"`,
      labelled: labelled.map((r) => ({ label: sanitizeAttr(r.label), count: r.count })),
      redactedRows,
    });

    if (labelled.length) {
      for (const tier of ROW_PRIORITY) {
        const row = labelled.find((r) => tier.re.test(r.label) && !RESOLVED.test(r.label));
        if (row) return pick(row, tier.why);
      }
      if (labelled.length === 1) return pick(labelled[0], 'only numeric row');
      return {
        count: null,
        reason: 'several numeric rows and none is marked as awaiting a response',
        labelled: labelled.map((r) => ({ label: sanitizeAttr(r.label), count: r.count })),
        redactedRows,
      };
    }

    const texts = (rows || []).map((cells) => (cells || []).map(normalize).join(' ')).filter(Boolean);
    const rc = countDcmRows(texts, { requireDcm: false });
    if (rc.dcmRowsTotal > 0) {
      return { count: rc.waiting, reason: `${rc.waiting} of ${rc.dcmRowsTotal} case rows read as awaiting`, labelled: [], redactedRows };
    }
    return { count: null, reason: 'no readable rows', labelled: [], redactedRows };
  }

  /** Attribute values in a diagnostic snapshot must not carry customer data. */
  function sanitizeAttr(value) {
    return String(value ?? '')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, '[vin]')
      .replace(/\d{7,}/g, (m) => '[' + m.length + 'd]')
      .slice(0, 80);
  }

  return {
    normalize,
    isDcmText,
    extractCountFromText,
    looksAwaitingResponse,
    countDcmRows,
    parseNotificationRows,
    decideCount,
    sanitizeAttr,
  };
});
