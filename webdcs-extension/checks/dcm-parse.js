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
   * What the DCMNotification tooltip actually holds, from the real rows read on
   * 2026-09-23:
   *
   *   Past Due = 1 · Pending Acknowledgment = 3 · Work In Progress = 0
   *
   * while the DCM dashboard said DEALER ACTION REQUIRED: PENDING
   * ACKNOWLEDGEMENT (4). The buckets are disjoint: a case that goes past due
   * leaves "Pending Acknowledgment" for "Past Due". So the number of cases
   * waiting on the dealer is the unacknowledged rows PLUS the overdue rows —
   * 1 + 3 = 4 — and never "Work In Progress" (already picked up) nor the
   * due-today / due-tomorrow / due-3-days slices, which are time views of the
   * same pending cases and would double count.
   */
  const UNACKNOWLEDGED = /acknowledg|dealer action|action (needed|required)|respon|await/i;
  const OVERDUE = /past due|overdue/i;
  const NOT_WAITING = /work in progress|\bwip\b|in progress|closed|resolved|complete|answered|replied|cancel|archived/i;

  /**
   * Fallback for tooltips that use none of the words above — one row wins,
   * best meaning first, so row order never decides.
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
      const safeLabelled = labelled.map((r) => ({ label: sanitizeAttr(r.label), count: r.count }));

      // The real tooltip: add every unacknowledged and overdue bucket.
      const waitingRows = labelled.filter(
        (r) => !NOT_WAITING.test(r.label) && (UNACKNOWLEDGED.test(r.label) || OVERDUE.test(r.label))
      );
      if (waitingRows.length) {
        return {
          count: waitingRows.reduce((n, r) => n + r.count, 0),
          reason: waitingRows.map((r) => `${sanitizeAttr(r.label)} ${r.count}`).join(' + '),
          labelled: safeLabelled,
          redactedRows,
        };
      }

      for (const tier of ROW_PRIORITY) {
        const row = labelled.find((r) => tier.re.test(r.label) && !RESOLVED.test(r.label) && !NOT_WAITING.test(r.label));
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

  // ---- the DCM dashboard case table -------------------------------------
  //
  // Columns as seen on 2026-09-23: Case Number | Due Date | VIN | Model |
  // Customer Name | Concern | Dealer Code | Role | Case Owner | Status.
  // Matched by header text so a reordered or added column cannot shift data
  // into the wrong field. Only the fields the dashboard shows are kept.
  const COLUMN_MATCHERS = {
    caseNumber: /case\s*(number|no\.?|#)/i,
    dueDate: /due/i,
    vin: /^\s*vin\s*$/i,
    model: /model/i,
    customerName: /customer/i,
    status: /status/i,
  };

  /** "09/28/2026" -> "2026-09-28" for sorting and comparison; null if unreadable. */
  function toIsoDate(mmddyyyy) {
    const m = normalize(mmddyyyy).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  /**
   * Turn a header row and body rows into cases. Returns null when the headers
   * do not look like a case table (no case-number and VIN columns), so the
   * caller can tell "wrong table" from "empty table".
   */
  function parseCaseTable(headers, rows) {
    const cols = {};
    (headers || []).forEach((h, i) => {
      const t = normalize(h);
      for (const [key, re] of Object.entries(COLUMN_MATCHERS)) {
        if (cols[key] === undefined && re.test(t)) cols[key] = i;
      }
    });
    if (cols.caseNumber === undefined || cols.vin === undefined) return null;

    const cell = (r, key) => (cols[key] === undefined ? '' : normalize(r[cols[key]]));
    const cases = (rows || [])
      .map((r) => ({
        caseNumber: cell(r, 'caseNumber'),
        dueDate: cell(r, 'dueDate'),
        dueDateIso: toIsoDate(cell(r, 'dueDate')),
        vin: cell(r, 'vin'),
        model: cell(r, 'model'),
        customerName: cell(r, 'customerName'),
        status: cell(r, 'status'),
      }))
      .filter((c) => c.caseNumber);

    return { columns: cols, cases };
  }

  /**
   * The cases waiting on the dealer, by each row's own status — the same rule
   * as the tooltip: unacknowledged or overdue, never in progress or closed.
   * A row with no status at all is kept; a case listed under "dealer action
   * required" with no status is still a case to look at.
   */
  function filterWaitingCases(cases) {
    return (cases || []).filter((c) => {
      const s = normalize(c.status);
      if (!s) return true;
      if (NOT_WAITING.test(s)) return false;
      return UNACKNOWLEDGED.test(s) || OVERDUE.test(s) || AWAITING.test(s);
    });
  }

  /** Soonest due first; undated last. */
  function sortByDue(cases) {
    return [...(cases || [])].sort((a, b) => {
      if (!a.dueDateIso && !b.dueDateIso) return 0;
      if (!a.dueDateIso) return 1;
      if (!b.dueDateIso) return -1;
      return a.dueDateIso.localeCompare(b.dueDateIso);
    });
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
    parseCaseTable,
    filterWaitingCases,
    sortByDue,
    toIsoDate,
    sanitizeAttr,
  };
});
