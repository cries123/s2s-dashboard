/**
 * Tests for the Pot of Gold upsell import.
 * These cover the ways the old inline version lost numbers silently.
 * Run: npm run test:potofgold
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-pog-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/potOfGoldImport.ts'],
  bundle: true,
  format: 'esm',
  outfile: entry,
  logLevel: 'error',
});
const { applyUpsellReport, resolveAdvisorKey, normalizeOpCode } = await import(
  pathToFileURL(entry).href
);

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  } else passed++;
}

const ADVISORS = ['frank', 'lemmy'];
const board = () => [
  { code: 'AF', desc: 'ENGINE AIR FILTER', frank: 0, lemmy: 0 },
  { code: 'FSC', desc: 'MOC ENHANCE FUEL SYSTEM', frank: 0, lemmy: 0 },
  { code: 'CAF', desc: 'CABIN AIR FILTER', frank: 0, lemmy: 0 },
];

// --- advisor name matching -------------------------------------------------
check('plain first name matches', resolveAdvisorKey('LEMMY', ADVISORS), 'lemmy');
check('name with login code matches', resolveAdvisorKey('LEMMY LV4278', ADVISORS), 'lemmy');
check('last-name-first matches', resolveAdvisorKey('HEALEY, LEMMY', ADVISORS), 'lemmy');
check('mixed case matches', resolveAdvisorKey('Frank T.', ADVISORS), 'frank');
check('a different advisor does not match', resolveAdvisorKey('SMITH, JOHN', ADVISORS), null);
check('a longer word is not a partial match', resolveAdvisorKey('Franklin', ADVISORS), null);
check('empty name is not a match', resolveAdvisorKey('', ADVISORS), null);

// --- op code normalisation -------------------------------------------------
check('op code trims and upcases', normalizeOpCode('  fsc '), 'FSC');
check('missing op code is empty', normalizeOpCode(undefined), '');

// --- the silent-drop bug ---------------------------------------------------
{
  const r = applyUpsellReport(
    board(),
    [
      { name: 'FRANK', upsells: [{ code: 'AF', count: 8 }, { code: 'FSC', count: 30 }] },
      { name: 'SMITH, JOHN', upsells: [{ code: 'CAF', count: 12 }] },
    ],
    ADVISORS
  );
  check('unknown advisor is reported, not swallowed', r.ignoredNames, ['SMITH, JOHN']);
  check('known advisor still imports', r.totals.frank, 38);
  check('unmentioned advisor is left alone', r.rows.map((x) => x.lemmy), [0, 0, 0]);
}

// --- the stale-count bug ---------------------------------------------------
{
  const existing = [
    { code: 'AF', desc: 'ENGINE AIR FILTER', frank: 99, lemmy: 5 },
    { code: 'FSC', desc: 'MOC ENHANCE FUEL SYSTEM', frank: 77, lemmy: 3 },
    { code: 'CAF', desc: 'CABIN AIR FILTER', frank: 55, lemmy: 1 },
  ];
  const r = applyUpsellReport(existing, [{ name: 'FRANK', upsells: [{ code: 'AF', count: 4 }] }], ADVISORS);
  check('codes the report omits are zeroed for that advisor', r.rows.map((x) => x.frank), [4, 0, 0]);
  check('the other advisor keeps their counts', r.rows.map((x) => x.lemmy), [5, 3, 1]);
  check('totals reflect only the report', r.totals.frank, 4);
}

// --- code matching ---------------------------------------------------------
{
  const r = applyUpsellReport(
    board(),
    [{ name: 'LEMMY LV4278', upsells: [{ code: ' fsc ', count: 6 }] }],
    ADVISORS
  );
  check('untidy op code still lands', r.rows.find((x) => x.code === 'FSC').lemmy, 6);
}

// --- a code listed twice ---------------------------------------------------
{
  const r = applyUpsellReport(
    board(),
    [{ name: 'FRANK', upsells: [{ code: 'AF', count: 3 }, { code: 'AF', count: 5 }] }],
    ADVISORS
  );
  check('a repeated code adds rather than replaces', r.rows.find((x) => x.code === 'AF').frank, 8);
}

// --- nothing usable --------------------------------------------------------
{
  const r = applyUpsellReport(board(), [{ name: 'SMITH, JOHN', upsells: [] }], ADVISORS);
  check('no match means no advisors changed', r.matchedAdvisors, []);
  check('the board is untouched', r.rows.map((x) => x.frank), [0, 0, 0]);
}

// --- malformed input -------------------------------------------------------
{
  const r = applyUpsellReport(
    board(),
    [{ name: 'FRANK', upsells: null }, { name: 'LEMMY', upsells: [{ code: 'AF', count: 'x' }] }],
    ADVISORS
  );
  check('a null upsell list does not throw', r.totals.frank, 0);
  check('a non-numeric count becomes zero', r.totals.lemmy, 0);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
