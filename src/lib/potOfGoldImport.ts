/**
 * Mapping an Op Code Frequency report onto the Pot of Gold board.
 *
 * This decides what advisors get paid, so it lives on its own and is tested.
 * The version that lived inline in the component had three silent failures:
 *
 *   1. Advisors were matched with `name.toLowerCase().includes('frank')`. Any
 *      advisor the report named differently — a login code, "HEALEY, LEMMY", a
 *      third advisor — fell through to `null` and was dropped without a word,
 *      and the import still reported success.
 *   2. A count was only assigned when the report mentioned that code, so codes
 *      it left out kept their previous value. A new import merged into the old
 *      one instead of replacing it.
 *   3. Op codes were compared exactly, so " fsc" never matched "FSC".
 */

export interface AdvisorUpsellRow {
  code: string;
  desc: string;
  [advisor: string]: string | number;
}

export interface ParsedAdvisor {
  name?: unknown;
  upsells?: Array<{ code?: unknown; count?: unknown }> | null;
}

export interface ImportResult<Row> {
  rows: Row[];
  /** Advisor keys the report actually covered. Others keep their existing counts. */
  matchedAdvisors: string[];
  /** Per matched advisor, the total the report accounts for. */
  totals: Record<string, number>;
  /** Names in the report that matched no known advisor — surfaced, never swallowed. */
  ignoredNames: string[];
}

/** Op codes differ in case and stray whitespace between reports. */
export function normalizeOpCode(code: unknown): string {
  return String(code ?? '').trim().toUpperCase();
}

/**
 * Reports name advisors inconsistently — "LEMMY", "LEMMY LV4278",
 * "HEALEY, LEMMY", sometimes a login code. Match on any whole word so all of
 * those land, while "Frankie" or "Franklin" does not quietly become Frank.
 */
export function resolveAdvisorKey(rawName: unknown, advisors: readonly string[]): string | null {
  const words = String(rawName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return advisors.find((a) => words.includes(a.toLowerCase())) ?? null;
}

/**
 * Fold a parsed report into the existing board.
 *
 * An advisor the report covers has every code rewritten, including the ones the
 * report omits — those become 0, because the report is the source of truth for
 * that advisor. An advisor the report does not mention is left exactly as-is,
 * so a single-advisor report never wipes someone else's numbers.
 */
export function applyUpsellReport<Row extends { code: string }>(
  rows: Row[],
  parsedAdvisors: ParsedAdvisor[],
  advisors: readonly string[]
): ImportResult<Row> {
  const matched = new Map<string, Map<string, number>>();
  const ignoredNames: string[] = [];

  for (const adv of parsedAdvisors ?? []) {
    const key = resolveAdvisorKey(adv?.name, advisors);
    if (!key) {
      const name = String(adv?.name ?? '').trim();
      if (name && !ignoredNames.includes(name)) ignoredNames.push(name);
      continue;
    }
    const byCode = matched.get(key) ?? new Map<string, number>();
    for (const u of adv?.upsells ?? []) {
      const code = normalizeOpCode(u?.code);
      if (!code) continue;
      // A report can list the same code twice (split across pages); add, don't replace.
      byCode.set(code, (byCode.get(code) ?? 0) + (Number(u?.count) || 0));
    }
    matched.set(key, byCode);
  }

  const totals: Record<string, number> = {};
  for (const key of matched.keys()) totals[key] = 0;

  const nextRows = rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    const code = normalizeOpCode(row.code);
    for (const [key, byCode] of matched) {
      const count = byCode.get(code) ?? 0;
      next[key] = count;
      totals[key] += count;
    }
    return next as Row;
  });

  return { rows: nextRows, matchedAdvisors: [...matched.keys()], totals, ignoredNames };
}
