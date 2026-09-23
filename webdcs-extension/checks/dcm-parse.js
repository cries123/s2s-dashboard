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
   */
  function countDcmRows(rowTexts) {
    let dcmRowsTotal = 0;
    let waiting = 0;
    for (const raw of rowTexts || []) {
      const t = normalize(raw);
      if (!isDcmText(t)) continue;
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
    decideCount,
    sanitizeAttr,
  };
});
