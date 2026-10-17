/**
 * What an appointment is for: diagnosis, recall, oil change, or other.
 *
 * One set of rules for the PBS schedule and the PDF import, which used to
 * disagree. The old PBS rules matched bare substrings — "ECU" inside
 * SECURITY, any "UPDATE", "OIL" inside COIL, "CHECK" and "INSPECTION" (on
 * nearly every appointment, from the multi-point inspection) — and then let
 * oil win over everything, so an oil change booked with "RECALL 292" counted
 * as an oil change: 57 of 642 appointments in Sept–Oct 2026.
 *
 * Now each category needs real evidence, written the way this store's
 * appointments are actually written:
 *   diagnosis  the customer's voice: CUSTOMER STATES, CHECK AND ADVISE, a
 *              warning light, DIAGNOSE...
 *   recall     a recall or campaign line: RECALL 292, CAMPAIGN 304,
 *              "C/S: 302 -FRONT VIEW CAMERA...", ECU SW UPDATE, a Hyundai
 *              bulletin number (26-01-048H) — but not "check for recalls"
 *   oilChange  oil service itself: OIL & FILTER, SYNTHETIC OIL, OIL CHANGE,
 *              COMPLIMENTARY MAINTENANCE
 *
 * An appointment can be several. The primary category, which the daily counts
 * use, goes concern → recall → oil change; `tags` keeps all of them so the
 * schedule can show an oil change that also has a recall.
 *
 * Deliberately free of imports so the tests can bundle it on its own.
 */

export type ServiceCategory = 'diagnosis' | 'recall' | 'oilChange' | 'misc';

const DIAGNOSIS = [
  /\bCUSTOMER STATES?\b/,
  /\bCUST(?:OMER)? STATES?\b/,
  /\bC\/S\b(?!:?\s*[A-Z0-9]{2,4}\s*-)/, // "C/S VEHICLE HESITATES" — not a "C/S: 302 -" campaign line
  /\bCUSTOMER REQUEST(?:S|ED)? TO DIAGNOSE\b/,
  /\bDIAGNOS(?:E|IS|TIC|TICS)\b/,
  /\bTELL US MORE\b/,
  /\b(?:CHECK|INSPECT) AND ADVISE\b/,
  /\bCHECK ENGINE\b/,
  /\bWARNING (?:LIGHT|LAMP|MESSAGE)\b/,
  /\bLOST POWER\b/,
  /\bWON'?T START\b|\bNO START\b/,
];

// "Check for recalls" is a line added to many appointments; it is not recall work.
const NOT_RECALL_WORK = /\b(?:CHECK|LOOK|SEARCH)(?: FOR| ALL)?(?: OPEN| ANY)? (?:RECALLS?|CAMPAIGNS?)\b|\bRECALL CHECK\b/g;

const RECALL = [
  /\bRECALL\b/,
  /\bCAMPAIGN\b/,
  /\bC\/S:\s*[A-Z0-9]{2,4}\s*-/, // "C/S: 302 -FRONT VIEW CAMERA FCA UPDATE(26-01-048H)"
  /\bECU (?:SW|SOFTWARE) UPDATE\b/,
  /\bTSB\s*#?\s*\d/,
  /\b\d{2}-\d{2}-\d{3}H\b/, // Hyundai bulletin number, 26-01-048H
  /\(\s*\d{2}-?\d{2}-\d{3}[A-Z]?(?:-\d)?\s*\)/, // "(2601-042H)" as the PDF report prints it
  /\bANTI-?THEFT\b/,
];

const OIL = [
  /\bOIL\s*(?:AND|&|\/)\s*FILTER\b/,
  /\bOIL CHANGE\b/,
  /\bSYNTHETIC OIL\b/,
  /\bCOMPLIMENTARY MAINTENANCE\b/,
  /\bHYUNDAI COMPLIMENTARY\b/,
  /\bLOF\b/,
];

export function categorizeServiceText(text: string): { primary: ServiceCategory; tags: Array<Exclude<ServiceCategory, 'misc'>> } {
  const upper = String(text ?? '').toUpperCase().replace(/\s+/g, ' ');
  const tags: Array<Exclude<ServiceCategory, 'misc'>> = [];
  if (DIAGNOSIS.some((re) => re.test(upper))) tags.push('diagnosis');
  const recallText = upper.replace(NOT_RECALL_WORK, ' ');
  if (RECALL.some((re) => re.test(recallText))) tags.push('recall');
  if (OIL.some((re) => re.test(upper))) tags.push('oilChange');
  return { primary: tags[0] ?? 'misc', tags };
}
