/**
 * The check that keeps the AI from inventing numbers, and the text it is shown.
 *
 * Run: npm run test:aitext
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-aitext-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({ entryPoints: ['server/ai/aiText.ts'], bundle: true, format: 'esm', platform: 'node', outfile: entry, logLevel: 'error' });
const A = await import(pathToFileURL(entry).href);

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

// --- reading numbers --------------------------------------------------------------------
check('money, commas and cents', A.numbersIn('Labor gross is $27,167.50 today'), ['27167.5']);
check('percent', A.numbersIn('trending to 64% of goal'), ['64']);
check('trailing .0 is the same number', A.numbersIn('1.0 hours'), ['1']);
check('several', A.numbersIn('19 of 21 showed, 2 did not'), ['19', '21', '2']);

// --- the check ------------------------------------------------------------------------
const facts = 'Labor gross so far this month: $27,167\nTrending as a share of goal: 64%\nNo-shows that day: 2';
check('a faithful rewording passes', A.unsupportedNumbers('Labor gross is at $27,167, 64% of goal, with 2 no-shows.', [facts]), []);
check('an invented number is caught', A.unsupportedNumbers('Labor gross is $27,167 and should reach $60,000.', [facts]), ['60000']);
check('a rounded number is caught', A.unsupportedNumbers('Labor gross is about $27,000.', [facts]), ['27000']);
check('words without numbers pass', A.unsupportedNumbers('A solid start to the day.', [facts]), []);

const notes = A.visitStoryText({
  lines: [
    { lineNumber: 1, concern: 'CUST STATES SQUEAL WHEN BRAKING', cause: 'FRONT PADS AT 2MM, ROTORS SCORED', correction: 'REPLACED FRONT PADS AND ROTORS, ROAD TESTED OK', labourLines: [{ description: 'FRONT BRAKES', opCode: 'BRK1' }], partLines: [{ description: 'PAD SET' }] },
    { lineNumber: 2, concern: 'OIL CHANGE', correction: 'PERFORMED OIL AND FILTER CHANGE' },
  ],
});
check('the story text keeps concern, cause and correction', notes.includes('Cause (technician): FRONT PADS AT 2MM, ROTORS SCORED'), true);
check('and leaves op codes out', notes.includes('BRK1'), false);
check('an explanation that keeps "2 millimeters" passes', A.unsupportedNumbers('Your front brake pads were down to 2 millimeters.', [notes]), []);
check('one that adds a mileage is caught', A.unsupportedNumbers('Come back in 5,000 miles.', [notes]), ['5000']);
check('a visit with only a request string still has text', A.visitStoryText({ requests: 'OIL CHANGE; ROTATE TIRES' }), 'Work requested: OIL CHANGE; ROTATE TIRES');

const hist = A.historyText([
  { date: '2025-04-07', mileage: 32104, lines: [{ concern: 'OIL CHANGE', correction: 'PERFORMED OIL CHANGE' }] },
  { date: '2026-01-15', mileage: 38250, requests: 'ROTATE TIRES' },
  { date: '', requests: 'UNDATED' },
]);
check('history is newest first, one line a visit, undated left out', hist.split('\n'), [
  '2026-01-15 · 38,250 mi · ROTATE TIRES',
  '2025-04-07 · 32,104 mi · PERFORMED OIL CHANGE',
]);

// --- the briefing ---------------------------------------------------------------------
const f = { todayLabel: 'Friday, October 17', month: 'October', laborGross: '$27,167', laborGoal: '$85,000', laborTrending: '$54,334', laborPctOfGoal: '64%', lastDayLabel: 'Thursday', lastDayShowed: '19', lastDayBooked: '21', lastDayNoShows: '2', todayAppointments: '22' };
check('facts text has only filled facts', A.briefingFactsText(f).split('\n').length, 11);
const t = A.templateBriefing(f);
check('the template briefing reads', t, 'Labor gross is $27,167 so far in October, trending to $54,334 against a $85,000 goal (64%). Thursday, 19 of 21 appointments showed up and 2 didn\'t. 22 appointments are on the schedule today.');
check('and passes its own number check', A.unsupportedNumbers(t, [A.briefingFactsText(f)]), []);
check('no numbers yet', A.templateBriefing({ todayLabel: 'x', month: 'October' }), 'No numbers have been pulled for this month yet.');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
