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
await import(pathToFileURL(resolve('webdcs-extension/checks/dpm-parse.js')).href);
const dpm = globalThis.__webdcsDpmParse;
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
// The real tooltip rows read on 2026-09-23, while the DCM dashboard said
// DEALER ACTION REQUIRED: PENDING ACKNOWLEDGEMENT (4). The buckets are
// disjoint — the overdue case has left "Pending Acknowledgment" for "Past Due"
// — so the answer is their sum, and Work In Progress is never counted.
{
  const r = parse.parseNotificationRows([
    ['Past Due', '1'],
    ['Pending Acknowledgment', '3'],
    ['Work In Progress', '0'],
  ]);
  check('the real tooltip adds past due to pending acknowledgment', r.count, 4);
  check('and shows the arithmetic', r.reason, 'Past Due 1 + Pending Acknowledgment 3');
  check('all three rows come back for the breakdown', r.labelled.map((x) => x.count), [1, 3, 0]);
}
check(
  'work in progress is never part of the total',
  parse.parseNotificationRows([['Pending Acknowledgment', '3'], ['Work In Progress', '2']]).count,
  3
);
check(
  'due-date slices are time views of the same cases and are not added',
  parse.parseNotificationRows([['Pending Acknowledgment', '4'], ['Due Today', '1'], ['Due Tomorrow', '1']]).count,
  4
);
check(
  'with no acknowledgement row, past due is still an answer',
  parse.parseNotificationRows([['Past Due', '1'], ['Due Today', '0'], ['Due Tomorrow', '1']]).count,
  1
);
check('either spelling of acknowledgement counts', parse.parseNotificationRows([['Pending Dlr Acknowledgement', '4']]).count, 4);
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

console.log('\nThe DCM Dashboard case table');
const HEADERS = ['Case Number', 'Due Date', 'VIN', 'Model', 'Customer Name', 'Concern', 'Dealer Code', 'Role', 'Case Owner', 'Status'];
const ROWS = [
  ['42863147-48', '09/28/2026', 'KM8R7DGEXRU746629', 'PALISADE NIGHT AWD', 'EFREN RUIZ', '', 'CA01W', 'Service', '', 'Pending Acknowledgement'],
  ['43090134-15', '09/22/2026', 'KMHL14JA7RA409026', 'SONATA SEL FWD', 'JORGE TORRES', '', 'CA01W', 'Service', '', 'Pending Acknowledgement'],
  ['42990561-28', '09/24/2026', '5NMZU3LB5HH036286', 'SANTA FE SPORT (AN) 2.4 THETA', 'TIFFANY NGUYEN', '', 'CA01W', 'Service', '', 'Pending Acknowledgement'],
];
{
  const t = parse.parseCaseTable(HEADERS, ROWS);
  check('columns are found by header text', t.columns, { caseNumber: 0, dueDate: 1, vin: 2, model: 3, customerName: 4, status: 9 });
  check('every row becomes a case', t.cases.length, 3);
  check('fields land in the right place', t.cases[0], {
    caseNumber: '42863147-48',
    dueDate: '09/28/2026',
    dueDateIso: '2026-09-28',
    vin: 'KM8R7DGEXRU746629',
    model: 'PALISADE NIGHT AWD',
    customerName: 'EFREN RUIZ',
    status: 'Pending Acknowledgement',
  });
}
{
  const reordered = parse.parseCaseTable(['Status', 'Customer Name', 'VIN', 'Case Number', 'Due Date'], [['Pending Acknowledgement', 'ANA REYES', '5NMS2DAJ5PH500781', '43000000-01', '10/01/2026']]);
  check('a reordered table still maps correctly', reordered.cases[0].customerName, 'ANA REYES');
  check('missing model column is simply blank', reordered.cases[0].model, '');
}
check('a table without a VIN column is not a case table', parse.parseCaseTable(['Name', 'Amount'], [['x', '1']]), null);
check('a table without a case-number column is not a case table', parse.parseCaseTable(['VIN', 'Owner'], [['x', 'y']]), null);
check('blank rows are dropped', parse.parseCaseTable(HEADERS, [['', '', '', '', '', '', '', '', '', '']]).cases.length, 0);
{
  const cases = parse.parseCaseTable(HEADERS, [
    ...ROWS,
    ['43111111-11', '09/30/2026', '5NMP2DG15SH053844', 'SANTA FE', 'E. KUNEMOTO', '', 'CA01W', 'Service', '', 'Work In Progress'],
    ['43222222-22', '09/30/2026', 'KMHL14JA7RA400000', 'SONATA', 'S. REYES', '', 'CA01W', 'Service', '', 'Closed'],
    ['43333333-33', '', 'KMHL14JA7RA400001', 'SONATA', 'NO STATUS', '', 'CA01W', 'Service', '', ''],
  ]).cases;
  const waiting = parse.filterWaitingCases(cases);
  check('in-progress and closed rows are not waiting', waiting.map((c) => c.caseNumber).includes('43111111-11') || waiting.map((c) => c.caseNumber).includes('43222222-22'), false);
  check('a row with no status is kept', waiting.map((c) => c.caseNumber).includes('43333333-33'), true);
  check('pending rows are waiting', waiting.length, 4);
  const sorted = parse.sortByDue(waiting);
  check('soonest due first', sorted[0].caseNumber, '43090134-15');
  check('undated last', sorted[sorted.length - 1].caseNumber, '43333333-33');
}
check('dates convert to ISO', parse.toIsoDate('09/22/2026'), '2026-09-22');
check('an unreadable date is null, not a guess', parse.toIsoDate('Sept 22'), null);
check('overdue reads as overdue', presentation.dueRelative('2026-09-22', '2026-09-23'), { label: '1 day overdue', tone: 'overdue' });
check('today reads as today', presentation.dueRelative('2026-09-23', '2026-09-23'), { label: 'due today', tone: 'today' });
check('tomorrow reads as soon', presentation.dueRelative('2026-09-24', '2026-09-23'), { label: 'due tomorrow', tone: 'soon' });
check('five days out reads as later', presentation.dueRelative('2026-09-28', '2026-09-23'), { label: 'due in 5 days', tone: 'later' });
check('no date, no label', presentation.dueRelative(null, '2026-09-23'), { label: '', tone: 'none' });
check('the DCM dashboard error tells you to open the tab', presentation.describeError('PAGE_NOT_OPEN').needsWebDcsAction, true);

