/**
 * The recall checker's rules, on examples taken from NHTSA and from the
 * store's own repair orders.
 *
 * The checker it replaced said "no recalls" for every VIN and listed the gas
 * model's recalls for hybrids and EVs. Run: npm run test:recalls
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-recalls-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({ entryPoints: ['server/recalls/vinRecalls.ts'], bundle: true, format: 'esm', platform: 'node', outfile: entry, logLevel: 'error' });
const R = await import(pathToFileURL(entry).href);

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; } else passed++;
}

// --- powertrain from the VIN decode (vPIC values seen 2026-10-16) ----------------------
check('Kona: BEV is electric', R.powertrainOf('BEV (Battery Electric Vehicle)', 'Electric'), 'ev');
check('Tucson Blue: HEV is hybrid', R.powertrainOf('HEV (Hybrid Electric Vehicle) - Level Unknown', 'Gasoline', 'Electric'), 'hev');
check('Elantra hybrid shows as "Mild HEV": still hybrid', R.powertrainOf('Mild HEV (Hybrid Electric Vehicle)', 'Gasoline', 'Electric'), 'hev');
check('plug-in', R.powertrainOf('PHEV (Plug-in Hybrid Electric Vehicle)', 'Gasoline', 'Electric'), 'phev');
check('gas', R.powertrainOf('', 'Gasoline'), 'ice');

// --- which names to ask NHTSA for ---------------------------------------------------------
const c = (model, powertrain, trim) => R.candidateNames({ model, powertrain, trim });
check('Kona Electric: every name NHTSA has used for it, base as fallback', c('Kona', 'ev'), { variants: ['KONA ELECTRIC', 'KONA EV', 'KONA BEV'], base: 'KONA', extras: [] });
check('Santa Fe hybrid', c('Santa Fe', 'hev').variants, ['SANTA FE HYBRID', 'SANTA FE HEV', 'SANTA FE HYBRID HEV']);
check('Tucson plug-in', c('Tucson', 'phev').variants, ['TUCSON PLUG-IN HYBRID', 'TUCSON PLUG-IN', 'TUCSON PHEV', 'TUCSON PLUG-IN HYBRID PHEV']);
check('gas Kona: just KONA', c('Kona', 'ice'), { variants: [], base: 'KONA', extras: [] });
check('Elantra N trim adds ELANTRA N', c('Elantra', 'ice', 'N').extras, ['ELANTRA N']);
check('Elantra N Line trim adds the N-LINE spellings', c('Elantra', 'ice', 'N Line').extras, ['ELANTRA N-LINE', 'ELANTRA N LINE']);
check('Santa Fe XL is its own base', c('Santa Fe XL', 'ice').base, 'SANTA FE XL');

// --- when the base model's recalls may not cover a hybrid / electric car ---------------------
const y2019 = ['ACCENT', 'IONIQ ELECTRIC', 'IONIQ HYBRID', 'IONIQ PLUG-IN', 'KONA', 'KONA ELECTRIC', 'TUCSON'];
const y2022 = ['TUCSON', 'TUCSON HYBRID', 'TUCSON PLUG-IN HYBRID', 'IONIQ 5'];
const y2026 = ['IONIQ 5 BEV', 'KONA ICE', 'SANTA FE HYBRID HEV', 'SANTA FE ICE', 'TUCSON HYBRID HEV', 'TUCSON ICE'];
check('2022 Tucson Hybrid: a gas Tucson exists, so "may not cover"', R.baseMayNotCoverCar({ model: 'Tucson', powertrain: 'hev' }, y2022), true);
check('2022 Ioniq 5: electric only, so its recalls are its own', R.baseMayNotCoverCar({ model: 'Ioniq 5', powertrain: 'ev' }, y2022), false);
check('2026 Ioniq 5 ("IONIQ 5 BEV" in the list): still its own', R.baseMayNotCoverCar({ model: 'Ioniq 5', powertrain: 'ev' }, y2026), false);
check('2026 Santa Fe Hybrid: "SANTA FE ICE" exists, so "may not cover"', R.baseMayNotCoverCar({ model: 'Santa Fe', powertrain: 'hev' }, y2026), true);
check('2019 Ioniq Electric: hybrid and plug-in versions exist', R.baseMayNotCoverCar({ model: 'Ioniq', powertrain: 'ev' }, y2019), true);
check('a gas car is never marked', R.baseMayNotCoverCar({ model: 'Kona', powertrain: 'ice' }, y2019), false);
// --- Hyundai's number, from NHTSA's remedy text -------------------------------------------
check('one number', R.hyundaiCodesFrom("Owners may contact Hyundai customer service at 1-855-371-9460. Hyundai's number for this recall is 214."), ['214']);
check('two numbers', R.hyundaiCodesFrom("Hyundai's numbers for this recall are 211 and 009G."), ['211', '009G']);
check('none', R.hyundaiCodesFrom('Owners may also contact the NHTSA hotline.'), []);
check('"253(H), 017G(G)" (24V065)', R.hyundaiCodesFrom("Hyundai's numbers for this recall are 253(H), 017G(G)."), ['253', '017G']);
check('"257/021G" (24V204)', R.hyundaiCodesFrom("Hyundai's number for this recall is 257/021G."), ['257', '021G']);
check('"272 (Hyundai) and 025G (Genesis)" (24V868)', R.hyundaiCodesFrom("Hyundai's numbers for this recall are 272 (Hyundai) and 025G (Genesis)."), ['272', '025G']);

// --- the store's repair orders (real line text, 2023-2026) ------------------------------------
const ro110361 = { soNumber: '110361', date: '2024-12-30', lines: [
  { requestCode: '272', concern: 'RECALL 272DTC P1A9096 CHECK FOR ICCU & FUSE REPLACEMENT& ICCU SOFTWARE UPDATE (TSB# 24-01-', correction: 'CHECKED FOR COES, NO DTCS FOUND. PERFORMED ICCU SOFTWARE UPDATE, PER TSB.41D225R0.4', labourLines: [{ opCode: '272', description: 'RECALL 272DTC P1A9096 CHECK FOR ICCU & FUSE REPLAC' }] },
  { requestCode: '9B5', concern: 'CAMPAIGN 9B5VCMS SOFTWARE UPDATE CHARGING LOGIC (TSB 24-01-051H).' },
] };
const ro105214 = { soNumber: '105214', date: '2023-10-27', lines: [
  { requestCode: '0', concern: 'RECALL 22-01-090HDRIVERS SIDE WIPER ARM REPLACEMENT(RECALL CAMPAIGN 233)', correction: '21D159R0 Drivers Side WiperArm Replacement' },
] };
const roOil = { soNumber: '115052', date: '2025-12-10', lines: [
  { requestCode: '0', concern: 'COMPLIMENTARY OIL FILTER', correction: 'PROVIDED COMPLIMENTARY OIL FILTER DUE TO INCORRECT RECALL NOTICE SENT.', labourLines: [{ opCode: '0', description: 'COMPLIMENTARY OIL FILTER' }] },
] };
const roOpen = { soNumber: '118000', date: '2026-10-15', open: true, lines: [{ requestCode: '290', concern: 'RECALL 290 TOW HITCH WIRING' }] };

check('found by request code', R.findRecallWork([ro110361, roOil], ['272']), { soNumber: '110361', date: '2024-12-30', open: false });
check('found by "RECALL CAMPAIGN 233" in the text when the code is 0', R.findRecallWork([ro105214], ['233']), { soNumber: '105214', date: '2023-10-27', open: false });
check('"RECALL 272DTC" does not count for campaign 27', R.findRecallWork([ro110361], ['27']), null);
check('an alphanumeric campaign (9B5)', R.findRecallWork([ro110361], ['9B5'])?.soNumber, '110361');
check('"incorrect recall notice" is not recall work', R.findRecallWork([roOil], ['0', '214']) === null || R.findRecallWork([roOil], ['214']) === null, true);
check('not on any repair order', R.findRecallWork([ro110361, ro105214, roOil], ['214']), null);
check('an open repair order shows as in progress', R.findRecallWork([roOpen], ['290']), { soNumber: '118000', date: '2026-10-15', open: true });
check('a finished one wins over an open one', R.findRecallWork([roOpen, { ...ro110361, lines: [{ requestCode: '290' }] }], ['290']).soNumber, '110361');
check('op code with a letter (304A) for campaign 304', R.lineHasCampaign({ labourLines: [{ opCode: '304A' }] }, '304'), true);
check('but 3041 is not 304', R.lineHasCampaign({ labourLines: [{ opCode: '3041' }] }, '304'), false);
check('no Hyundai number: nothing to match', R.findRecallWork([ro110361], []), null);

// --- when NHTSA's decoder is down: the profile says what the car is -------------------------------
const p = (year, model, make) => R.vehicleFromProfile('X', { year, model, make });
check('"TUCSON HYBRID" 2023', p('2023', 'TUCSON HYBRID'), { vin: 'X', year: '2023', make: 'HYUNDAI', model: 'TUCSON', trim: undefined, powertrain: 'hev' });
check('"2023 HYUNDAI TUCSON HYBRID BLUE" with no year field', p('', '2023 HYUNDAI TUCSON HYBRID BLUE'), { vin: 'X', year: '2023', make: 'HYUNDAI', model: 'TUCSON', trim: 'BLUE', powertrain: 'hev' });
check('"Kona Electric"', p('2019', 'Kona Electric').powertrain, 'ev');
check('"IONIQ 5" is electric', p('2024', 'IONIQ 5'), { vin: 'X', year: '2024', make: 'HYUNDAI', model: 'IONIQ 5', trim: undefined, powertrain: 'ev' });
check('"SANTA FE PLUG-IN HYBRID"', p('2022', 'SANTA FE PLUG-IN HYBRID').powertrain, 'phev');
check('"Santa Fe XL" keeps its name', p('2019', 'Santa Fe XL').model, 'SANTA FE XL');
check('"ELANTRA N LINE" keeps the trim for N-LINE', p('2021', 'ELANTRA N LINE'), { vin: 'X', year: '2021', make: 'HYUNDAI', model: 'ELANTRA', trim: 'N LINE', powertrain: 'ice' });
check('no year anywhere: nothing to look up', p('', 'Tucson'), null);

check('NHTSA lookup link', R.nhtsaVinLookupUrl('KM8K53AG1KU000000'), 'https://www.nhtsa.gov/recalls?vin=KM8K53AG1KU000000');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
