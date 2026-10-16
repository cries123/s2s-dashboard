/**
 * Which advisor a repair order is credited to.
 *
 * Jaryn showed 0 repair orders every month. PBS labels Jaryn's tickets
 * "JARYN", but the store's code map had {"jaryn": "JAY"} — entered back to
 * front — and "jay" is thrown away as junk, so every ticket vanished.
 *
 * Run: npm run test:advisors
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-advisors-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['server/pbs/pbsAdvisorName.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: entry,
  logLevel: 'error',
});
const { cleanPbsCsrName, isRealPbsAdvisorName, resolvePbsAdvisorCsr } = await import(pathToFileURL(entry).href);

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

// The map the store actually had, plus the built-in defaults.
const storeAliases = new Map([
  ['jaryn', 'JAY'],
  ['01', 'Frank'],
  ['lv4278', 'Lemmy'],
]);

check("Jaryn's tickets stay Jaryn's, whatever the back-to-front map says", cleanPbsCsrName('JARYN', storeAliases), 'Jaryn');
check('and are a real advisor', isRealPbsAdvisorName(cleanPbsCsrName('JARYN', storeAliases)), true);
check('resolved from the line or the header', resolvePbsAdvisorCsr('JARYN', 'JARYN', storeAliases), 'Jaryn');
check("Lemmy's login code still maps to Lemmy", cleanPbsCsrName('LV4278', storeAliases), 'Lemmy');
check("Frank's code still maps to Frank", cleanPbsCsrName('01', storeAliases), 'Frank');
check('a good alias is still used', cleanPbsCsrName('HUNTERA', new Map([['huntera', 'Hunter']])), 'Hunter');
check('"JAY" on its own is still junk, as before', isRealPbsAdvisorName('Jay'), false);
check('no aliases at all: JARYN is Jaryn', cleanPbsCsrName('JARYN'), 'Jaryn');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