console.log('\nDPM metric cards (shapes from the 2026-09-23 screenshots)');
check('DPM failing red classifies as red', dpm.classifyColor('rgb(192, 0, 0)'), 'red');
check('DPM passing navy classifies as blue', dpm.classifyColor('rgb(31, 78, 158)'), 'blue');
check('black labels are neutral', dpm.classifyColor('rgb(0, 0, 0)'), 'neutral');
check('unparseable colour is neutral', dpm.classifyColor('transparent'), 'neutral');
check('title arrow and asterisk are stripped', dpm.cleanTitle('PEP* ►'), 'PEP');
check('"65.4%" parses', dpm.parseNumber('65.4%'), 65.4);
check('"-$9,468" parses negative', dpm.parseNumber('-$9,468'), -9468);
check('"178 / 857" takes the first number', dpm.parseNumber('178 / 857'), 178);
check('"-" is null', dpm.parseNumber('-'), null);

const SERVICE_LANE = {
  title: 'Service Lane Technology',
  headline: { label: 'Current Status', value: 'FAIL', color: 'red' },
  rows: [
    { label: 'Appointment %', value: '27.8%', note: 'vs 50% Obj.', color: 'red' },
    { label: 'Lane Check-In %', value: '0.0%', note: 'vs 50% Obj.', color: 'red' },
    { label: 'eMPI %', value: '65.4%', note: 'vs 50% Obj.', color: 'blue' },
  ],
};
{
  const v = dpm.evaluateServiceLane([SERVICE_LANE]);
  check('eMPI 65.4 against a 50 objective passes', v.empi.pass, true);
  check('eMPI value is read', v.empi.value, 65.4);
  check('the objective is read from the note', v.empi.objective, 50);
  check('appointment 27.8 fails', v.appointment.pass, false);
  check('lane check-in 0.0 fails', v.laneCheckIn.pass, false);
  check('the card status comes through', v.status, 'FAIL');
}
check('no Service Lane card means null, not a verdict', dpm.evaluateServiceLane([{ title: 'PEP', headline: null, rows: [] }]), null);

