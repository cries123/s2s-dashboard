/**
 * Pure helpers for the DPM (Dealer Performance) metric cards.
 *
 * Every DPM view uses the same card: a title bar, a headline value that HMA
 * colours red (failing) or blue (passing), then label/value rows such as
 * Target / Objective / Previous Year. The colour is the verdict — this never
 * re-derives pass/fail from thresholds it would have to guess, except for
 * the one rule the user stated outright: eMPI % must be at least 50.
 *
 * No DOM here. Loaded as a global before checks/dpm-cards.js and required by
 * the tests, so the code under test is the code Chrome runs.
 */
(function (root, factory) {
  const api = factory();
  root.__webdcsDpmParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalize(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
  }

  /** "PEP* ►" -> "PEP"; "Service Lane Technology ►" -> "Service Lane Technology". */
  function cleanTitle(text) {
    return normalize(text).replace(/[►▸▶➤]+\s*$/u, '').replace(/\*+\s*$/, '').trim();
  }

  /**
   * A CSS colour string -> 'red' | 'blue' | 'green' | 'neutral'.
   * DPM's failing red is a strong red with little green or blue; its passing
   * blue is a navy. Anything else (black labels, grey notes) is neutral.
   */
  function classifyColor(css) {
    const m = String(css ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return 'neutral';
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (r >= 150 && g <= 110 && b <= 110) return 'red';
    if (b >= 120 && r <= 110 && b > g) return 'blue';
    if (g >= 120 && r <= 110 && b <= 110) return 'green';
    return 'neutral';
  }

  /** "65.4%" -> 65.4, "-$9,468" -> -9468, "178 / 857" -> 178, "-" -> null. */
  function parseNumber(text) {
    const t = normalize(text).replace(/,/g, '');
    const m = t.match(/-?\$?\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return /^-/.test(t) && n > 0 ? -n : n;
  }

  /** The Target / Objective row of a card, if it has one. */
  function targetOf(card) {
    const row = (card.rows || []).find((r) => /target|objective|obj\b/i.test(r.label));
    return row ? row.value : null;
  }

  /**
   * Service Lane Technology: three percentages each measured against a 50%
   * objective. The user's rule is that eMPI must be at least 50; the other
   * two are reported the same way because they sit on the same card.
   */
  function evaluateServiceLane(cards, minimum = 50) {
    const card = (cards || []).find((c) => /service lane/i.test(c.title));
    if (!card) return null;
    const metric = (re) => {
      const row = (card.rows || []).find((r) => re.test(r.label));
      if (!row) return null;
      const value = parseNumber(row.value);
      const objMatch = normalize(row.note || '').match(/(\d+(?:\.\d+)?)\s*%/);
      const objective = objMatch ? Number(objMatch[1]) : minimum;
      return { label: row.label, value, objective, pass: value !== null && value >= objective, color: row.color };
    };
    return {
      status: card.headline ? card.headline.value : null,
      empi: metric(/e?mpi/i),
      appointment: metric(/appointment/i),
      laneCheckIn: metric(/lane check/i),
    };
  }

  /** Cards whose headline HMA has coloured red, with value and target for each. */
  function redCards(cards) {
    return (cards || [])
      .filter((c) => c.headline && c.headline.color === 'red')
      .map((c) => ({
        title: c.title,
        label: c.headline.label,
        value: c.headline.value,
        target: targetOf(c),
      }));
  }

  function summarize(cards) {
    return {
      total: (cards || []).length,
      red: redCards(cards),
      blue: (cards || []).filter((c) => c.headline && c.headline.color === 'blue').map((c) => c.title),
      serviceLane: evaluateServiceLane(cards),
    };
  }

  return { normalize, cleanTitle, classifyColor, parseNumber, targetOf, evaluateServiceLane, redCards, summarize };
});
