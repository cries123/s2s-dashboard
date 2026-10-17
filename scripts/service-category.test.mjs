/**
 * What an appointment is for — on text taken from the store's own schedule
 * (Sept–Oct 2026) and the PDF import's old test cases.
 *
 * Run: npm run test:categories
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-category-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({ entryPoints: ['server/dms/parsers/serviceCategory.ts'], bundle: true, format: 'esm', platform: 'node', outfile: entry, logLevel: 'error' });
const { categorizeServiceText } = await import(pathToFileURL(entry).href);

let passed = 0;
let failed = 0;
const cat = (t) => categorizeServiceText(t);
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; } else passed++;
}

// --- recalls the old rules counted as oil changes -------------------------------------------
check('oil change + RECALL 292: a recall, and also an oil change',
  cat('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE RECALL 292 3RD ROW QUARTER WINDOW GLASS PROTECTIVE FILM APPLICATION PERFORM MULTI POINT INSPECTION.'),
  { primary: 'recall', tags: ['recall', 'oilChange'] });
check('complimentary maintenance + CAMPAIGN 304',
  cat('HYUNDAI COMPLIMENTARY MAINTENANCE MOC ENHANCE FUEL SYSTEM CLEANER CAMPAIGN 304 INSTRUMENT CLUSTER S/W UPD (26-01-054H) PERFORM MULTI POINT INSPECTION.').primary, 'recall');
check('tire rotation + campaign 9C5', cat('TIRE ROTATION. BRAKE FLUID SERVICE CAMPAIGN 9C5 BMS BATTERY LOGIC IMPROVE(26-01-065H)').primary, 'recall');

// --- the "C/S: code -" campaign lines ----------------------------------------------------------
check('"C/S: 302 -FRONT VIEW CAMERA FCA UPDATE(26-01-048H)"', cat('C/S: 302 -FRONT VIEW CAMERA FCA UPDATE(26-01-048H) CHECK AND INFLATE TIRES TO MANUFACTURER SPECIFICATION.').primary, 'recall');
check('"C/S: P33 -CUST REQ ONLY ANTITHEFT PROT."', cat('C/S: 9D3 -ECM SW UPDATE - DTC P132700(26-01-039H) C/S: P33 -CUST REQ ONLY ANTITHEFT PROT. 25-BE-016H').primary, 'recall');
check('"Rotate Tires ... C/S: 9B5 -VCMS SW UPDATE"', cat('Rotate Tires (Includes Tire Pressure and Tread Wear Inspection) C/S: 9B5 -VCMS SW UPDATE CHRG LOGIC 24-01-051H-1').primary, 'recall');

// --- labelled recall for no recall reason ---------------------------------------------------------
check('a hesitation complaint is a diagnosis, not a recall',
  cat("CUSTOMER STATES VEHICLE HESITATES WHILE DRIVING, ACCELERATING, AND IDLING. NO LIGHTS TURN ON WHEN CUSTOIMER'S CONCERN HAPPENS. SOFTWARE UPDATE MAY BE NEEDED").primary, 'diagnosis');
check('a radio glitch is a diagnosis', cat("CUSTOMER STATES THE RADIO GLITCHES AND DOESN'T WORK WHEN DRIVING VEHICLE. THERE IS A NOTIFICATION ON THE SCREEN TO UPDATE").primary, 'diagnosis');
check('"ECU" inside SECURITY is not a recall', cat('INSTALL SECURITY FILM ON WINDOWS').primary, 'misc');
check('a navigation map update is not a recall', cat('UPDATE NAVIGATION MAPS').primary, 'misc');
check('"check for recalls" is not recall work', cat('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE. CHECK FOR OPEN RECALLS.'), { primary: 'oilChange', tags: ['oilChange'] });

// --- diagnosis needs the customer's voice, not the multi-point inspection ------------------------
check('MPI and tire pressure alone are not a diagnosis', cat('PERFORM MULTI POINT INSPECTION. CHECK AND INFLATE TIRES TO MANUFACTURER SPECIFICATION.').primary, 'misc');
check('concern + recall: the concern leads, the recall is kept',
  cat('CUSTOMER STATES THERE IS A WARNING MESSAGE TO CHECK THE FORWARD COLLISION SENSOR. RECALL 292 3RD ROW QUARTER WINDOW GLASS'),
  { primary: 'diagnosis', tags: ['diagnosis', 'recall'] });
check('"C/S VEHICLE HESITATES" (customer states) is a diagnosis', cat('C/S VEHICLE HESITATES ON TAKEOFF').primary, 'diagnosis');

// --- oil means oil ---------------------------------------------------------------------------------
check('"COIL" is not oil', cat('REPLACE IGNITION COIL').primary, 'misc');
check('a cabin filter is not an oil change', cat('REPLACE CABIN AIR FILTER').primary, 'misc');

// --- the PDF import's old cases still hold -------------------------------------------------------------
check('full synthetic', cat('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE').primary, 'oilChange');
check('complimentary', cat('HYUNDAI COMPLIMENTARY MAINTENANCE').primary, 'oilChange');
check('customer states + oil -> diagnosis', cat('CUSTOMER STATES THE A/C DOES NOT WORK, PERFORM FULL SYNTHETIC OIL & FILTER CHANGE').primary, 'diagnosis');
check('oil + bulletin number -> recall', cat('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE , FRONT SEAT BELT ANC CLIP INS(2601-042H)').primary, 'recall');
check('diag request', cat('CUSTOMER REQUEST TO DIAGNOSE A CHECK').primary, 'diagnosis');
check('brake fluid -> other', cat('Brake Fluid Service').primary, 'misc');
check('"replace oil" alone -> other', cat('CUSTOMER REQUESTS US TO REPLACE OIL').primary, 'misc');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