const WOPR = [
  { title: 'WOPR Rank', headline: { label: 'Nation', value: '178 / 857', color: 'neutral' }, rows: [] },
  { title: 'Labor Only Claim', headline: { label: 'Reporting Month', value: '6.1%', color: 'red' }, rows: [{ label: 'Target', value: '6.0%', note: '', color: 'neutral' }] },
  { title: 'High Freq Labor Op Ratio', headline: { label: 'Reporting Month', value: '17.2%', color: 'red' }, rows: [{ label: 'Target', value: '15.0%', note: '', color: 'neutral' }] },
  { title: 'WTC Chargeback', headline: { label: 'Reporting Month', value: '0.0%', color: 'blue' }, rows: [{ label: 'Target', value: '5.0%', note: '', color: 'neutral' }] },
  { title: 'Recall Completed On Drive', headline: { label: 'Reporting Month', value: '91.1%', color: 'red' }, rows: [{ label: 'Target', value: '100.0%', note: '', color: 'neutral' }] },
  { title: 'PA Excessive Return', headline: { label: 'Reporting Month', value: '9.4%', color: 'blue' }, rows: [{ label: 'Target', value: '22.0%', note: '', color: 'neutral' }] },
  { title: 'SCPVS', headline: { label: 'Reporting Month', value: '85.9%', color: 'blue' }, rows: [{ label: 'Target', value: '100.0%', note: '', color: 'neutral' }] },
  { title: 'OSTD', headline: { label: 'Reporting Month', value: '-$9,468', color: 'blue' }, rows: [{ label: 'Target', value: '$0', note: '', color: 'neutral' }] },
  { title: 'PCR Return Rate', headline: { label: 'Reporting Month', value: '30.2%', color: 'red' }, rows: [] },
];
{
  const red = dpm.redCards(WOPR);
  check('WOPR: the four red cards are found', red.map((c) => c.title), ['Labor Only Claim', 'High Freq Labor Op Ratio', 'Recall Completed On Drive', 'PCR Return Rate']);
  check('each carries its value and target', red[0], { title: 'Labor Only Claim', label: 'Reporting Month', value: '6.1%', target: '6.0%' });
  check('a red card with no target row reports null', red[3].target, null);
  const s = dpm.summarize(WOPR);
  check('summary counts every card', s.total, 9);
  check('blue cards are listed by title', s.blue, ['WTC Chargeback', 'PA Excessive Return', 'SCPVS', 'OSTD']);
  check('a neutral headline is neither red nor blue', s.red.length + s.blue.length, 8);
}
{
  const DIAG = [
    { title: 'Avg RO Open Days', headline: { label: 'Current Month', value: '16.53', color: 'red' }, rows: [{ label: 'Objective *', value: '14.34', note: '', color: 'neutral' }] },
    { title: 'Avg Campaign RO Submission Days', headline: { label: 'Current Month', value: '1.98', color: 'blue' }, rows: [{ label: 'Objective*', value: '2.11', note: '', color: 'neutral' }] },
    { title: 'Initial Acceptance Rate', headline: { label: 'Last Month**', value: '91.94%', color: 'red' }, rows: [{ label: 'Objective*', value: '93.72%', note: '', color: 'neutral' }] },
  ];
  check('Diagnostic: objective rows are read as targets', dpm.redCards(DIAG).map((c) => c.target), ['14.34', '93.72%']);
}
check('the DPM view key joins what was detected', appProtocol.dpmViewKey({ top: 'AFTERSALES', sub: 'Warranty', mode: 'WOPR' }), 'AFTERSALES › Warranty › WOPR');
check('an undetected view still has a name', appProtocol.dpmViewKey({ top: null, sub: null, mode: null }), 'Unknown view');

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
