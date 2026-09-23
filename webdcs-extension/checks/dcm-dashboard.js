/**
 * DCM case details. Injected after dcm-parse.js into each frame of every
 * hyundaidealer.com tab; the one showing the DCM Dashboard has the table.
 *
 * Reads every table whose header row has a Case Number and a VIN column,
 * labels each with the section heading above it ("DEALER ACTION REQUIRED:
 * PENDING ACKNOWLEDGEMENT (4)", "WORK IN PROGRESS (0)"), and returns the
 * cases that are waiting on the dealer by their own status.
 *
 * This is the one check that returns customer names and VINs. They come back
 * only as structured fields in the result — never through the log, never in
 * a diagnostic — and the dashboard shows them without storing them. Read-only:
 * nothing is clicked, no cookies, storage or network.
 */
(async () => {
  const P = globalThis.__webdcsDcmParse;
  const log = [];
  const t0 = Date.now();
  const say = (m) => log.push(`+${String(Date.now() - t0).padStart(5)}ms ${m}`);

  const text = (el) => {
    if (!el) return '';
    const t = el.innerText;
    return P.normalize(t && t.trim() ? t : el.textContent ?? '');
  };
  const frameInfo = () => ({ top: window === window.top, location: `${location.host}${location.pathname}` });

  // Header row: a <thead> if there is one, else the first row with <th>s, else the first row.
  function headerCells(table) {
    const thead = table.tHead && table.tHead.rows[0];
    if (thead) return [...thead.cells].map(text);
    const withTh = [...table.rows].find((r) => r.querySelector('th'));
    if (withTh) return [...withTh.cells].map(text);
    return table.rows[0] ? [...table.rows[0].cells].map(text) : [];
  }

  function bodyRows(table, headerRow) {
    return [...table.rows]
      .filter((r) => r !== headerRow && !(table.tHead && table.tHead.contains(r)))
      .map((r) => [...r.cells].map(text))
      .filter((cells) => cells.some((c) => c));
  }

  // The nearest heading-like text above the table — walks up and back through
  // the DOM until it finds something short that reads as a section title.
  function sectionLabel(table) {
    let node = table;
    for (let hops = 0; hops < 12 && node; hops += 1) {
      let prev = node.previousElementSibling;
      while (prev) {
        const t = text(prev);
        if (t && t.length <= 120 && !prev.querySelector('table')) return t;
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return '';
  }

  const tables = [...document.querySelectorAll('table')];
  const sections = [];

  for (const table of tables) {
    const headers = headerCells(table);
    const headerRow = table.tHead ? null : [...table.rows].find((r) => r.querySelector('th')) || table.rows[0];
    const parsed = P.parseCaseTable(headers, bodyRows(table, headerRow));
    if (!parsed) continue;
    const label = sectionLabel(table);
    const declared = label.match(/\((\d{1,4})\)\s*$/);
    sections.push({
      label,
      declaredCount: declared ? Number(declared[1]) : null,
      cases: parsed.cases,
    });
    say(`Case table read: "${P.sanitizeAttr(label) || 'untitled'}" · ${parsed.cases.length} row${parsed.cases.length === 1 ? '' : 's'}`);
  }

  if (!sections.length) {
    return { skipped: true, reason: 'no-case-table-in-frame', frame: frameInfo(), log };
  }

  const all = sections.flatMap((s) => s.cases);
  const waiting = P.sortByDue(P.filterWaitingCases(all));
  say(`${waiting.length} of ${all.length} cases waiting on the dealer`);

  return {
    ok: true,
    frame: frameInfo(),
    count: waiting.length,
    cases: waiting,
    sections: sections.map((s) => ({ label: s.label, declaredCount: s.declaredCount, rows: s.cases.length })),
    strategy: 'dcm-dashboard-table',
    log,
  };
})();
