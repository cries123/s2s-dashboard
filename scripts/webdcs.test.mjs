/**
 * Tests for the WebDCS assistant.
 *   - the DCM text parser, loaded from the exact file the extension injects
 *   - the app's error/state wording
 *   - the extension and app agree on every error code
 * Run: npm run test:webdcs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
// The repo's package.json is "type": "module", so Node treats the extension's
// .js as ESM and require() hands back an empty namespace. The parser also
// registers itself on globalThis — that is how the injected check finds it in
// the page, and it is how the test reaches the exact code Chrome will run.
await import(pathToFileURL(resolve('webdcs-extension/checks/dcm-parse.js')).href);
const parse = globalThis.__webdcsDcmParse;
const extProtocol = await import(pathToFileURL(resolve('webdcs-extension/lib/protocol.js')).href);
const { redact } = await import(pathToFileURL(resolve('webdcs-extension/lib/logger.js')).href);

const outDir = mkdtempSync(join(tmpdir(), 's2s-webdcs-'));
const build = async (src, name) => {
  const out = join(outDir, `${name}.mjs`);
  await esbuild.build({ entryPoints: [src], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
};
const appProtocol = await build('src/lib/webdcs/protocol.ts', 'protocol');
const presentation = await build('src/lib/webdcs/presentation.ts', 'presentation');

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

console.log('\nDCM text parsing');
check('"DCM Cases (7)" -> 7', parse.extractCountFromText('DCM Cases (7)'), 7);
check('"7 DCM cases waiting" -> 7', parse.extractCountFromText('7 DCM cases waiting for response'), 7);
check('"DCM: 12" -> 12', parse.extractCountFromText('DCM: 12'), 12);
check('"DCM Cases 3" -> 3', parse.extractCountFromText('DCM Cases  3'), 3);
check('no number -> null', parse.extractCountFromText('DCM Cases'), null);
check('no DCM -> null even with a number', parse.extractCountFromText('Recalls (4)'), null);
check('"DCMX" is not DCM', parse.isDcmText('DCMX report'), false);
check('case-insensitive', parse.isDcmText('dcm case 4412'), true);

console.log('\nRow classification');
check('needs response', parse.looksAwaitingResponse('DCM case 1001 — response required'), true);
check('awaiting dealer', parse.looksAwaitingResponse('DCM 1002 awaiting dealer reply'), true);
check('closed is not waiting', parse.looksAwaitingResponse('DCM 1003 closed'), false);
check('resolved is not waiting', parse.looksAwaitingResponse('DCM 1004 resolved'), false);
{
  const r = parse.countDcmRows([
    'DCM case 1001 — response required',
    'DCM case 1002 closed',
    'Recall notice 88',
    'DCM case 1003', // no status words: counted
    'DCM case 1004 answered',
  ]);
  check('counts only DCM rows', r.dcmRowsTotal, 4);
  check('waiting excludes closed/answered', r.waiting, 2);
}

console.log('\nThe DCMNotification tooltip table (shape learned from the first real run)');
{
  const r = parse.parseNotificationRows([
    ['New Cases', '2'],
    ['Awaiting Dealer Response', '3'],
    ['Closed This Month', '9'],
  ]);
  check('the row about a response wins', r.count, 3);
  check('reason names the row', /response/i.test(r.reason), true);
  check('labels and counts come back as evidence', r.labelled.map((x) => x.count), [2, 3, 9]);
}
check('a single numeric row is taken as the count', parse.parseNotificationRows([['Cases', '4']]).count, 4);
check(
  'awaiting-style label wins when nothing says response',
  parse.parseNotificationRows([['Pending', '5'], ['Closed', '7']]).count,
  5
);
check(
  'several numeric rows and none awaiting is undecided, not 0',
  parse.parseNotificationRows([['Total', '5'], ['Closed', '7']]).count,
  null
);
check(
  'rows that are the cases themselves are counted',
  parse.parseNotificationRows([['Case 100123 — awaiting dealer response'], ['Case 100124 — closed'], ['Case 100125 — response required']]).count,
  2
);
check(
  'an embedded small number in an awaiting row is a count',
  parse.parseNotificationRows([['You have 3 new cases']]).count,
  3
);
check(
  'a case id is never mistaken for a count',
  parse.parseNotificationRows([['Case 1001 awaiting response']]).count,
  1
);
check('empty table is undecided', parse.parseNotificationRows([]).count, null);
check('cells are redacted in the diagnostic', parse.parseNotificationRows([['jane.doe@dealer.com', '1']]).redactedRows[0][0], '[email]');
check('countDcmRows can skip the DCM word inside the DCM control', parse.countDcmRows(['awaiting response', 'closed'], { requireDcm: false }).waiting, 1);

console.log('\nDeciding the answer');
check('heading count wins', parse.decideCount({ headingCount: 5, rowCounts: { dcmRowsTotal: 9, waiting: 2 } }), { count: 5, strategy: 'panel-heading' });
check('rows when no heading', parse.decideCount({ headingCount: null, rowCounts: { dcmRowsTotal: 3, waiting: 1 } }), { count: 1, strategy: 'panel-rows' });
check('a heading of zero is a real zero', parse.decideCount({ headingCount: 0, rowCounts: { dcmRowsTotal: 0, waiting: 0 } }), { count: 0, strategy: 'panel-heading' });
check('nothing found is null, never 0', parse.decideCount({ headingCount: null, rowCounts: { dcmRowsTotal: 0, waiting: 0 } }), null);

console.log('\nRedaction');
check('email is masked', redact('sent to jane.doe@dealer.com today'), 'sent to [email] today');
check('VIN is masked', redact('vehicle 5NMS2DAJ5PH500781 arrived'), 'vehicle [vin] arrived');
check('long digit runs are masked', redact('case 20260923001'), 'case [11 digits]');
check('short numbers survive', redact('7 cases in 2 frames'), '7 cases in 2 frames');
check('attr sanitizer caps length', parse.sanitizeAttr('x'.repeat(200)).length, 80);

console.log('\nWording');
check('zero reads as a real answer', presentation.formatCaseCount(0), '0 DCM cases currently waiting for response');
check('singular', presentation.formatCaseCount(1), '1 DCM case waiting for response');
check('plural', presentation.formatCaseCount(7), '7 DCM cases waiting for response');
check('expired says log in again', presentation.describeError('SESSION_EXPIRED').title, 'WebDCS session expired. Please log in again.');
check('expired is a WebDCS action', presentation.describeError('SESSION_EXPIRED').needsWebDcsAction, true);
check('DCM_NOT_FOUND wants a diagnostic', presentation.describeError('DCM_NOT_FOUND').wantsDiagnostic, true);
check('ready can run', presentation.describeState('ready').canRun, true);
check('2fa cannot run', presentation.describeState('2fa').canRun, false);
check('every error code has wording', appProtocol.ERROR_CODES.every((c) => presentation.describeError(c).title.length > 0), true);

console.log('\nContract');
{
  const ext = new Set(Object.values(extProtocol.ERROR));
  const app = new Set(appProtocol.ERROR_CODES);
  const appOnly = ['EXTENSION_NOT_INSTALLED', 'UNSUPPORTED_BROWSER'];
  check('extension codes all exist in the app', [...ext].every((c) => app.has(c)), true);
  check('app codes beyond the extension are only the client-side ones', [...app].filter((c) => !ext.has(c)), appOnly);
  check('message names agree', Object.values(extProtocol.MSG).sort(), Object.values(appProtocol.MSG).sort());
  check('session states agree', Object.values(extProtocol.SESSION).sort(), [...appProtocol.SESSION_STATES].sort());
  check('protocol version agrees', extProtocol.PROTOCOL_VERSION, appProtocol.PROTOCOL_VERSION);
}
{
  const manifest = require(resolve('webdcs-extension/manifest.json'));
  const id = require('node:fs').readFileSync(resolve('webdcs-extension/.extension-id'), 'utf8').trim();
  check('manifest has the stable key', typeof manifest.key === 'string' && manifest.key.length > 100, true);
  check('app hardcodes the matching extension id', appProtocol.WEBDCS_EXTENSION_ID, id);
  check('only the scripting permission', manifest.permissions, ['scripting']);
  check('host access limited to hyundaidealer.com', manifest.host_permissions.every((h) => h.includes('hyundaidealer.com')), true);
  check('only the dashboard may connect', manifest.externally_connectable.matches, ['https://salestoservice.net/*', 'http://localhost/*']);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
